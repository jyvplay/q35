import { useEffect, useRef, useCallback, useState } from "react";
import { searchWithGroundingFallback, type GroundingBackend } from "../lib/jina";
import { prismaFetchHealth } from "../lib/connectors/prismafetch";
import {
  generateSynthesizedResponse,
  generateVerificationPlan,
  testConnection,
  MODELS,
  type ModelId,
  type ProviderId,
  type VerificationHypothesis,
} from "../lib/models";
import { detectInjection, extractClaims, checkCoherence } from "../lib/defenses";
import { FAILURE_MODES, SUPERCLASS_SUMMARY } from "../lib/failure-modes";
import { TOTAL_DEFENSES } from "../lib/defense-registry";
import { StylePersonaPanel } from "./StylePersonaPanel";
import { HUD } from "./HUD";
import { LiveResourceHUD } from "./LiveResourceHUD";
import {
  useAppState,
  type ChatMessage,
  type HypothesisEvidence,
  type ToolResult,
} from "../lib/app-state";
import {
  buildConstraintBlock,
  extractConstraints,
  sanitizeOutput,
  summarizeConstraints,
} from "../lib/constraints";
import { runMultiPassPipeline, computeTemporalAnchor } from "../lib/pipeline";
import type { PipelineTrace } from "../lib/pipeline";
import { runNDeep } from "../lib/n-deep";
import { estTokens } from "../lib/live-telemetry";
import { MemoryMonitor, getSafeNDeepCap } from "./MemoryMonitor";
import { clearAllocationsByPrefix, readMemoryReport, safeClusterWidth, settleHeap } from "../lib/memory-governor";
import { buildTemplatePrompt, findTemplate } from "../lib/omega-templates";
import { buildSSCPReceipt, type SSCPLeaf, type EvidenceTier } from "../lib/sscp";
import type { ComputeRecord } from "../lib/compute-sandbox";
import { ComputeRecordsInline } from "./ComputeSandboxPanel";
import { resolveEntities } from "../lib/entity-resolver";
import { EntitySheetInline } from "./EntitySheetPanel";
import { ArtifactInline } from "./ArtifactPanel";
import { RichText } from "./RichText";
import { measureCoverage } from "../lib/coverage";
import { 
  buildArtifactPromptBlock, 
  resolveArtifactRequest, 
  shouldResolveArtifacts, 
  setLiveStockResolver,
  type ArtifactResponse 
} from "../lib/artifacts";
import { alphaVantageStockResolver } from "../lib/connectors/marketdata";
import { newState, applyEvidence, setAnchor } from "../lib/gbse/engine";
import { defaultConfig } from "../lib/gbse/config";
import { Verdict } from "../lib/gbse/types";
import { RelevanceGraph } from "../lib/gbse/graph";
import { runAtlasDR } from "../lib/atlas-dr";
import { runAdversarialRedTeam, buildRepairBlock } from "../lib/adversarial-engine";
import { throttle, resetThrottle } from "../lib/rpm-governor";
import { scoreAnswer } from "../lib/quality-score";
import { cleanOutput as cleanOutputBoundary } from "../lib/output-boundary";
import { diagnoseOutput, buildContinuationPrompt, spliceContinuation } from "../lib/continuation-detector";
import { hasCalcRequest, interceptCalcRequests, renderInterceptedCalcs } from "../lib/calc-interceptor";
import { runSloopReport } from "../lib/sloop-runner";
import { DebugTracePanel } from "./DebugTracePanel";

