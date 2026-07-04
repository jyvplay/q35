// High-level research orchestrator.
// Steps:
//   1) Use Gemini/Gemma to generate K candidate hypotheses
//   2) Use SerpAPI and/or Jina Search to gather evidence URLs
//   3) Optional: Jina Reader to fetch passages
//   4) Use Gemini/Gemma + Jina rerank to score (support/refute/silent + strength) per hypothesis
//   5) Feed scored Evidence items into the BeliefSearch engine
//   6) When SPRT commits (or budget exhausts), synthesize the final answer

import {
  applyEvidence,
  newState,
  posterior,
  forceCommit,
  setAnchor,
} from "./gbse/engine";
import { Verdict, type BeliefState, type Evidence, type EngineConfig } from "./gbse/types";
import { defaultConfig } from "./gbse/config";
import { TIERS, pickTier } from "./gbse/tiers";
import { RelevanceGraph } from "./gbse/graph";
import {
  geminiGenerate,
  geminiGenerateJSON,
  type GeminiModel,
} from "./connectors/gemini";
import { jinaRerank, jinaSearch, type JinaSearchResult } from "./connectors/jina";
import { serpapiSearch, type SerpResult } from "./connectors/serpapi";

export interface ApiKeys {
  gemini?: string;
  jina?: string;
  serpapi?: string;
  serpapiProxy?: string;
}

export type SearchProvider = "serpapi" | "jina";

export interface OrchestratorOptions {
  query: string;
  keys: ApiKeys;
  hypothesisModel: GeminiModel;
  scoringModel: GeminiModel;
  searchProvider: SearchProvider;
  useJinaRerank: boolean;
  tierOverride?: number;
  onEvent: (evt: TraceEvt) => void;
  onState?: (state: BeliefState, graph: RelevanceGraph, totalTokens: number) => void;
  signal?: AbortSignal;
}

export interface TraceEvt {
  ts: number;
  phase: string;
  level: "info" | "warn" | "error" | "ok";
  message: string;
  data?: unknown;
}

export interface RunResult {
  state: BeliefState;
  graph: RelevanceGraph;
  finalAnswer: string;
  totalTokens: number;
  config: EngineConfig;
  tier: number;
  tierReason: string;
}

interface HypothesisGen {
  hypotheses: string[];
  priors?: number[];
  key_entities?: string[];
}

interface EvidenceScore {
  verdict: "support" | "refute" | "silent";
  strength: number;
  reliability: number;
  rationale: string;
}

// --------- helpers ---------

function emit(opts: OrchestratorOptions, e: Omit<TraceEvt, "ts">): void {
  opts.onEvent({ ts: Date.now(), ...e });
}

function safeUrlSourceId(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 64);
  }
}

// Map a generic search hit shape to a uniform `SearchHit`.
export interface SearchHit {
  title: string;
  link: string;
  snippet: string;
  source?: string;
}

function fromSerp(r: SerpResult): SearchHit {
  return { title: r.title, link: r.link, snippet: r.snippet, source: r.source };
}
function fromJina(r: JinaSearchResult): SearchHit {
  return { title: r.title, link: r.url, snippet: r.description, source: safeUrlSourceId(r.url) };
}

// --------- the run ---------