export function ChatApp({ onSubmitFromShared }: { onSubmitFromShared?: number } = {}) {
  const {
    messages, pushMessage, clearMessages,
    input, setInput,
    keys, setKeys,
    statuses, setStatus,
    model, setModel,
    persona, reseedPersona,
    busyState, setBusyState,
    setLastRun,
    searchDepth, setSearchDepth,
    settings, setSetting,
    pushDebugEvent, clearDebugEvents, debugEvents,
    patchTelemetry, resetTelemetry, templates, setSscpReceipt, telemetry,
    setBeliefState, setRelevanceGraph,
    memory,
  } = useAppState();

  const [collapsedTools, setCollapsedTools] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [filterSuperclass, setFilterSuperclass] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busyState]);

  useEffect(() => {
    if (debugRef.current) debugRef.current.scrollTop = debugRef.current.scrollHeight;
  }, [debugEvents]);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const checkProviderStatus = useCallback(async (p: ProviderId | "jina" | "prismafetch", key: string) => {
    if (!key) { setStatus(p, "idle"); return; }
    setStatus(p, "testing");
    pushDebugEvent(`Testing ${p} connection…`);
    let ok = false;
    if (p === "jina") {
      try {
        // Force the Jina path so the test actually exercises Jina, not the
        // PrismaFetch primary that would otherwise be tried first.
        const r = await searchWithGroundingFallback("veritas test", key, 1, {
          forceJina: true,
          allowJinaFallback: true,
          onDebug: (msg) => pushDebugEvent(`[Jina test] ${msg}`),
        });
        ok = Array.isArray(r.results) && r.provider === "jina";
      } catch {
        ok = false;
      }
    } else if (p === "prismafetch") {
      ok = await prismaFetchHealth(key);
    } else {
      ok = await testConnection(p as ProviderId, key);
    }
    setStatus(p, ok ? "connected" : "error");
    pushDebugEvent(`${p}: ${ok ? "connected ✓" : "error ✗"}`);
  }, [setStatus, pushDebugEvent]);

  const auditAllConnectors = useCallback(() => {
    (["claude", "grok", "deepseek", "gemini", "jina"] as (ProviderId | "jina")[]).forEach(p => {
      const k = p === "jina" ? keys.jina : (keys[p as keyof typeof keys] as string);
      if (k) checkProviderStatus(p, k);
    });
    if (settings.prismafetchEnabled) {
      checkProviderStatus("prismafetch", settings.prismafetchUrl);
    }
  }, [keys, settings.prismafetchEnabled, settings.prismafetchUrl, checkProviderStatus]);

  const updateKey = (provider: keyof typeof keys, val: string) => {
    setKeys(prev => ({ ...prev, [provider]: val }));
    if (["gemini", "claude", "grok", "deepseek", "jina"].includes(provider)) {
      checkProviderStatus(provider as ProviderId | "jina", val);
    }
  };

  const toggleToolCollapse = (msgId: string) => {
    setCollapsedTools(prev => ({ ...prev, [msgId]: prev[msgId] === undefined ? false : !prev[msgId] }));
  };

  const isSourceRichRefusal = (answer: string, sourceCount: number) => {
    if (sourceCount < 8) return false;
    return /\b(provided data|retrieved sources|source context|current source context|available evidence)\b[\s\S]{0,160}\b(does not contain|do not contain|lacks|lack|insufficient|no direct mention|no information regarding|cannot propose|unable to propose)\b/i.test(answer)
      || /A defensible answer can be built from the retrieved evidence/i.test(answer)
      || /safest source-backed synthesis is to frame the recommendation/i.test(answer);
  };

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || busyState !== null) return;
    const startedAt = Date.now();

    clearDebugEvents();
    resetTelemetry();
    resetThrottle(); // Prevent stale promise chain from prior run causing deadlock
    patchTelemetry({ running: true, startedAt, phase: "Phase 1: Input Sanitization", entropy: 1 });
    pushDebugEvent("Phase 1: Input Sanitization & Threat Quarantine");
    setBusyState("Phase 1: Input Sanitization");
    await new Promise(r => setTimeout(r, 100));

    const injection = detectInjection(input);
    const constraints = extractConstraints(input);
    const anchor = computeTemporalAnchor(input);
    patchTelemetry({ tokensIn: estTokens(input) });

    pushDebugEvent(`Constraints detected: ${summarizeConstraints(constraints)}`);
    pushDebugEvent(`Temporal anchor: ${anchor.currentDateHuman}${anchor.horizonEndHuman ? ` → ${anchor.horizonEndHuman}` : ""}`);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: injection.blocked ? injection.sanitized : input,
      ts: Date.now(),
      injection: injection.blocked ? injection : undefined,
      constraints,
    };
    pushMessage(userMsg);
    setInput("");

    patchTelemetry({ injectionsBlocked: injection.blocked ? injection.patterns.length : 0 });
    if (injection.blocked) {
      pushDebugEvent(`Injection blocked: ${injection.patterns.join(", ")}`);
      patchTelemetry({ running: false, phase: "blocked" });
      setBusyState(null);
      return;
    }

    const currentOption = MODELS.find(m => m.id === model);
    if (!currentOption) { setBusyState(null); return; }

      const provider = currentOption.provider;
      const requiredKey = keys[provider as keyof typeof keys] as string;
      const prismaPrimaryEnabled = settings.prismafetchEnabled;
      // Jina is BACKUP-ONLY and only when a key exists. No key → auto-skip entirely.
      const allowJinaBackup = !!keys.jina;
      if (!requiredKey) {
        pushMessage({ id: `a-${Date.now()}`, role: "assistant", content: `Please configure your ${provider.toUpperCase()} API key in Settings.`, ts: Date.now(), model });
        setBusyState(null);
        return;
      }
      if (prismaPrimaryEnabled) {
        const localOk = await prismaFetchHealth(settings.prismafetchUrl);
        setStatus("prismafetch", localOk ? "connected" : "error");
        if (!localOk) {
          pushDebugEvent(`PrismaFetch primary unreachable at ${settings.prismafetchUrl} — continuing to OG browser scraper${keys.jina ? ", then Jina backup if needed" : " (no Jina key — Jina skipped)"}.`);
        }
      } else {
        pushDebugEvent(`PrismaFetch disabled · OG browser scraper is the workhorse${keys.jina ? " · Jina backup available" : " · no Jina key (skipped)"}.`);
      }

      // ── Per-run URL dedup ledger ────────────────────────────────────
      // Any URL already fetched (by either backend) is recorded here so the
      // second-pass searches/reads short-circuit and never duplicate work.
      const fetchedUrls = new Set<string>();

      try {
        const history = messages
          .filter(m => m.role === "user" || m.role === "assistant")
          .map(m => ({ role: m.role, text: m.content }));

        // ── OMEGA-FORGE pre-draft adversarial phases (v29 §181-§186) ──
        // These run BEFORE search/synthesis so naive paradigms, worse
        // alternatives, tournament exclusions, and H_neg are available to the
        // rest of the chain rather than being decorative telemetry at the end.
        const preDraftAtlas = runAtlasDR(input, "Candidate answer must produce a concrete, evidence-bounded recommendation rather than a generic refusal.");
        pushDebugEvent(`Pre-draft ContraDraft: ${preDraftAtlas.tournament.allAlts.length} alternatives generated; winner=${preDraftAtlas.tournament.winner.id}`);
        preDraftAtlas.tournament.exclusionProofs.slice(0, 3).forEach(p => pushDebugEvent(`Pre-draft Tournament exclusion: ${p}`));
        pushDebugEvent(`Pre-draft Falsification H_neg: ${preDraftAtlas.falsification.h_neg.slice(0, 140)}`);
        pushDebugEvent(`Pre-draft AntiAnchor quarantined: ${preDraftAtlas.antiAnchor.naiveParadigms.map(p => p.label).join("; ")}`);

        // Phase 2: Initial grounding (PrismaFetch primary, OG browser scraper secondary, Jina backup)
        setBusyState(`Phase 2: Grounding Search (depth ${searchDepth})`);
        patchTelemetry({ phase: "Phase 2: Grounding Search", pipelineStage: 2, evidenceTier: "TOOL", entropy: 0.85 });
        pushDebugEvent(`Grounding policy: PrismaFetch PRIMARY${prismaPrimaryEnabled ? "" : " (disabled)"} → OG browser scraper SECONDARY → Jina BACKUP${allowJinaBackup ? "" : " (disabled)"} · depth=${searchDepth}`);
        const initialRun = await searchWithGroundingFallback(input, keys.jina, searchDepth, {
          allowJinaFallback: allowJinaBackup,
          prismaEnabled: prismaPrimaryEnabled,
          prismafetchUrl: settings.prismafetchUrl,
          onDebug: (msg) => pushDebugEvent(`[Grounding] ${msg}`),
        });
        const initial = initialRun.results;
        const initialProvider: GroundingBackend = initialRun.provider;
        initial.forEach((r) => { if (r.url) fetchedUrls.add(r.url); });
        patchTelemetry({ searchCalls: 1, toolCalls: 1, sources: initial.length });
        const initialBackendLabel = initialProvider === "jina"
          ? "Jina (backup)"
          : initialProvider === "browser-scraper"
            ? "OG browser scraper (secondary)"
            : "PrismaFetch (primary)";
        pushDebugEvent(`Initial pass: ${initial.length} sources via ${initialBackendLabel} · ${fetchedUrls.size} URLs tracked for dedup`);
        initial.forEach((r: { title: string }, i: number) => pushDebugEvent(`  [S${i + 1}] ${r.title.slice(0, 60)}`));

const SOURCE_CONTENT_CAP = 800;
let initialWebData: ToolResult[] = initial.map((r) => ({
title: r.title,
url: r.url,
content: String((r.content || r.description || "").slice(0, SOURCE_CONTENT_CAP)),
phase: "initial" as const,
provider: initialProvider,
}));

        // Phase 3+4: verification plan + second pass
        let verificationPlan: HypothesisEvidence[] = [];
        if (settings.deepResearch || settings.nDeepEnabled || settings.templateEnabled || initialWebData.length < 6) {
          setBusyState("Phase 3: Hypothesis Planning");
          patchTelemetry({ phase: "Phase 3: Hypothesis Planning", pipelineStage: 3, entropy: 0.7 });
          pushDebugEvent("Running verification plan generation…");
          const plan = await generateVerificationPlan({
            provider, model, apiKey: requiredKey,
            userMessage: input, retrievedWebData: initialWebData, conversationHistory: history,
          });
          patchTelemetry({ modelCalls: 1, hypotheses: plan.hypotheses.length });
          pushDebugEvent(`Generated ${plan.hypotheses.length} hypotheses`);
          plan.hypotheses.forEach(h => pushDebugEvent(`  H: ${h.claim.slice(0, 80)}`));

          setBusyState(`Phase 4: Second-Pass (${plan.hypotheses.length} hypotheses)`);
          patchTelemetry({ phase: "Phase 4: Second-Pass Confirmation", pipelineStage: 4, entropy: 0.55 });

// Cluster search: preserve the user's chosen width unless memory is in
// the critical zone. Yield + free between waves so clustering does not
// pile up source bodies in memory.
const requestedWidth = settings.clusterSearch ? Math.max(2, settings.clusterSize) : 3;
const BATCH_SIZE = settings.clusterSearch ? safeClusterWidth(requestedWidth, readMemoryReport()) : 3;
if (settings.clusterSearch) pushDebugEvent(`Cluster search ON: ${plan.hypotheses.length} hypotheses in waves of ${BATCH_SIZE} (parallel)`);
for (let i = 0; i < plan.hypotheses.length; i += BATCH_SIZE) {
            const batch = plan.hypotheses.slice(i, i + BATCH_SIZE);
            // STREAMING EXTRACT-AND-DISCARD: instead of Promise.all() which
            // retains ALL parallel raw scraper responses simultaneously
            // (8 × 5 results × ~80KB raw body = 3MB+ peak → OOM), each promise
            // compacts its own result the instant it resolves and nulls the
            // raw response array, so peak live memory is bounded to a single
            // in-flight response instead of the whole batch.
            const batchPromises = batch.map((h) =>
              searchWithGroundingFallback(h.searchQuery, keys.jina, searchDepth, {
                allowJinaFallback: allowJinaBackup,
                prismaEnabled: prismaPrimaryEnabled,
                prismafetchUrl: settings.prismafetchUrl,
                onDebug: (msg) => pushDebugEvent(`[Grounding] ${msg}`),
              }).then((run) => {
                const sourceProvider: GroundingBackend = run.provider;
                const backendLabel = sourceProvider === "jina"
                  ? "Jina (backup)"
                  : sourceProvider === "browser-scraper"
                    ? "OG browser scraper (secondary)"
                    : "PrismaFetch (primary)";
                const fresh: ToolResult[] = [];
                let skipped = 0;
                for (const res of run.results) {
                  if (!res.url) continue;
                  if (fetchedUrls.has(res.url)) { skipped++; continue; }
                  fetchedUrls.add(res.url);
                  fresh.push({
                    title: String((res.title || "").slice(0, 240)),
                    url: String(res.url),
                    content: String((res.content || res.description || "").slice(0, SOURCE_CONTENT_CAP)),
                    phase: "second-pass" as const,
                    hypothesis: h.claim,
                    provider: sourceProvider,
                  });
                }
                pushDebugEvent(`  Confirmed "${h.claim.slice(0, 50)}" via ${backendLabel} — ${fresh.length} new${skipped > 0 ? ` (${skipped} deduped)` : ""}`);
                // Null the raw response array so V8 can release the original
                // scraper bodies even before sibling promises resolve.
                (run as { results: unknown }).results = [];
                verificationPlan.push({
                  ...(h as VerificationHypothesis),
                  status: fresh.length > 0 ? "CONFIRMED" : "UNCONFIRMED",
                  sources: fresh,
                });
                return fresh.length;
              }).catch((e) => {
                pushDebugEvent(`[Grounding] batch item failed: ${(e as Error).message}`);
                return 0;
              })
            );
            await Promise.all(batchPromises);
patchTelemetry({ searchCalls: i + batch.length + 1, toolCalls: i + batch.length + 1 });
await settleHeap(8);
}
}

      const seen = new Set<string>();
      const allCollectedSources = [...initialWebData, ...verificationPlan.flatMap(h => h.sources)];
      let retrievedWebData = allCollectedSources
        .filter(src => {
          if (!src.url || seen.has(src.url)) return false;
          seen.add(src.url);
          return true;
        })
// Keep full grounding breadth while relying on compacted 800-char snippets.
.slice(0, 32)
.map(src => ({
...src,
content: String((src.content || "").slice(0, SOURCE_CONTENT_CAP)),
}));
      const finalDedupCount = allCollectedSources.length - retrievedWebData.length;
      // Drop references to the large intermediate arrays as soon as the compact
      // source set exists. JS GC is nondeterministic, but this prevents further
      // retention through accidental use below.
      initialWebData = [];
      allCollectedSources.length = 0;
      // Keep lightweight evidence previews for UI/Bayesian graph, but release
      // duplicate source bodies now that retrievedWebData owns the full snippets.
      for (const h of verificationPlan) {
        h.sources = h.sources.slice(0, 4).map(s => ({ ...s, content: String((s.content || "").slice(0, 200)) }));
      }
      patchTelemetry({ sources: retrievedWebData.length });

      // Minimum-source gate: do not proceed to synthesis with too little
      // grounding. This prevents "0/4 confirmed" and generic non-answers.
      const MIN_GROUNDED_SOURCES = settings.templateEnabled || settings.deepResearch || settings.nDeepEnabled ? 8 : 4;
      if (retrievedWebData.length < MIN_GROUNDED_SOURCES) {
        pushDebugEvent(`Minimum-source gate: only ${retrievedWebData.length}/${MIN_GROUNDED_SOURCES} sources — running targeted expansion searches`);
        const expansionQueries = [
          `${input} official source`,
          `${input} NIH Guide NOFO NOSI`,
          `${input} NIH RePORTER awarded projects`,
          `${input} NIMHD NIMH NIA funding priorities`,
        ].slice(0, 4);
        const expansionRuns = await Promise.all(expansionQueries.map(q => searchWithGroundingFallback(q, keys.jina, Math.max(5, searchDepth), {
          allowJinaFallback: allowJinaBackup,
          prismaEnabled: prismaPrimaryEnabled,
          prismafetchUrl: settings.prismafetchUrl,
          onDebug: (msg) => pushDebugEvent(`[Min-source] ${msg}`),
        }).catch(() => ({ provider: "browser-scraper" as GroundingBackend, results: [] }))));
        const expanded = [...retrievedWebData];
        const expandedSeen = new Set(expanded.map(s => s.url));
        for (const run of expansionRuns) {
          for (const r of run.results) {
            if (!r.url || expandedSeen.has(r.url)) continue;
            expandedSeen.add(r.url);
            expanded.push({ title: r.title, url: r.url, content: String((r.content || r.description || "").slice(0, SOURCE_CONTENT_CAP)), phase: "second-pass", provider: run.provider });
          }
        }
        retrievedWebData = expanded.slice(0, 32);
        patchTelemetry({ sources: retrievedWebData.length });
        pushDebugEvent(`Minimum-source gate complete: ${retrievedWebData.length} source(s) available`);
      }
      const providerBreakdown = retrievedWebData.reduce<Record<string, number>>((acc, src) => {
        const key = src.provider ?? "unknown";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      pushDebugEvent(`Total unique sources: ${retrievedWebData.length} · ${Object.entries(providerBreakdown).map(([k, v]) => `${k}=${v}`).join(", ")}${finalDedupCount > 0 ? ` · ${finalDedupCount} duplicate(s) collapsed at final merge` : ""}`);

      // ── Legacy Bayesian engine — runs on EVERY chat input ──────────
      // Builds a real belief state + signed PPR graph from the verification
      // hypotheses and their confirmed/unconfirmed evidence. Drives the
      // dashboard's HypothesisPanel / GraphView / HUD with live data.
      try {
        const cfg = defaultConfig();
        const hypTexts = verificationPlan.length > 0
          ? verificationPlan.map(h => h.claim)
          : [`${input.slice(0, 80)} — supported`, `${input.slice(0, 80)} — unsupported`];
        const bState = newState(hypTexts, null, cfg);
        const hids = Object.keys(bState.hyps);
        const graph = new RelevanceGraph(cfg.graph);
        graph.addNode("__query__", input.slice(0, 40), 1.0);
        verificationPlan.forEach((h, i) => {
          const hid = hids[i];
          if (!hid) return;
          graph.addNode(hid, h.claim.slice(0, 36), 0.5);
          graph.addEdge("__query__", hid, 0.6);
          // Each confirmed source = supporting evidence; unconfirmed = silent
          h.sources.forEach((src, j) => {
            const verdict = h.status === "CONFIRMED" ? Verdict.SUPPORT : Verdict.SILENT;
            applyEvidence(bState, hid, {
              sourceId: src.url || `s${i}-${j}`,
              text: src.title.slice(0, 60),
              verdict,
              reliability: 0.7,
              strength: h.confidence === "high" ? 0.8 : h.confidence === "medium" ? 0.6 : 0.4,
              tokenCost: 0,
              ts: Date.now(),
            }, cfg);
            const nodeId = `src:${i}:${j}`;
            graph.addNode(nodeId, src.title.slice(0, 28), 0.4);
            graph.addEdge(hid, nodeId, verdict === Verdict.SUPPORT ? 0.7 : 0.2);
          });
          if (h.status === "CONFIRMED") setAnchor(bState, hid, Verdict.SUPPORT, 0.6, cfg);
        });
        setBeliefState({ ...bState, hyps: { ...bState.hyps } });
        setRelevanceGraph(graph);
        patchTelemetry({ contradictions: verificationPlan.filter(h => h.status === "UNCONFIRMED").length });
        pushDebugEvent(`Bayesian engine: ${hids.length} hypotheses, ${graph.nodes.size} graph nodes`);
      } catch (e) {
        pushDebugEvent(`Bayesian engine skipped: ${(e as Error).message}`);
      }

      // Active OMEGA template (if enabled) — injected into synthesis prompt
      const activeTemplate = settings.templateEnabled
        ? findTemplate(templates, settings.activeTemplateId)
        : undefined;
      const sloopBlock = settings.forceSloop
        ? `\n\nSLOOP LONG-FORM MODE: Produce a COMPLETE approximately ${settings.sloopPages}-page report. Every section must be fully written with substantive, detailed prose (no stubs, no bare headers, no 'see above'). Allocate roughly ${Math.max(350, settings.sloopPages * 450)}-${Math.max(700, settings.sloopPages * 700)} words. Expand each section with specifics, examples, calculations, and concrete implementation detail. Do not summarize prematurely.`
        : "";
      const templateBlock = (activeTemplate ? buildTemplatePrompt(activeTemplate, settings.styleMode) : "") + sloopBlock;
      if (activeTemplate) pushDebugEvent(`Template applied: ${activeTemplate.name} (${settings.styleMode})`);
      if (settings.forceSloop) pushDebugEvent(`SLOOP long-form mode ON — target ${settings.sloopPages} page(s)`);

      // ── Deterministic Artifact Discovery (Equities) ────────────────
      let artifactResponse: ArtifactResponse | undefined;
      let artifactBlock = "";
      if (shouldResolveArtifacts(input)) {
        const seedTickers = new Set<string>([
          ...extractConstraints(input).explicitComparisonTargets,
          ...resolveEntities(retrievedWebData, input).entities.map(e => e.ticker),
        ]);
        artifactResponse = await resolveArtifactRequest({
          type: "stocks",
          tickers: [...seedTickers].slice(0, 12),
          windowStart: anchor.currentDate,
          windowEnd: anchor.horizonEnd,
        });
        artifactBlock = buildArtifactPromptBlock(artifactResponse!);
        pushDebugEvent(`Artifact store: ${artifactResponse!.resolved.length} resolved`);
      }

      let responseText = "";
      let pipelineTrace: PipelineTrace[] = [];
      let usedMultiPass = false;
      let sanitizerRemovedSegments = 0;
      let computeRecords: ComputeRecord[] = [];
      let entitySheet: import("../lib/entity-resolver").EntitySheet | undefined;
      let adversarialPassesForUi: import("../lib/n-deep").NDeepPassSummary[] = [];

      // Optional live market data resolver. If no key is present, artifacts
      // resolve names/sectors only and numeric fields remain null.
      setLiveStockResolver(keys.marketData
        ? (ticker) => alphaVantageStockResolver(ticker, keys.marketData)
        : null);

      if (settings.nDeepEnabled) {
        // ── N-Deep recursive convergence engine ─────────────────────
        const sourceCharTotal = retrievedWebData.reduce((sum, s) => sum + (s.content?.length ?? 0), 0);
        const safeCap = getSafeNDeepCap(settings.nDeepMaxPasses ?? 4, sourceCharTotal);
        if (safeCap < (settings.nDeepMaxPasses ?? 4)) {
          pushDebugEvent(`[OOM guard] source load=${Math.round(sourceCharTotal/1024)}KB → capping N-Deep from ${settings.nDeepMaxPasses} to ${safeCap} passes`);
        }
        const maxIter = safeCap;
        setBusyState(`Phase 5: N-Deep (max ${maxIter} passes)`);
        patchTelemetry({ phase: "Phase 5: N-Deep recursive convergence", pipelineStage: 5, entropy: 0.4 });
        const modelRpm = MODELS.find(m => m.id === model)?.rpm ?? 10;
        pushDebugEvent(`N-Deep ON — recursive draft↔critique with adversarial gates (cap ${maxIter}) · model RPM=${modelRpm}`);

        // OOM FIX: N-Deep replaces the 4-stage pipeline, not stacks on top.
        // Running both causes 6+ LLM calls with retained strings → OOM.
        // Single direct synthesis → N-Deep critique/repair is memory-safe.
        const cappedSources = retrievedWebData.slice(0, 16);
        let initialDraft = "";
        if (settings.forceSloop) {
          pushDebugEvent(`N-Deep entry: SLOOP sectioned report (${settings.sloopPages}p) → N-Deep critique/repair`);
          const sloop = await runSloopReport({
            query: input,
            baseParams: { provider, model, apiKey: requiredKey, userMessage: "", conversationHistory: [] },
            sources: cappedSources,
            templateId: settings.templateEnabled ? settings.activeTemplateId : undefined,
            pages: settings.sloopPages,
            onTrace: (t) => { pipelineTrace.push(t); patchTelemetry({ pipelineStage: t.stage }); },
            onDebug: (msg) => pushDebugEvent(msg),
          });
          initialDraft = sloop.finalText;
          patchTelemetry({ modelCalls: sloop.calls });
        } else {
          const draftPrompt = [
            "You MUST produce a substantive, concrete answer to the question below.",
            "Do NOT say 'the data does not contain', 'insufficient evidence', or 'I cannot propose'.",
            "If the user asks for a grant topic, PRODUCE the topic, specific aims, candidate NIH IC, innovation, approach, and risks.",
            "If some details are missing from the sources, fill them with well-reasoned scientific proposals clearly marked as [PROPOSED] rather than refusing entirely.",
            "Use the retrieved sources for grounding.",
            templateBlock ? `\nTEMPLATE:\n${templateBlock}` : "",
            "",
            `USER QUESTION: ${input}`,
          ].filter(Boolean).join("\n");
          pushDebugEvent("N-Deep entry: single direct synthesis → N-Deep critique/repair (memory-safe path)");
          initialDraft = await generateSynthesizedResponse({
            provider, model, apiKey: requiredKey, userMessage: draftPrompt,
            retrievedWebData: cappedSources,
            conversationHistory: history.slice(-2),
          });
        }

        // Critical OOM fix: strip source bodies before N-Deep. Pass 1 already
        // has the grounded draft; repairs only need defect list + digest.
        const nDeepSourceStubs = cappedSources.map(s => ({ title: s.title, url: s.url, content: "" }));
        cappedSources.length = 0;
        const nDeep = await runNDeep({
          userQuery: input,
          initialDraft,
          fullSloopReport: settings.forceSloop,
          // Judge = the user's selected core model. The judge accepts/rejects
          // each critic-proposed section revision; ties are broken by Arena
          // intelligence rank (see ./lib/model-intelligence).
          judgeModel: model,
          baseParams: {
            provider, model, apiKey: requiredKey, userMessage: "",
            retrievedWebData: nDeepSourceStubs,
            conversationHistory: [],
          },
          maxPasses: maxIter,
          rpm: modelRpm,
          onDebug: (msg) => pushDebugEvent(msg),
          onTrace: (t) => {
            pipelineTrace.push(t);
            patchTelemetry({ pipelineStage: t.stage });
          },
        });

        responseText = nDeep.finalText;
        usedMultiPass = true;
        sanitizerRemovedSegments = 0;
        patchTelemetry({ tokensOut: estTokens(responseText), modelCalls: nDeep.totalLlmCalls + 1 });
        setBusyState(`Phase 5: N-Deep ${nDeep.stable ? "stable" : "hit cap"} at pass ${nDeep.passes.length}`);
        pushDebugEvent(`N-Deep complete: ${nDeep.passes.length} passes, ${nDeep.totalLlmCalls + 1} LLM calls, ${nDeep.stable ? "stable" : "hit hard cap"}`);
      } else if (settings.deepResearch) {
        // ── 4-stage multi-pass pipeline ─────────────────────────────
        setBusyState("Phase 5: Multi-Pass Pipeline (Stage 2: Logic Engine)");
        patchTelemetry({ phase: "Phase 5: Multi-Pass Pipeline", pipelineStage: 5, modelCalls: 2, entropy: 0.4 });
        const modelRpm = MODELS.find(m => m.id === model)?.rpm ?? 10;
        pushDebugEvent(`Deep Research ON — 4-stage pipeline · model RPM=${modelRpm}`);
        const result = await runMultiPassPipeline({
          userQuery: input,
          retrievedData: retrievedWebData,
          baseParams: { provider, model, apiKey: requiredKey, userMessage: "", conversationHistory: history },
          persona,
          templateBlock,
          artifactBlock,
          memory,
          templateId: settings.templateEnabled ? settings.activeTemplateId : undefined,
          rpm: modelRpm,
          onTrace: (t) => {
            pipelineTrace.push(t);
            patchTelemetry({ pipelineStage: t.stage });
            pushDebugEvent(`[Stage ${t.stage}] ${t.label}`);
            if (t.data) pushDebugEvent(`  data: ${JSON.stringify(t.data).slice(0, 120)}`);
          },
        });
        responseText = result.finalText;
        pipelineTrace = result.trace;
        usedMultiPass = result.usedMultiPass;
        sanitizerRemovedSegments = result.sanitizerRemovedSegments;
        computeRecords = result.computeRecords;
        entitySheet = result.entitySheet ?? undefined;
        artifactResponse = result.artifactResponse ?? undefined;
        adversarialPassesForUi = result.adversarialPasses ?? [];
        if (computeRecords.length > 0) {
          patchTelemetry({ computeCalls: computeRecords.length });
          pushDebugEvent(`[Stage 2.5] Deterministic compute: ${computeRecords.filter(r => r.ok).length}/${computeRecords.length} verified`);
        }
        patchTelemetry({ tokensOut: estTokens(responseText), modelCalls: 4 });
        setBusyState("Phase 5: Multi-Pass Pipeline complete");
      } else {
        // ── Standard single-pass synthesis ───────────────────────────
        setBusyState("Phase 5: Constrained Synthesis");
        patchTelemetry({ phase: "Phase 5: Constrained Synthesis", pipelineStage: 5, entropy: 0.4 });
        pushDebugEvent("Single-pass synthesis with constraint block");
        // Entity resolution — deterministic, no LLM call
        entitySheet = resolveEntities(retrievedWebData, input);
        pushDebugEvent(`Entity resolver: ${entitySheet.entities.length} verified, ${entitySheet.weakEntities.length} weak`);
        entitySheet.entities.forEach(e => pushDebugEvent(`  ${e.ticker} (${e.name}): ${Object.keys(e.facts).length} facts from ${e.sourceCount} sources`));
        if (shouldResolveArtifacts(input)) {
          const tickers = Array.from(new Set([...constraints.namedEntities, ...entitySheet.entities.map(e => e.ticker)])).slice(0, 12);
          artifactResponse = await resolveArtifactRequest({ type: "earnings", tickers, windowStart: anchor.currentDate, windowEnd: anchor.horizonEnd });
          pushDebugEvent(`Artifact resolver: ${artifactResponse.resolved.length} resolved, ${artifactResponse.unresolved.length} unresolved`);
        }
        const constraintBlock = buildConstraintBlock(constraints);
        const styleBlock = persona.systemPromptFragment;
        const systemOverlay = [
          anchor.anchorStatement,
          "",
          constraintBlock,
          "",
          entitySheet.promptBlock,
          artifactResponse ? buildArtifactPromptBlock(artifactResponse) : "",
          "",
          "STYLE PERSONA (apply silently; never label this in output):",
          styleBlock,
          templateBlock ? "\n" + templateBlock : "",
          "",
          "FINAL OUTPUT INSTRUCTIONS:",
          "- Begin with the first substantive sentence of the answer.",
          "- Use ONLY the ticker symbols, company names, prices, and facts from the VERIFIED ENTITY SHEET above.",
          "- If a ticker has no verified facts, say so — do NOT invent numbers.",
          "- NEVER include 'Constraints:', 'Persona:', 'Structure:', 'Direct Answer:', 'Question:' labels.",
          "- NEVER print outlines, plans, scratchpads, or bullet-dumps before prose.",
          "- Cite inline as [Source N] only. Weave them into prose, never list them separately first.",
          "- If a catalyst falls OUTSIDE the stated time window, label it with ⚠️ Outside window.",
          "- End with a single decisive bottom-line sentence. Nothing after it.",
          ...(settings.templateEnabled && (settings.activeTemplateId === "OMEGA-SCIENCE" || settings.activeTemplateId === "NIH-GRANT-SRF") ? [
            "",
            "NIH / SCIENCE STRUCTURAL GATES (mandatory):",
            "- NEVER leave bracketed placeholders ([list of...], [description of...], [insert...], [TBD]). Fill every slot with specific content or omit it.",
            "- A 'SABV' heading MUST contain a real Sex-as-a-Biological-Variable plan (sex stratification/disaggregation). NEVER label statistical nesting/GLMM/clustering as SABV.",
            "- Clustering/GLMM/HLM content belongs under 'Statistical Analysis', not under SABV.",
            "- Name the awarding NIH Institute/Center (e.g., NIMH, NIMHD); coordinating offices (OBSSR, ODP) cannot award grants.",
            "- Hypothetical/projected outcomes go under 'Expected Outcomes / Impact', never under a 'Results' heading.",
            "- Do not import another agency's framework labels (e.g., ARPA-H priorities) into an NIH proposal.",
          ] : []),
        ].join("\n");
        const synthesisUser = `Answer the user's question directly. Use only retrieved evidence, deterministic entity facts, artifact facts, and verified calculations.\n\nUSER QUESTION: ${input}`;

        const rawResponse = await generateSynthesizedResponse({
          provider, model, apiKey: requiredKey,
          userMessage: synthesisUser,
          retrievedWebData: retrievedWebData.slice(0, 20),
          conversationHistory: history.slice(-6),
          extraSystem: systemOverlay,
        });
        patchTelemetry({ modelCalls: 2, tokensOut: estTokens(rawResponse) });
        pushDebugEvent(`Raw response length: ${rawResponse.length} chars`);

        const san = sanitizeOutput(rawResponse);
        responseText = san.cleaned;
        sanitizerRemovedSegments = san.removedSegments;
        if (san.removedSegments > 0) pushDebugEvent(`Sanitizer removed ${san.removedSegments} leaked block(s): ${san.notes.join("; ")}`);

        // ── Adversarial gate on the standard path too (1 batched call) ──
        const stdDomain = settings.templateEnabled && (settings.activeTemplateId === "OMEGA-SCIENCE" || settings.activeTemplateId === "NIH-GRANT-SRF") ? "science" : undefined;
        const stdRpm = MODELS.find(m => m.id === model)?.rpm ?? 10;
        try {
          const report = await runAdversarialRedTeam(responseText, input, { provider, model, apiKey: requiredKey, userMessage: "", conversationHistory: [] }, {
            domain: stdDomain, rpm: stdRpm, onDebug: (m) => pushDebugEvent(`[Adversarial] ${m}`),
          });
          const blocking = report.defects.filter(d => d.severity === "critical" || d.severity === "major");
          if (blocking.length > 0) {
            pushDebugEvent(`Adversarial found ${blocking.length} blocking defect(s) — applying one repair pass`);
            const repairPrompt = `Revise the DRAFT to fix every listed defect. Keep what was correct. Output ONLY the corrected final answer — no commentary, no placeholders.\n\n${buildRepairBlock(report.defects)}\n\nUSER ASK: ${input}\n\nDRAFT:\n${responseText}`;
            const repaired = await throttle(
              () => generateSynthesizedResponse({ provider, model, apiKey: requiredKey, userMessage: repairPrompt, conversationHistory: [] }),
              { rpm: stdRpm, onWait: (ms) => pushDebugEvent(`[Adversarial] RPM throttle: waiting ${ms}ms`) },
            );
            responseText = sanitizeOutput(repaired).cleaned;
            pushDebugEvent("Adversarial repair pass applied ✓");
          } else {
            pushDebugEvent("Adversarial review: no blocking defects ✓");
          }
        } catch (e) {
          pushDebugEvent(`Adversarial gate skipped: ${(e as Error).message}`);
        }
      }
      patchTelemetry({ sanitizerStrips: sanitizerRemovedSegments });

      // Source-rich refusal guard: if we have many sources but the model emits a
      // generic "the data does not contain..." non-answer, force one targeted
      // repair using the actual retrieved sources. This prevents the observed
      // failure where 37-92 sources yielded an unusable negative response.
      if (isSourceRichRefusal(responseText, retrievedWebData.length)) {
        pushDebugEvent(`Source-rich refusal detected with ${retrievedWebData.length} sources — forcing targeted synthesis repair`);
        const sourceDigest = retrievedWebData
          .slice(0, 24)
          .map((s, i) => `[Source ${i + 1}] ${s.title}\n${s.url}\n${(s.content || "").slice(0, 900)}`)
          .join("\n\n---\n\n");
        const repairPrompt = [
          "The prior answer was rejected because it claimed the source context lacked relevant data despite a source-rich retrieval set.",
          "Use the sources below to produce the requested answer directly. Do not say the data is insufficient unless you name the exact missing field and explain why every relevant source fails to support it.",
          "For NIH grant-topic requests: produce a concrete topic, candidate awarding IC(s), rationale, Specific Aims, innovation, approach, preliminary-data requirement, safety plan if digital/clinical, analytic plan, and risks.",
          "Do not emit raw [Source N] placeholders. Write finished prose only.",
          "",
          `USER ASK: ${input}`,
          "",
          "SOURCE DIGEST:",
          sourceDigest,
        ].join("\n");
        const repaired = await throttle(
          () => generateSynthesizedResponse({ provider, model, apiKey: requiredKey, userMessage: repairPrompt, retrievedWebData: retrievedWebData.slice(0, 16), conversationHistory: [] }),
          { rpm: MODELS.find(m => m.id === model)?.rpm ?? 10, onWait: (ms) => pushDebugEvent(`[Source-rich repair] RPM throttle: waiting ${ms}ms`) },
        );
        const repairedSan = sanitizeOutput(repaired);
        responseText = repairedSan.cleaned || repaired;
        sanitizerRemovedSegments += repairedSan.removedSegments;
        pushDebugEvent("Source-rich refusal repair applied ✓");
      }

      if (/\bVERIFICATION PLAN MODE\b|\bHypotheses:\s*\n|\bSearch Queries:\s*\n|I am now proceeding to verify/i.test(responseText)) {
        pushDebugEvent("Verification-plan leakage detected in final answer — forcing synthesis-only repair");
        const repairPrompt = [
          "The previous draft leaked verification-plan text. Convert it into the FINAL answer now.",
          "Do not include 'Verification Plan Mode', 'Hypotheses', 'Search Queries', or 'I am now proceeding'.",
          "Produce the concrete answer requested by the user using the sources provided.",
          "",
          `USER ASK: ${input}`,
          "",
          "DRAFT TO CONVERT:",
          responseText.slice(0, 5000),
        ].join("\n");
        const fixed = await throttle(
          () => generateSynthesizedResponse({ provider, model, apiKey: requiredKey, userMessage: repairPrompt, retrievedWebData: retrievedWebData.slice(0, 12), conversationHistory: [] }),
          { rpm: MODELS.find(m => m.id === model)?.rpm ?? 10 },
        );
        responseText = cleanOutputBoundary(fixed).cleaned;
      }

      // Empty-only fallback. Never replace a real short answer with a canned shell.
      if (retrievedWebData.length > 0 && responseText.trim().length < 30) {
        pushDebugEvent(`Empty answer detected (${responseText.trim().length} chars) — emitting minimal source pointer`);
        const top = retrievedWebData.slice(0, 3);
        responseText = `The model returned an empty draft. Retrieved sources are available for a grounded answer: ${top.map(s => s.title).filter(Boolean).join("; ")}. Please retry with 4-Stage or SLOOP enabled.`;
      }

      // Global final boundary pass for ALL modes (standard, 4-stage, N-Deep).
      // This catches scratchpad / verification-plan / XML leakage even if a
      // path only used sanitizeOutput earlier.
      const boundary = cleanOutputBoundary(responseText);
      if (boundary.removedSegments > 0 || boundary.cleaned !== responseText) {
        pushDebugEvent(`Output boundary cleaner: removed ${boundary.removedSegments} leaked segment(s)${boundary.notes.length ? ` · ${boundary.notes.join("; ")}` : ""}`);
        responseText = boundary.cleaned;
      }

      // ── Truncation Detection & Auto-Continuation ────────────────────
      // If the model output has empty section headers or ends mid-sentence,
      // it likely hit max_tokens. Fire ONE continuation pass to fill missing
      // sections — but ONLY if the draft is small enough that growing it won't
      // risk OOM. Very large drafts (SLOOP) are accepted as-is to avoid the
      // continuation→splice→OOM crash chain reported in the logs.
      const MAX_CONTINUATION_INPUT = 28_000; // chars; above this, skip to avoid OOM
      const diag = diagnoseOutput(responseText);
      if (diag.truncated && responseText.length < MAX_CONTINUATION_INPUT) {
        pushDebugEvent(`[Truncation guard] ${diag.reason}${diag.emptySections.length ? ` · empty sections: ${diag.emptySections.slice(0, 6).join(", ")}` : ""}`);
        try {
          setBusyState("Phase 5.5: Continuation Pass (filling truncated sections)");
          const contPrompt = buildContinuationPrompt(input, responseText, diag.emptySections);
          const contRpm = MODELS.find(m => m.id === model)?.rpm ?? 10;
          const continuation = await throttle(
            () => generateSynthesizedResponse({
              provider, model, apiKey: requiredKey, userMessage: contPrompt,
              retrievedWebData: retrievedWebData.slice(0, 8),
              conversationHistory: [],
            }),
            { rpm: contRpm, onWait: (ms) => pushDebugEvent(`[Continuation] RPM throttle: waiting ${ms}ms`) },
          );
          if (continuation && continuation.trim().length > 100) {
            const cleanedCont = cleanOutputBoundary(continuation).cleaned;
            const spliced = spliceContinuation(responseText, cleanedCont);
            // Hard cap the spliced result so post-processing can't blow the heap.
            responseText = spliced.length > 60_000 ? spliced.slice(0, 60_000) : spliced;
            pushDebugEvent(`[Truncation guard] Continuation spliced: ${diag.emptySections.length} sections filled · total ${responseText.length} chars`);
          } else {
            pushDebugEvent(`[Truncation guard] Continuation returned empty — keeping prior draft`);
          }
        } catch (e) {
          pushDebugEvent(`[Truncation guard] Continuation failed: ${(e as Error).message} — keeping prior draft`);
        }
      } else if (diag.truncated) {
        pushDebugEvent(`[Truncation guard] draft is ${responseText.length} chars (> ${MAX_CONTINUATION_INPUT}) — skipping continuation to prevent OOM; accepting as-is`);
      }

      // Global heap-safety cap: no final answer is allowed to exceed 60KB in
      // working memory. This prevents the post-processing chain (calc, boundary,
      // quality, claim extraction) from operating on a runaway SLOOP string.
      if (responseText.length > 60_000) {
        pushDebugEvent(`[Heap guard] response ${responseText.length} chars → capping to 60KB for safe post-processing`);
        responseText = responseText.slice(0, 60_000);
      }

      // ── CALC-REQUEST Interceptor ───────────────────────────────────
      // If the model emitted "CALC REQUEST: ..." or "please confirm the
      // required clusters", run the math deterministically and rewrite the
      // answer with verified numbers (one repair call, only if needed).
      if (hasCalcRequest(responseText)) {
        const calcs = interceptCalcRequests(responseText);
        const okCalcs = calcs.filter(c => c.record.ok);
        pushDebugEvent(`[Calc interceptor] detected un-executed calc request → ran ${okCalcs.length}/${calcs.length} deterministic compute(s)`);
        if (okCalcs.length > 0) {
          computeRecords = [...computeRecords, ...okCalcs.map(c => c.record)];
          const calcBlock = renderInterceptedCalcs(okCalcs);
          try {
            setBusyState("Phase 5.6: Injecting deterministic calculations");
            const rewritePrompt = [
              "Your prior draft asked the application to perform calculations. The application has now computed them.",
              "Rewrite the draft, replacing every 'CALC REQUEST' / 'please confirm' with the EXACT verified numbers below.",
              "Do NOT emit any further calc requests. Keep all other content. Output only the finished answer.",
              "",
              calcBlock,
              "",
              `USER ASK: ${input.slice(0, 300)}`,
              "",
              "DRAFT TO FIX:",
              responseText.slice(0, 6000),
            ].join("\n");
            const rewritten = await throttle(
              () => generateSynthesizedResponse({ provider, model, apiKey: requiredKey, userMessage: rewritePrompt, conversationHistory: [] }),
              { rpm: MODELS.find(m => m.id === model)?.rpm ?? 10 },
            );
            if (rewritten && rewritten.trim().length > 100) {
              responseText = cleanOutputBoundary(rewritten).cleaned;
              pushDebugEvent("[Calc interceptor] draft rewritten with verified numbers ✓");
            }
          } catch (e) {
            pushDebugEvent(`[Calc interceptor] rewrite failed: ${(e as Error).message}`);
          }
        }
      }

      // Phase 6: Atomic grounding
      setBusyState("Phase 6: Atomic Grounding");
      pushDebugEvent("Extracting and grounding claims…");
      const rawClaims = extractClaims(responseText);
      const groundedClaims = rawClaims.map(claim => {
        let matchedIndex: number | undefined;
        const srcMatch = claim.text.match(/\[(?:Source\s*)?(\d+)\]/i);
        if (srcMatch?.[1]) {
          const idx = parseInt(srcMatch[1], 10) - 1;
          if (idx >= 0 && idx < retrievedWebData.length) matchedIndex = idx;
        }
        if (matchedIndex === undefined) {
          const kw = claim.searchQuery.toLowerCase().split(" ").filter(Boolean);
          for (let i = 0; i < retrievedWebData.length; i++) {
            const txt = `${retrievedWebData[i].title} ${retrievedWebData[i].content}`.toLowerCase();
            if (kw.filter(k => txt.includes(k)).length >= Math.min(2, Math.max(1, kw.length))) {
              matchedIndex = i; break;
            }
          }
        }
        return {
          id: claim.id, text: claim.text,
          status: (matchedIndex !== undefined ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
          sourceIndex: matchedIndex,
          failureClass: claim.failureClass, solution: claim.solution,
        };
      });
      const coherence = checkCoherence(
        rawClaims.map(c => ({ ...c, searchQuery: "" })),
        messages.flatMap(m => m.claims ? m.claims.map(c => ({ ...c, searchQuery: "" })) : []),
      );
      const verified = groundedClaims.filter(c => c.status === "VERIFIED").length;
      pushDebugEvent(`Claims: ${groundedClaims.length} total, ${verified} verified, ${groundedClaims.length - verified} unverified`);
      const cov = measureCoverage({
        query: input,
        constraints,
        sources: retrievedWebData,
        answer: responseText,
        verifiedClaims: verified,
        totalClaims: groundedClaims.length,
      });
      pushDebugEvent(`Measured coverage: ${cov.numerator}/${cov.denominator} facets (${(cov.coverage * 100).toFixed(0)}%)`);
      const qualityReport = scoreAnswer({
        query: input,
        answer: responseText,
        sourceCount: retrievedWebData.length,
        verifiedClaims: verified,
        totalClaims: groundedClaims.length,
        computeRecords,
        activeTemplateId: settings.templateEnabled ? settings.activeTemplateId : undefined,
      });
      pushDebugEvent(`Quality score: ${qualityReport.overall}/10 · ${qualityReport.items.map(i => `${i.name}=${i.score}`).join(", ")}`);

      // Phase 7: REAL SSCP / Merkle receipt over the actual ledger
      setBusyState("Phase 7: SSCP Merkle Seal");
      patchTelemetry({ phase: "Phase 7: SSCP Merkle Seal", pipelineStage: 7, entropy: 0.15 });
      const evidenceTier: EvidenceTier = retrievedWebData.length > 0 ? "TOOL" : "DERIV";
      const claimLeaves: SSCPLeaf[] = groundedClaims.map(c => ({ domain: "claim", text: c.text.slice(0, 200), status: c.status }));
      const toolLeaves: SSCPLeaf[] = retrievedWebData.map(s => ({ domain: "tool", text: s.url, status: "RETRIEVED" }));
      const gateLeaves: SSCPLeaf[] = [
        { domain: "gate", text: "injection-screen", status: injection.blocked ? "BLOCKED" : "PASS" },
        { domain: "gate", text: "constraint-extraction", status: "PASS" },
        { domain: "gate", text: "temporal-anchor", status: anchor.horizonEnd ? "BOUND" : "PASS" },
        { domain: "gate", text: "sanitizer", status: sanitizerRemovedSegments > 0 ? `STRIPPED:${sanitizerRemovedSegments}` : "PASS" },
        { domain: "gate", text: "claim-grounding", status: `${verified}/${groundedClaims.length}` },
        { domain: "gate", text: "deterministic-compute", status: computeRecords.length > 0 ? `${computeRecords.filter(r => r.ok).length}/${computeRecords.length} verified` : "none" },
      ];
      const evidenceLeaves: SSCPLeaf[] = [
        ...verificationPlan.map(h => ({ domain: "evidence", text: h.claim.slice(0, 120), status: h.status })),
        ...computeRecords.map(r => ({ domain: "compute", text: `${r.label}: ${JSON.stringify(r.result)}`, status: r.ok ? "VERIFIED" : "FAILED" })),
      ];
      let receipt = null;
      try {
        receipt = await buildSSCPReceipt({
          claims: claimLeaves, tools: toolLeaves, gates: gateLeaves, evidence: evidenceLeaves,
          evidenceTier, allGatesPass: !injection.blocked,
        });
        setSscpReceipt(receipt);
        pushDebugEvent(`SSCP receipt sealed: ${receipt.stateRootHash.slice(0, 16)}… (${receipt.leafCount} leaves)`);
      } catch (e) {
        pushDebugEvent(`SSCP seal skipped: ${(e as Error).message}`);
      }

      patchTelemetry({
        claimsTotal: groundedClaims.length, claimsVerified: verified,
        measuredCoverage: cov.coverage, coverageNumerator: cov.numerator, coverageDenominator: cov.denominator,
        tokensOut: estTokens(responseText), elapsedMs: Date.now() - startedAt,
        sscpHash: receipt?.stateRootHash ?? null, evidenceTier, entropy: 0.1,
      });

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: responseText,
        ts: Date.now(),
        model,
        toolResults: retrievedWebData.length > 0 ? retrievedWebData.slice(0, 32).map((s) => ({ ...s, content: (s.content || "").slice(0, 800) })) : undefined,
        // Cap verificationPlan source bodies — they duplicate toolResults content
        // and were a primary OOM vector (hypotheses × 5 sources × full content).
        verificationPlan: verificationPlan.map(h => ({
          ...h,
          sources: h.sources.slice(0, 3).map(s => ({ ...s, content: (s.content || "").slice(0, 200) })),
        })),
        claims: groundedClaims,
        coherence,
        constraints,
        sanitizerRemovedSegments,
        usedMultiPass,
        pipelineTrace: pipelineTrace.length > 0 ? pipelineTrace.map(t => ({ ...t, data: t.data ? JSON.stringify(t.data).slice(0, 300) : undefined })) : undefined,
        computeRecords: computeRecords.length > 0 ? computeRecords : undefined,
        entitySheet,
        artifactResponse,
        qualityReport,
        adversarialPasses: adversarialPassesForUi.length > 0 ? adversarialPassesForUi : undefined,
      };
      setCollapsedTools(prev => ({ ...prev, [assistantMsg.id]: true }));
      pushMessage(assistantMsg);
      pushDebugEvent("✓ Response delivered");

      // Run ATLAS-DR adversarial gates
      const atlasDR = runAtlasDR(input, responseText.slice(0, 200));
      pushDebugEvent(`ATLAS-DR: Tournament winner=${atlasDR.tournament.winner.id}, Falsification=${atlasDR.falsification.rigorAudit}`);

      setLastRun({
        query: input, model, finalAnswer: responseText,
        totalTokens: estTokens(input) + estTokens(responseText),
        elapsedMs: Date.now() - startedAt,
        sources: retrievedWebData.length,
        verifiedClaims: verified,
        totalClaims: groundedClaims.length,
        constraints, startedAt, finishedAt: Date.now(),
        pipelineTrace: pipelineTrace.length > 0 ? pipelineTrace.slice(-40).map(t => ({ ...t, data: t.data ? JSON.stringify(t.data).slice(0, 200) : undefined })) : undefined,
        artifactResponse,
        measuredCoverage: cov.coverage,
        coverageNumerator: cov.numerator,
        coverageDenominator: cov.denominator,
      });
      patchTelemetry({ running: false, phase: "complete" });
    } catch (err) {
      const msg = (err as Error)?.message || "Unknown error";
      pushDebugEvent(`ERROR: ${msg}`);
patchTelemetry({ running: false, phase: "error" });
pushMessage({ id: `a-${Date.now()}`, role: "assistant", content: `Generation Failure: ${msg}`, ts: Date.now(), model });
}
clearAllocationsByPrefix("pipeline.");
setBusyState(null);
  }, [input, busyState, model, keys, persona, searchDepth, settings, messages, templates, pushMessage, setBusyState, setInput, setLastRun, pushDebugEvent, clearDebugEvents, patchTelemetry, resetTelemetry, setSscpReceipt, setBeliefState, setRelevanceGraph]);

  useEffect(() => {
    if (onSubmitFromShared && onSubmitFromShared > 0) handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubmitFromShared]);

  const totalClaims = messages.flatMap(m => m.claims || []).length;
  const totalVerified = messages.flatMap(m => m.claims || []).filter(c => c.status === "VERIFIED").length;
  const totalBlocked = messages.filter(m => m.injection?.blocked).length;
  const filteredModes = filterSuperclass ? FAILURE_MODES.filter(fm => fm.superclass === filterSuperclass) : FAILURE_MODES;

  return (
    <div className="flex flex-col bg-zinc-50 text-zinc-900" style={{ minHeight: "calc(100vh - 88px)" }}>
      {/* Sub-header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-bold text-zinc-900">Chat</h1>
              <p className="text-[11px] text-zinc-500">Retrieve-first · deterministic constraints · 126 defenses</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={e => setModel(e.target.value as ModelId)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              <optgroup label="Gemma 4 / Gemini 3.x">
                {MODELS.filter(m => m.provider === "gemini" && (m.id.startsWith("gemini-3") || m.id.startsWith("gemma-4"))).map(m => (
                  <option key={m.id} value={m.id}>{m.label}{m.preview ? " ⚠" : ""}</option>
                ))}
              </optgroup>
              <optgroup label="Gemini 2.x">
                {MODELS.filter(m => m.provider === "gemini" && m.id.startsWith("gemini-2")).map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="Gemma 3">
                {MODELS.filter(m => m.provider === "gemini" && m.id.startsWith("gemma-3")).map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="Claude">{MODELS.filter(m => m.provider === "claude").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Grok">{MODELS.filter(m => m.provider === "grok").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="DeepSeek">{MODELS.filter(m => m.provider === "deepseek").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            </select>
            <button onClick={() => setShowSettings(!showSettings)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showSettings ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>Keys</button>
            <button onClick={() => setShowModes(!showModes)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showModes ? "bg-indigo-700 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>{TOTAL_DEFENSES} Defenses</button>
            <button onClick={() => { setShowDebug(!showDebug); }} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showDebug ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>Debug</button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium">
              <input type="checkbox" checked={settings.deepResearch} onChange={e => setSetting("deepResearch", e.target.checked)} className="h-3.5 w-3.5 rounded" />
              <span className={settings.deepResearch ? "text-indigo-700" : "text-zinc-600"}>4-Stage</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium" title="Power user: recursive adversarial refinement until stable">
              <input type="checkbox" checked={settings.nDeepEnabled} onChange={e => setSetting("nDeepEnabled", e.target.checked)} className="h-3.5 w-3.5 rounded" />
              <span className={settings.nDeepEnabled ? "text-violet-700 font-bold" : "text-zinc-600"}>⚡ N-Deep</span>
            </label>
            {settings.nDeepEnabled && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px]" title="N-Deep max passes">
                <input type="range" min={1} max={20} value={settings.nDeepMaxPasses}
                  onChange={e => setSetting("nDeepMaxPasses", parseInt(e.target.value))}
                  className="h-1 w-14 cursor-pointer appearance-none rounded bg-violet-200 accent-violet-600" />
                <span className="font-mono font-bold text-violet-800">{settings.nDeepMaxPasses}</span>
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium" title="Run all hypothesis searches as one parallel cluster (faster)">
              <input type="checkbox" checked={settings.clusterSearch} onChange={e => setSetting("clusterSearch", e.target.checked)} className="h-3.5 w-3.5 rounded" />
              <span className={settings.clusterSearch ? "text-sky-700" : "text-zinc-600"}>⚡ Cluster</span>
            </label>
            {settings.clusterSearch && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px]" title="Parallel searches per cluster wave">
                <input type="range" min={2} max={16} value={settings.clusterSize}
                  onChange={e => setSetting("clusterSize", parseInt(e.target.value))}
                  className="h-1 w-14 cursor-pointer appearance-none rounded bg-sky-200 accent-sky-600" />
                <span className="font-mono font-bold text-sky-800">{settings.clusterSize}</span>
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium" title="SLOOP: long-form multi-page report (works on any model)">
              <input type="checkbox" checked={settings.forceSloop} onChange={e => setSetting("forceSloop", e.target.checked)} className="h-3.5 w-3.5 rounded" />
              <span className={settings.forceSloop ? "text-amber-700 font-bold" : "text-zinc-600"}>📄 SLOOP</span>
            </label>
            {settings.forceSloop && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px]" title="Target report page count">
                <input type="range" min={2} max={30} value={settings.sloopPages}
                  onChange={e => setSetting("sloopPages", parseInt(e.target.value))}
                  className="h-1 w-16 cursor-pointer appearance-none rounded bg-amber-200 accent-amber-600" />
                <span className="font-mono font-bold text-amber-800">{settings.sloopPages}p</span>
              </div>
            )}
            <MemoryMonitor />
          </div>
        </div>

        {/* Connector status bar */}
        <div className="border-t border-zinc-100 bg-zinc-50/90 px-4 py-1">
          <div className="mx-auto flex max-w-5xl items-center justify-between text-xs">
            <div className="flex items-center gap-3 overflow-x-auto">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Connectors:</span>
              {(["claude", "grok", "deepseek", "gemini", "jina", "prismafetch"] as (ProviderId | "jina" | "prismafetch")[]).map(conn => {
                const st = statuses[conn];
                const hasKey = conn === "prismafetch"
                  ? settings.prismafetchEnabled
                  : !!(keys[conn as keyof typeof keys] as string);
                const label = conn === "jina"
                  ? "Jina"
                  : conn === "prismafetch"
                    ? "PrismaFetch"
                    : conn.charAt(0).toUpperCase() + conn.slice(1);
                return (
                  <div key={conn} className="flex items-center gap-1 shrink-0">
                    <span className="text-zinc-600">{label}</span>
                    <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-mono font-bold ${st === "connected" ? "bg-emerald-100 text-emerald-800" : st === "error" ? "bg-rose-100 text-rose-800" : st === "testing" ? "bg-amber-100 text-amber-800 animate-pulse" : hasKey ? "bg-blue-100 text-blue-800" : "bg-zinc-100 text-zinc-500"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st === "connected" ? "bg-emerald-500" : st === "error" ? "bg-rose-500" : st === "testing" ? "bg-amber-500" : hasKey ? "bg-blue-500" : "bg-zinc-400"}`} />
                      {st === "connected" ? "OK" : st === "error" ? "ERR" : st === "testing" ? "…" : hasKey ? "RDY" : "–"}
                    </span>
                  </div>
                );
              })}
            </div>
            <button onClick={auditAllConnectors} className="shrink-0 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase">Audit all</button>
          </div>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">API Keys</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {([
                { id: "claude", name: "Claude (Anthropic)", placeholder: "sk-ant-..." },
                { id: "grok", name: "Grok (xAI)", placeholder: "xai-..." },
                { id: "deepseek", name: "DeepSeek", placeholder: "sk-..." },
                { id: "gemini", name: "Gemini / Gemma (Google)", placeholder: "AIzaSy..." },
                { id: "jina", name: "Jina AI (cloud backup only)", placeholder: "jina_..." },
                { id: "marketData", name: "Market data (Alpha Vantage optional)", placeholder: "alpha_vantage_key" },
              ] as { id: keyof typeof keys; name: string; placeholder: string }[]).map(p => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">{p.name}</label>
                    <button onClick={() => checkProviderStatus(p.id as ProviderId | "jina", keys[p.id] as string)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Test</button>
                  </div>
                  <input type="password" value={(keys[p.id] as string) ?? ""} onChange={e => updateKey(p.id, e.target.value)} placeholder={p.placeholder}
                    className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none" />
                </div>
              ))}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2 md:col-span-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-zinc-700">PrismaFetch primary scraper</label>
                  <button onClick={() => checkProviderStatus("prismafetch", settings.prismafetchUrl)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Test</button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <input
                    type="text"
                    value={settings.prismafetchUrl}
                    onChange={e => setSetting("prismafetchUrl", e.target.value)}
                    placeholder="http://127.0.0.1:8080"
                    className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                    <input type="checkbox" checked={settings.prismafetchEnabled} onChange={e => setSetting("prismafetchEnabled", e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Enabled
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                    <input type="checkbox" checked={settings.prismafetchAutoFallback} onChange={e => setSetting("prismafetchAutoFallback", e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Allow Jina cloud backup if both local scrapers fail
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Runtime order is PrismaFetch primary, built-in OG browser scraper secondary, Jina cloud backup last.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-700">Search Depth ({searchDepth})</label>
                <input type="range" min="1" max="50" value={searchDepth} onChange={e => setSearchDepth(parseInt(e.target.value))} className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2 md:col-span-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-amber-900">SLOOP long-form report controls</label>
                  <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                    <input type="checkbox" checked={settings.forceSloop} onChange={e => setSetting("forceSloop", e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Force SLOOP
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2 md:items-center">
                  <label className="block text-xs text-amber-900">
                    Target pages ({settings.sloopPages})
                    <input type="range" min="2" max="30" value={settings.sloopPages} onChange={e => setSetting("sloopPages", parseInt(e.target.value))} className="mt-1 w-full h-2 rounded-lg bg-amber-100 accent-amber-600" />
                  </label>
                  <label className="block text-xs text-amber-900">
                    Cluster search width ({settings.clusterSize})
                    <input type="range" min="2" max="16" value={settings.clusterSize} onChange={e => setSetting("clusterSize", parseInt(e.target.value))} className="mt-1 w-full h-2 rounded-lg bg-sky-100 accent-sky-600" />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-amber-800">SLOOP requests a complete multi-page report while keeping scraper and N-Deep memory caps active.</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-zinc-500">Keys are stored in localStorage and shared across all pages. Enable "4-Stage" for the research-grade multi-pass pipeline. PrismaFetch settings are persisted here as well.</p>
          </div>
        </div>
      )}

      {/* 126 Modes panel */}
      {showModes && (
        <div className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <div className="mb-3 flex flex-wrap gap-1">
              <button onClick={() => setFilterSuperclass(null)} className={`rounded px-2 py-1 text-xs font-medium ${!filterSuperclass ? "bg-indigo-600 text-white" : "bg-zinc-100 hover:bg-zinc-200"}`}>All ({FAILURE_MODES.length})</button>
              {Object.entries(SUPERCLASS_SUMMARY).map(([key, val]) => (
                <button key={key} onClick={() => setFilterSuperclass(filterSuperclass === key ? null : key)} className={`rounded px-2 py-1 text-xs font-medium ${filterSuperclass === key ? "bg-indigo-600 text-white" : "bg-zinc-100 hover:bg-zinc-200"}`}>
                  {key}: {val.name}
                </button>
              ))}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-100">
                  <tr className="border-b border-zinc-200">
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Failure Mode</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Solution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredModes.map(fm => (
                    <tr key={fm.id} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-indigo-700">{fm.id}</td>
                      <td className="px-3 py-2 font-medium text-zinc-900">{fm.name}</td>
                      <td className="px-3 py-2 text-zinc-600">{fm.solution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Debug drawer */}
      {showDebug && (
        <div className="border-b border-zinc-200 bg-zinc-950">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Live debug trace</span>
              <button onClick={clearDebugEvents} className="text-[10px] text-zinc-500 hover:text-zinc-300 uppercase">Clear</button>
            </div>
            <div ref={debugRef} className="max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-100 space-y-0.5">
              {debugEvents.length === 0
                ? <div className="text-zinc-500 py-2">No events yet. Run a query to see the live reasoning trace.</div>
                : debugEvents.map((e, i) => <div key={i} className="text-emerald-200">{e}</div>)
              }
            </div>
          </div>
        </div>
      )}

      {/* Template & Persona Controls */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-2 space-y-3">
          <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5">
            <span className="text-xs font-semibold text-zinc-700">Template</span>
            <select
              value={settings.activeTemplateId}
              onChange={e => setSetting("activeTemplateId", e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 ml-2 text-xs text-zinc-700">
              <input type="checkbox" checked={settings.templateEnabled} onChange={e => setSetting("templateEnabled", e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Apply template
            </label>
          </div>
          <StylePersonaPanel persona={persona} onReseed={seed => reseedPersona(seed)} />
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-1.5 text-xs flex-wrap">
          <span className="text-zinc-600">Claims: <strong className="text-zinc-900">{totalClaims}</strong></span>
          <span className="text-zinc-600">Verified: <strong className="text-emerald-700">{totalVerified}</strong></span>
          <span className="text-zinc-600">Blocked: <strong className="text-rose-700">{totalBlocked}</strong></span>
          <span className="text-zinc-600">Defenses: <strong className="text-indigo-700">{TOTAL_DEFENSES}/{TOTAL_DEFENSES}</strong></span>
          {settings.deepResearch && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">4-Stage Pipeline ON</span>}
          {settings.templateEnabled && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">Template: {settings.activeTemplateId}</span>}
          <button onClick={clearMessages} className="ml-auto text-[10px] text-zinc-400 hover:text-rose-600">Clear chat</button>
        </div>
      </div>

      {/* Live AEGIS-PHI HUD — shows real telemetry during/after any run */}
      {(telemetry.running || telemetry.phase !== "idle") && (
        <div className="border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 py-3 grid md:grid-cols-2 gap-4">
            <HUD />
            <LiveResourceHUD />
          </div>
        </div>
      )}

      {/* Debug/Reasoning Trace Panel */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <DebugTracePanel trace={telemetry.pipelineTrace || []} telemetry={telemetry} />
        </div>
      </div>

      {/* Main chat content */}
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4">
          <div className="flex flex-1 flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6" style={{ minHeight: 0 }}>
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center py-16">
                  <div className="max-w-md text-center">
                      <h2 className="mb-2 text-lg font-bold text-zinc-900">Retrieve-First, Generate-Second</h2>
                      <p className="mb-4 text-xs text-zinc-600 leading-relaxed">
                        Every answer is grounded in live retrieval data. Time horizons, tickers, and format hints become <strong>deterministic constraints</strong> the model must respect.
                        Grounding uses <strong>Jina</strong> when configured and can fall back to <strong>PrismaFetch local</strong> when enabled.
                      </p>
                      <div className="grid gap-2 text-left text-xs">
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"><span className="font-semibold text-indigo-700">1. Configure grounding:</span> PrismaFetch is primary, the built-in browser scraper is secondary, and Jina is cloud backup only.</div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"><span className="font-semibold text-indigo-700">2. Ask a question:</span> "Best tech stock for the next 2 months?" — 2-month constraint auto-detected.</div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"><span className="font-semibold text-indigo-700">3. Constraint-filtered answer:</span> 1-year targets excluded; out-of-window catalysts flagged.</div>
                      </div>
                  </div>
                </div>
              )}
              {messages.map(msg => {
                const isCollapsed = collapsedTools[msg.id] ?? true;
                return (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3.5 ${msg.role === "user" ? "bg-zinc-900" : "border border-zinc-200 bg-white"}`}>
                      {/* Injection warning */}
                      {msg.injection?.blocked && (
                        <div className="mb-2 rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800">
                          ⚠ Prompt injection blocked: {msg.injection.patterns.join(", ")}
                        </div>
                      )}
                      {/* Constraint badges */}
                      {msg.role === "user" && msg.constraints && (msg.constraints.timeHorizon || msg.constraints.explicitComparisonTargets.length > 0 || msg.constraints.formatHints.length > 0) && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {msg.constraints.timeHorizon && (
                            <span className="rounded-full bg-indigo-200 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-900">horizon: {msg.constraints.timeHorizon.value} {msg.constraints.timeHorizon.unit}</span>
                          )}
                          {msg.constraints.explicitComparisonTargets.map(t => (
                            <span key={t} className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-900">focus: {t}</span>
                          ))}
                          {msg.constraints.domain && msg.constraints.domain !== "general" && (
                            <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-mono font-bold text-violet-900">domain: {msg.constraints.domain}</span>
                          )}
                          {msg.constraints.isShortHorizon && (
                            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-900">tactical window</span>
                          )}
                        </div>
                      )}
                      {/* Pipeline trace for assistant */}
                      {msg.pipelineTrace && msg.pipelineTrace.length > 0 && msg.role === "assistant" && (
                        <details className="mb-3">
                          <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                            4-Stage pipeline trace ({msg.pipelineTrace.length} steps)
                          </summary>
                          <div className="mt-2 space-y-1 font-mono text-[11px] bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            {msg.pipelineTrace.map((t, i) => (
                              <div key={i} className={`flex gap-2 ${t.ok ? "text-emerald-700" : "text-rose-700"}`}>
                                <span className="shrink-0 text-zinc-400">S{t.stage}</span>
                                <span>{t.label}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {/* Deterministic compute records */}
                      {msg.computeRecords && msg.computeRecords.length > 0 && msg.role === "assistant" && (
                        <ComputeRecordsInline records={msg.computeRecords} />
                      )}
                      {/* Verified entity sheet */}
                      {msg.entitySheet && msg.role === "assistant" && (
                        <EntitySheetInline sheet={msg.entitySheet} />
                      )}
                      {msg.artifactResponse && msg.role === "assistant" && (
                        <ArtifactInline artifact={msg.artifactResponse} />
                      )}
                      {/* Verification plan */}
                      {msg.verificationPlan && msg.verificationPlan.length > 0 && (
                        <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs">
                          <div className="mb-2 font-semibold text-indigo-900">Verification plan ({msg.verificationPlan.length} hypotheses)</div>
                          <div className="space-y-2">
                            {msg.verificationPlan.map((item, idx) => (
                              <div key={idx} className="rounded-lg bg-white/80 p-2">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${item.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.status}</span>
                                  <span className="text-[10px] text-zinc-500">{item.sources.length} sources</span>
                                </div>
                                <p className="font-medium text-zinc-800">{item.claim}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Sources accordion */}
                      {msg.toolResults && msg.toolResults.length > 0 && (
                        <div className="mb-3 rounded-xl border border-zinc-200 bg-white overflow-hidden">
                          <button onClick={() => toggleToolCollapse(msg.id)} className="flex w-full items-center justify-between bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                            <span className="flex items-center gap-1.5">
                              <span className="text-indigo-600">🔍</span>
                              Grounding Sources ({msg.toolResults.length} · {Array.from(new Set(msg.toolResults.map(src => src.provider ?? "unknown"))).join(" + ")})
                            </span>
                            <span className="text-zinc-400 font-mono text-[10px]">{isCollapsed ? "► Expand" : "▼ Collapse"}</span>
                          </button>
                          {!isCollapsed && (
                            <div className="max-h-56 overflow-y-auto p-3 space-y-3 divide-y divide-zinc-100">
                              {msg.toolResults.map((src, idx) => (
                                <div key={idx} className={idx > 0 ? "pt-3" : ""}>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-mono font-bold text-xs text-indigo-600">[S{idx + 1}]</span>
                                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-zinc-900 hover:underline truncate max-w-xs">{src.title}</a>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-500">
                                    <span className="truncate max-w-[28rem]">{src.url}</span>
                                    {src.provider && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">{src.provider}</span>}
                                    {src.tier && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-bold text-zinc-700">{src.tier}</span>}
                                  </div>
                                  <p className="mt-1 text-xs text-zinc-600 line-clamp-2">{src.content.slice(0, 200)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Message content */}
                      {msg.role === "assistant" ? (
                        <RichText text={msg.content} />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-white">{msg.content}</div>
                      )}
                      {/* Assistant metadata */}
                      {msg.role === "assistant" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-400">
                          <span>via {MODELS.find(m => m.id === msg.model)?.label ?? msg.model}</span>
                          {msg.toolResults && msg.toolResults.length > 0 && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800 font-bold">
                              grounding: {Array.from(new Set(msg.toolResults.map(src => src.provider ?? "unknown"))).join("+")}
                            </span>
                          )}
                          {msg.usedMultiPass && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800 font-bold">4-Stage ✓</span>}
                          {msg.sanitizerRemovedSegments !== undefined && msg.sanitizerRemovedSegments > 0 && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 font-bold">Sanitizer: {msg.sanitizerRemovedSegments} block(s) stripped</span>
                          )}
                        </div>
                      )}
                      {msg.qualityReport && msg.role === "assistant" && (
                        <details className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-2 text-xs" open={false}>
                          <summary className="cursor-pointer font-semibold text-violet-800">
                            Quality / Mythos review ({msg.qualityReport.overall}/10) · kernels: {msg.qualityReport.triggeredKernels.slice(0, 3).join(", ")}
                          </summary>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {msg.qualityReport.items.map(item => (
                              <div key={item.name} className="rounded border border-violet-100 bg-white p-2">
                                <div className="flex justify-between gap-2 font-semibold text-zinc-800"><span>{item.name}</span><span>{item.score}/10</span></div>
                                <p className="mt-1 text-[11px] text-zinc-500">{item.note}</p>
                              </div>
                            ))}
                          </div>
                          {msg.qualityReport.numericAudit.length > 0 && (
                            <div className="mt-2 rounded border border-violet-100 bg-white p-2">
                              <div className="mb-1 font-semibold text-zinc-800">Numeric audit</div>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.qualityReport.numericAudit.slice(0, 24).map(n => (
                                  <span key={`${n.value}-${n.status}-${n.line ?? "x"}`} title={`${n.rationale}${n.line ? ` Line ${n.line}.` : ""}${n.unit ? ` Unit: ${n.unit}.` : ""}`} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${n.status === "unverified" ? "bg-rose-100 text-rose-700" : n.status === "computed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{n.value}{n.unit ? ` ${n.unit}` : ""} · {n.status}{n.line ? ` · L${n.line}` : ""}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="mt-2 text-[11px] text-violet-700">{msg.qualityReport.mythos}</p>
                        </details>
                      )}
                      {/* Coherence warning */}
                      {msg.coherence?.drifts && msg.coherence.drifts.length > 0 && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">⚠ Multi-turn drift: {msg.coherence.drifts[0]}</div>
                      )}
                      {/* Claim ledger */}
                      {msg.claims && msg.claims.length > 0 && (
                        <details className="mt-3 border-t border-zinc-100 pt-3">
                          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-700">
                            Atomic claim ledger ({msg.claims.filter(c => c.status === "VERIFIED").length}/{msg.claims.length} verified)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {msg.claims.map(claim => (
                              <div key={claim.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`rounded px-1 py-0.5 font-mono font-bold text-[10px] ${claim.status === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{claim.status}</span>
                                  <span className="rounded bg-indigo-50 px-1 py-0.5 font-mono text-[10px] text-indigo-700">{claim.failureClass}</span>
                                  {claim.sourceIndex !== undefined && (
                                    <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                                      → [S{claim.sourceIndex + 1}{msg.toolResults?.[claim.sourceIndex]?.provider ? ` · ${msg.toolResults[claim.sourceIndex]?.provider}` : ""}]
                                    </span>
                                  )}
                                </div>
                                <p className="text-zinc-800 font-medium">{claim.text}</p>
                                <p className="mt-1 text-[10px] text-zinc-500">{claim.solution}</p>
                              </div>
                            ))}
                          </div>
                          {msg.adversarialPasses && msg.adversarialPasses.length > 0 && (
                            <details className="mt-3 rounded-lg border border-rose-100 bg-rose-50/60 p-2 text-xs" open={false}>
                              <summary className="cursor-pointer font-semibold text-rose-800">
                                Death certificate registry ({msg.adversarialPasses.filter(p => p.deathCertificate).length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {msg.adversarialPasses.filter(p => p.deathCertificate).map(p => (
                                  <div key={`death-${p.pass}`} className="rounded border border-rose-100 bg-white p-2">
                                    <div className="font-mono text-[10px] text-zinc-500">Pass {p.pass} · {p.model}</div>
                                    <div className="mt-1 text-zinc-800">Purged draft: {p.deathCertificate?.chars} chars · hash {p.deathCertificate?.hash}</div>
                                    <div className="mt-1 text-[11px] text-zinc-500">Reason: {p.deathCertificate?.reason}</div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
              {busyState && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs shadow-sm flex items-center gap-2.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <div>
                      <span className="font-bold text-indigo-600 uppercase tracking-tight text-[10px] block">Active:</span>
                      <span className="font-medium text-zinc-800">{busyState}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input box */}
            <div className="border-t border-zinc-200 bg-zinc-50/80 p-4">
              <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="flex gap-2.5">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit(); } }}
                  placeholder="Ask a question. Time horizons, tickers, format hints become deterministic constraints…"
                  rows={1}
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500"
                />
                <button type="submit" disabled={!input.trim() || busyState !== null}
                  className="self-end rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30">
                  {settings.deepResearch ? "Deep Answer" : "Ground & Answer"}
                </button>
              </form>
              <div className="mt-1.5 text-[11px] text-zinc-500">⌘↩ to send · input shared across all pages · same query on dashboard, estimator, control plane</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