export async function runResearch(opts: OrchestratorOptions): Promise<RunResult> {
  if (!opts.keys.gemini) throw new Error("Gemini API key is required (used for hypothesis generation and scoring).");

  const { tier, reason: tierReason } = opts.tierOverride !== undefined
    ? { tier: opts.tierOverride, reason: "manual override" }
    : pickTier(opts.query, 0);
  const spec = TIERS[Math.max(0, Math.min(5, tier))];
  emit(opts, { phase: "tier", level: "ok", message: `Selected ${spec.name} — ${tierReason}`, data: spec });

  const cfg = defaultConfig({
    maxTokens: spec.maxTokens,
    maxSeconds: spec.maxSeconds,
  });

  let totalTokens = 0;

  // Tier 0 fast-path: simple query + high anchor coverage = skip hypothesis loop
  if (tier === 0 && opts.keys.jina) {
    emit(opts, { phase: "tier0", level: "ok", message: "Tier 0 fast-path: direct synthesis from anchor" });
    const anchorHits = await jinaSearch(opts.query, { apiKey: opts.keys.jina, count: 5, signal: opts.signal });
    const combinedLen = anchorHits.reduce((s, h) => s + (h.content?.length ?? 0), 0);
    if (anchorHits.length >= 2 && combinedLen > 800) {
      const response = await geminiGenerate(
        `Answer the user's question using ONLY the retrieved context below. If insufficient, say so honestly.\n\nQuestion: ${opts.query}\n\nContext:\n${anchorHits.map((h, i) => `[Source ${i+1}] ${h.title}\n${h.content}`).join("\n\n---\n\n")}`,
        { model: opts.scoringModel, apiKey: opts.keys.gemini, maxOutputTokens: 1024, temperature: 0.2, signal: opts.signal }
      );
      totalTokens += response.totalTokens;
      const graph = new RelevanceGraph(cfg.graph);
      graph.addNode("__query__", opts.query.slice(0, 80), 1.0);
      const state = newState(["Direct answer from anchor"], [1.0], cfg);
      setAnchor(state, Object.keys(state.hyps)[0], Verdict.SUPPORT, 0.6, cfg);
      return { state, graph, finalAnswer: response.text, totalTokens, config: cfg, tier, tierReason };
    }
  }

  // ---------- Phase 1: Hypothesis generation ----------
  emit(opts, { phase: "hypotheses", level: "info", message: `Generating ${spec.hypothesisCount || 4} candidate hypotheses with ${opts.hypothesisModel}…` });
  const hypPrompt = `You are a Bayesian researcher. For the user's question, propose ${spec.hypothesisCount || 4} DISTINCT, mutually-competing hypothesis answers. Each must be a single declarative sentence. Then list 3-6 key entities/concepts.

Question: """${opts.query}"""

JSON schema:
{
  "hypotheses": ["..."],            // ${spec.hypothesisCount || 4} items, competing, non-overlapping
  "priors": [0.5, ...],             // same length, in [0.01, 0.99]
  "key_entities": ["..."]
}`;
  const { value: hypJson, usage: hypUsage } = await geminiGenerateJSON<HypothesisGen>(hypPrompt, {
    model: opts.hypothesisModel,
    apiKey: opts.keys.gemini,
    maxOutputTokens: 1024,
    temperature: 0.4,
    signal: opts.signal,
  });
  totalTokens += hypUsage.totalTokens;
  if (!hypJson || !Array.isArray(hypJson.hypotheses) || hypJson.hypotheses.length === 0) {
    throw new Error("Hypothesis generator returned no valid hypotheses. Raw output: " + hypUsage.text.slice(0, 200));
  }
  const hypotheses = hypJson.hypotheses.slice(0, 12);
  const priors = (hypJson.priors ?? hypotheses.map(() => 0.5)).slice(0, hypotheses.length);
  const entities = (hypJson.key_entities ?? []).slice(0, 8);
  emit(opts, { phase: "hypotheses", level: "ok", message: `${hypotheses.length} hypotheses; ${entities.length} entities`, data: { hypotheses, entities } });

  // ---------- Phase 2: Construct belief state + graph ----------
  const state = newState(hypotheses, priors, cfg);
  const graph = new RelevanceGraph(cfg.graph);
  graph.addNode("__query__", `Q: ${opts.query.slice(0, 80)}`, 1.0);
  for (const hid of Object.keys(state.hyps)) {
    graph.addNode(hid, state.hyps[hid].text.slice(0, 80), 0.5);
    graph.addEdge("__query__", hid, +1.0);
  }
  for (const e of entities) {
    graph.addNode(`E:${e}`, e, 0.4);
    graph.addEdge("__query__", `E:${e}`, +0.6);
  }
  emit(opts, { phase: "state", level: "ok", message: `Belief state ${state.sid} initialized.` });
  opts.onState?.(state, graph, totalTokens);

  // ---------- Phase 3: Evidence gathering ----------
  const probesPerHyp = Math.max(2, Math.ceil(spec.evidenceProbes / Math.max(1, hypotheses.length)));
  emit(opts, { phase: "search", level: "info", message: `Gathering evidence via ${opts.searchProvider} (~${probesPerHyp} probes / hypothesis)…` });

  const hids = Object.keys(state.hyps);
  for (const hid of hids) {
    if (opts.signal?.aborted) break;
    if (state.committed) break;
    const h = state.hyps[hid];
    if (!h.alive) continue;

    // Build a targeted search query: hypothesis claim + key entities.
    const probeQuery = `${h.text} ${entities.slice(0, 3).join(" ")}`.slice(0, 256);
    let hits: SearchHit[] = [];
    try {
      if (opts.searchProvider === "serpapi") {
        if (!opts.keys.serpapi) throw new Error("SerpAPI key missing");
        const r = await serpapiSearch(probeQuery, {
          apiKey: opts.keys.serpapi,
          proxyBase: opts.keys.serpapiProxy,
          num: probesPerHyp + 2,
          signal: opts.signal,
        });
        hits = r.map(fromSerp);
      } else {
        if (!opts.keys.jina) throw new Error("Jina API key missing");
        const r = await jinaSearch(probeQuery, {
          apiKey: opts.keys.jina,
          count: probesPerHyp + 2,
          signal: opts.signal,
        });
        hits = r.map(fromJina);
      }
    } catch (err) {
      emit(opts, { phase: "search", level: "error", message: `Search failed for hypothesis: ${(err as Error).message}` });
      continue;
    }
    emit(opts, { phase: "search", level: "ok", message: `${hits.length} hits for "${h.text.slice(0, 50)}…"` });

    // Optional rerank with Jina
    if (opts.useJinaRerank && opts.keys.jina && hits.length > 1) {
      try {
        const docs = hits.map((h) => `${h.title}\n${h.snippet}`);
        const reranked = await jinaRerank(probeQuery, docs, { apiKey: opts.keys.jina, topN: Math.min(hits.length, probesPerHyp + 1), signal: opts.signal });
        hits = reranked.map((r) => hits[r.index]).filter(Boolean);
        emit(opts, { phase: "rerank", level: "ok", message: `Jina rerank → top ${hits.length}` });
      } catch (err) {
        emit(opts, { phase: "rerank", level: "warn", message: `Rerank failed (continuing): ${(err as Error).message}` });
      }
    }

    // Score each hit with the scoring model (judge model)
    for (const hit of hits.slice(0, probesPerHyp)) {
      if (opts.signal?.aborted) break;
      if (state.committed) break;
      const scorePrompt = `You are a strict Bayesian judge. Decide whether the SOURCE supports, refutes, or is silent on the HYPOTHESIS. Return ONLY this JSON:
{
  "verdict": "support" | "refute" | "silent",
  "strength": number in [0,1],     // 0=ambiguous, 1=decisive
  "reliability": number in [0,1],  // trust in the source quality
  "rationale": "<= 30 words"
}

HYPOTHESIS: ${h.text}
SOURCE TITLE: ${hit.title}
SOURCE URL: ${hit.link}
SOURCE EXCERPT: ${hit.snippet}`;
      try {
        const { value, usage } = await geminiGenerateJSON<EvidenceScore>(scorePrompt, {
          model: opts.scoringModel,
          apiKey: opts.keys.gemini,
          maxOutputTokens: 256,
          temperature: 0.0,
          signal: opts.signal,
        });
        totalTokens += usage.totalTokens;
        if (!value) {
          emit(opts, { phase: "score", level: "warn", message: `Skipped: judge returned invalid JSON.` });
          continue;
        }
        const verdict =
          value.verdict === "support" ? Verdict.SUPPORT :
          value.verdict === "refute" ? Verdict.REFUTE : Verdict.SILENT;
        const ev: Evidence = {
          sourceId: safeUrlSourceId(hit.link),
          text: `${hit.title} — ${value.rationale}`,
          verdict,
          reliability: Math.max(0, Math.min(1, value.reliability)),
          strength: Math.max(0, Math.min(1, value.strength)),
          tokenCost: usage.totalTokens,
          url: hit.link,
          ts: Date.now(),
        };
        applyEvidence(state, hid, ev, cfg);

        // Update graph: add the source as a node, sign by verdict.
        const nodeId = `S:${ev.sourceId}:${hit.link.slice(-12)}`;
        graph.addNode(nodeId, hit.title.slice(0, 64), ev.reliability);
        const signed = verdict === Verdict.SUPPORT ? +ev.strength :
                       verdict === Verdict.REFUTE ? -ev.strength : 0;
        if (signed !== 0) graph.addEdge(hid, nodeId, signed);

        emit(opts, {
          phase: "evidence",
          level: verdict === Verdict.SUPPORT ? "ok" : verdict === Verdict.REFUTE ? "warn" : "info",
          message: `[${verdict.toUpperCase()}] strength=${value.strength.toFixed(2)} rel=${value.reliability.toFixed(2)} for "${h.text.slice(0, 40)}…" — ${value.rationale}`,
          data: { hid, ev, hit, posterior: posterior(state) },
        });
        opts.onState?.(state, graph, totalTokens);

        if (state.committed) {
          emit(opts, { phase: "commit", level: "ok", message: `SPRT committed → ${state.committed} (${state.commitReason})` });
          break;
        }
      } catch (err) {
        emit(opts, { phase: "score", level: "error", message: `Judge call failed: ${(err as Error).message}` });
      }
    }
  }

  // ---------- Phase 4: Final synthesis ----------
  if (!state.committed) {
    forceCommit(state);
    emit(opts, { phase: "commit", level: "warn", message: `Budget/probes exhausted — forced commit: ${state.committed}` });
  }

  const synthPrompt = `You are a careful synthesizer. Use ONLY the surviving hypothesis and the evidence below. If support is weak, say so.

Question: ${opts.query}

Leading hypothesis: ${state.committed ? state.hyps[state.committed].text : "(unknown)"}
Commit reason: ${state.commitReason}

Evidence considered:
${Object.values(state.hyps).map(h => `• [${h.hid}] ${h.text}\n${h.evidence.map(e => `   - [${e.verdict}] (${e.sourceId}) ${e.text}`).join("\n")}`).join("\n\n")}

Write:
1) A direct answer (2-4 sentences).
2) Key evidence (bulleted).
3) Uncertainties / caveats.
4) Next probes (if any).`;

  const synth = await geminiGenerate(synthPrompt, {
    model: opts.scoringModel,
    apiKey: opts.keys.gemini,
    maxOutputTokens: 1024,
    temperature: 0.2,
    systemInstruction: "Be precise. Cite the hypothesis and source IDs. Never invent facts not in the evidence.",
    signal: opts.signal,
  });
  totalTokens += synth.totalTokens;
  emit(opts, { phase: "synthesis", level: "ok", message: `Final synthesis ready (${synth.totalTokens} tokens)` });

  // Anchor the committed hypothesis with the synthesis confidence (conservative).
  if (state.committed) setAnchor(state, state.committed, Verdict.SUPPORT, 0.5, cfg);

  return {
    state,
    graph,
    finalAnswer: synth.text,
    totalTokens,
    config: cfg,
    tier: spec.tier,
    tierReason,
  };
}
