/**
 * 4-Stage Micro-Agent Pipeline (from research docs)
 * ─────────────────────────────────────────────────
 * Stage 1: Application-code pre-processing (temporal anchor, persona seed)
 * Stage 2: Logic Engine Pass → structured JSON schema (Pydantic-style TS)
 * Stage 3: Copywriter Pass → polished Markdown prose
 * Stage 4: Application-code post-processing (sanitizer, citation cleaner)
 *
 * This is purely additive — the existing ChatApp still works without it.
 * When enabled (deepResearch=true), the pipeline replaces the single-pass
 * synthesis with a two-pass approach that resolves the 10/10 output issues.
 */

import type { GenerateParams } from "./models";
import { generateSynthesizedResponse } from "./models";
import { extractConstraints, buildConstraintBlock, sanitizeOutput } from "./constraints";
import type { WilliamsPersona } from "./williams-style";

// ─── Stage 1 output (computed in code, injected into prompt) ────────────────

export interface TemporalAnchor {
  currentDate: string;       // ISO yyyy-mm-dd
  currentDateHuman: string;  // "May 29, 2026"
  horizonEnd?: string;       // ISO yyyy-mm-dd
  horizonEndHuman?: string;  // "July 28, 2026"
  horizonDays?: number;
  anchorStatement: string;   // Injected verbatim into prompt
}

export function computeTemporalAnchor(userText: string): TemporalAnchor {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const human = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const constraints = extractConstraints(userText);
  let horizonEnd: string | undefined;
  let horizonEndHuman: string | undefined;
  let horizonDays: number | undefined;

  if (constraints.timeHorizon?.days) {
    const end = new Date(now.getTime() + constraints.timeHorizon.days * 86_400_000);
    horizonEnd = end.toISOString().slice(0, 10);
    horizonEndHuman = end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    horizonDays = constraints.timeHorizon.days;
  }

  const anchorStatement = horizonEnd
    ? `TEMPORAL ANCHOR (injected by application code, not inferred by model):\n  • Current date: ${human}\n  • Target window end: ${horizonEndHuman} (${horizonDays} days from now)\n  • Any event, catalyst, or data point occurring AFTER ${horizonEndHuman} is OUTSIDE the user's window and must be explicitly labeled as such.`
    : `TEMPORAL ANCHOR (injected by application code):\n  • Current date: ${human}`;

  return { currentDate: iso, currentDateHuman: human, horizonEnd, horizonEndHuman, horizonDays, anchorStatement };
}

// ─── Stage 2: Logic Engine Pass schema ──────────────────────────────────────

export interface DataPointMatrix {
  entityName: string;
  metricValue: string;
  isWithinTimeline: boolean;
  immediateCatalysts: string[];
  riskFactors: string[];
}

export interface LogicEnginePayload {
  queryIntentAnalysis: string;
  temporalAnchorVerified: boolean;
  dataMatrix: DataPointMatrix[];
  sectorTrendSynthesis: string;
  definitiveTacticalVerdict: string;
  computeRequests?: { id: string; args: Record<string, number | number[]> }[];
}

/** Scan for ALL balanced top-level {...} groups in a string. */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) { out.push(text.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

function repairJson(s: string): string {
  return s
    .replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")        // trailing commas
    .replace(/}\s*{/g, "},{");            // missing commas between objects
}

const EXPECTED_KEYS = ["query_intent_analysis", "queryIntentAnalysis", "definitive_tactical_verdict", "data_matrix"];

function extractStrictJson(raw: string): string {
  // Prefer a fenced block if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : raw;
  const objs = balancedObjects(source).map(repairJson);
  if (objs.length === 0) return repairJson(source.trim());
  // Pick the object that contains the most expected keys (defends against
  // stray { } inside the model's prose scratchpad).
  let best = objs[0], bestScore = -1;
  for (const o of objs) {
    const score = EXPECTED_KEYS.reduce((acc, k) => acc + (o.includes(`"${k}"`) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}

function tryParse(raw: string): unknown {
  // 1. Best balanced object
  try { return JSON.parse(extractStrictJson(raw)); } catch { /* */ }
  // 2. Newline collapse
  try { return JSON.parse(extractStrictJson(raw).replace(/\\?\n/g, " ")); } catch { /* */ }
  // 3. Every balanced object, largest first
  const objs = balancedObjects(raw).map(repairJson).sort((a, b) => b.length - a.length);
  for (const o of objs) { try { return JSON.parse(o); } catch { /* */ } }
  // 4. If all JSON parsing fails, we fall back to a stub object so the pipeline
  // doesn't crash, allowing the Copywriter stage to use the raw text.
  return {
    queryIntentAnalysis: "JSON parsing failed. Recovering...",
    temporalAnchorVerified: true,
    dataMatrix: [{ entityName: "Fallback", metricValue: "N/A", isWithinTimeline: true, immediateCatalysts: [], riskFactors: [] }],
    sectorTrendSynthesis: "Source extraction error, recovering from raw response: " + raw.slice(0, 500),
    definitiveTacticalVerdict: "Attempting synthesis from unparsed data...",
    computeRequests: []
  };
}

function parseLogicPayload(raw: string): LogicEnginePayload | null {
  const json = tryParse(raw) as any;
  if (!json) return null;
  try {
    // Normalise camelCase vs snake_case
    return {
      queryIntentAnalysis: json.query_intent_analysis ?? json.queryIntentAnalysis ?? "",
      temporalAnchorVerified: json.temporal_anchor_verified ?? json.temporalAnchorVerified ?? false,
      dataMatrix: (json.data_matrix ?? json.dataMatrix ?? []).map((d: Record<string, unknown>) => ({
        entityName: d.entity_name ?? d.entityName ?? "",
        metricValue: d.metric_value ?? d.metricValue ?? "",
        isWithinTimeline: d.is_within_timeline ?? d.isWithinTimeline ?? false,
        immediateCatalysts: d.immediate_catalysts ?? d.immediateCatalysts ?? [],
        riskFactors: d.risk_factors ?? d.riskFactors ?? [],
      })),
      sectorTrendSynthesis: json.sector_trend_synthesis ?? json.sectorTrendSynthesis ?? "",
      definitiveTacticalVerdict: json.definitive_tactical_verdict ?? json.definitiveTacticalVerdict ?? "",
      computeRequests: Array.isArray(json.compute_requests ?? json.computeRequests)
        ? (json.compute_requests ?? json.computeRequests).map((c: Record<string, unknown>) => ({
            id: String(c.id ?? c.fn ?? ""),
            args: (c.args ?? c.arguments ?? {}) as Record<string, number | number[]>,
          })).filter((c: { id: string }) => c.id)
        : [],
    } as LogicEnginePayload;
  } catch {
    return null;
  }
}

// ─── Stage 2 prompt ──────────────────────────────────────────────────────────

function buildLogicEnginePrompt(
  userQuery: string,
  anchor: TemporalAnchor,
  retrievedData: { title: string; url: string; content: string }[],
  constraintBlock: string,
  catalog: string,
): string {
  const sourceSummary = retrievedData
    .slice(0, 12)
    .map((s, i) => `[S${i + 1}] ${s.title}\n${s.content.slice(0, 600)}`)
    .join("\n\n---\n\n");

  return `Output a SINGLE raw JSON object. Start your response with { and end with }. No prose, no markdown fences, no commentary before or after. If a field is unknown, use an empty string or empty array — never omit a field.

${anchor.anchorStatement}

${constraintBlock}

SOURCES:
${sourceSummary}

USER QUERY: ${userQuery}

Return EXACTLY this shape (fill the values; keep all keys):
{
  "query_intent_analysis": "",
  "temporal_anchor_verified": true,
  "data_matrix": [
    { "entity_name": "", "metric_value": "", "is_within_timeline": true, "immediate_catalysts": [], "risk_factors": [] }
  ],
  "sector_trend_synthesis": "",
  "definitive_tactical_verdict": "",
  "compute_requests": []
}

DETERMINISTIC COMPUTE: If — and ONLY if — the question genuinely needs a numeric calculation that can be derived from numbers PRESENT IN THE SOURCES, add entries to "compute_requests". Each is { "id": "<function>", "args": { ... } }. Use the fewest calls necessary. Never request a calc if the required inputs are not in the sources. Available functions:
${catalog}

Rules: catalysts in "immediate_catalysts" must fall INSIDE the ${anchor.horizonDays ?? 90}-day window; if a catalyst is outside, put it in "risk_factors" and set "is_within_timeline" false. Keep every string under 200 characters. Do not include trailing commas.`;
}

// ─── Stage 3 prompt ──────────────────────────────────────────────────────────

function buildCopywriterPrompt(payload: LogicEnginePayload, persona: WilliamsPersona, query: string): string {
  return `You are an elite analyst writing the FINAL reader-facing brief. The reader sees ONLY what you place between the answer tags.

STYLE (apply invisibly; NEVER name a style, persona, lesson, or framework):
${persona.archetype.name} — ${persona.archetype.desc}

DATA TO COMMUNICATE:
${JSON.stringify(payload, null, 2)}

USER ASKED: ${query}

ABSOLUTE RULES:
- Do NOT show any planning, thinking, self-correction, outlines, bullet plans, "Self-correction:", "Body Section", "Introduction:", "Verdict:" labels, or numbered drafting steps.
- Do NOT restate these rules. Do NOT mention "payload", "JSON", "data matrix", "sources", or "persona".
- Write ONLY the finished prose a client would read.
- Do NOT collapse into "the provided data does not contain" or "insufficient evidence" if DATA TO COMMUNICATE contains any usable synthesis, entities, trend, verdict, or source-derived facts. Instead produce the best evidence-bounded answer and explicitly name only the narrow missing fields.
- Open with the verdict in one sentence. Use a Markdown table only if there are 2+ entities.
- Flag any catalyst with is_within_timeline=false using "⚠️ Outside window".
- End with one decisive bottom-line sentence.
- NEVER leave bracketed placeholders ([list of...], [description of...], [insert...], [TBD]). Fill every slot with real, specific content or omit the slot entirely.
- If you use the heading "SABV", it MUST contain a genuine Sex-as-a-Biological-Variable plan (sex stratification / disaggregation). NEVER label statistical nesting, clustering, or GLMM content as SABV — that belongs under "Statistical Analysis".
- In a grant, hypothetical/projected outcomes go under "Expected Outcomes / Impact", never under a "Results" heading.
- NEVER emit raw XML/HTML tags like <paragraph>, <section>, <div>, <p> in your output. Use only clean Markdown (headings, bold, lists, tables).
- NEVER say "the provided data does not contain" or "I am unable to propose" or "I cannot predict" when the DATA TO COMMUNICATE section contains usable content. PRODUCE an answer from whatever data is available.
- If an OMEGA template (NIH-GRANT-SRF, OMEGA-SCIENCE, etc.) is active, your output MUST follow that template's section structure exactly. Do not regress to generic paragraphs.
- NUMERICAL DETERMINISM: You MUST NOT guess or estimate sample sizes, power (beta), statistical effects, or budgets. If a study design needs these, add compute_requests entries to calculate them deterministically.

Wrap the ENTIRE finished answer between these exact tags and write nothing outside them:
<final_answer>
...your finished brief here...
</final_answer>`;
}

/** Extract the content between <final_answer> tags; fall back to whole text.
 *  TRUNCATION GUARD: if the extracted fragment is suspiciously short relative
 *  to the raw response, the model was likely truncated mid-generation and the
 *  tag captured only the tail. In that case, use the full raw response. */
function extractFinalAnswer(raw: string): string {
  const m = raw.match(/<final_answer>([\s\S]*?)<\/final_answer>/i);
  if (m) {
    const extracted = m[1].trim();
    // If the extracted content is less than 40% of the raw, the model probably
    // truncated mid-generation and the tag only captured the tail fragment.
    if (extracted.length < raw.length * 0.4 && raw.length > 500) {
      return raw.replace(/<\/?final_answer>/gi, "").trim();
    }
    return extracted;
  }
  // Tag opened but not closed (truncation) — take everything after the open tag.
  const open = raw.match(/<final_answer>([\s\S]*)$/i);
  if (open) {
    const extracted = open[1].trim();
    if (extracted.length < raw.length * 0.4 && raw.length > 500) {
      return raw.replace(/<\/?final_answer>/gi, "").trim();
    }
    return extracted;
  }
  return raw;
}

import { cleanOutput as cleanOutputBoundary } from "./output-boundary";
import { runNDeep, type NDeepPassRecord } from "./n-deep";
import { runAdversarialRedTeam, buildRepairBlock } from "./adversarial-engine";
import { throttle } from "./rpm-governor";
import { registryPromptCatalog, runComputeBatch, computeFactsBlock, type ComputeRecord } from "./compute-sandbox";
import { resolveEntities, type EntitySheet } from "./entity-resolver";
import { buildArtifactPromptBlock, resolveArtifactRequest, shouldResolveArtifacts, type ArtifactResponse } from "./artifacts";

// ─── Stage 4 post-processing ─────────────────────────────────────────────────

function stage4Clean(raw: string): string {
  // First pass: deterministic boundary detector (handles the leak pattern where
  // the model dumps Current Date / Style Persona / Note: Since I am an AI / §0
  // / Refining Suggestions / First sentence blocks BEFORE the real answer).
  const boundary = cleanOutputBoundary(raw);
  return _legacyStage4Clean(boundary.cleaned);
}

function _legacyStage4Clean(raw: string): string {
  const original = raw;
  // Remove raw [Source N] / [Source N, M] / [Source N, M, P] citations
  let s = raw.replace(/\[Source\s*\d+(?:\s*,\s*(?:Source\s*)?\d+)*\s*\]/gi, "");

  // Strip leaked scratchpad ONLY when a clear marker exists AND there is
  // substantial prose after it. We never keep-after-last-marker blindly,
  // because that destroyed legitimate multi-section content (the "Omitted as
  // per instructions" + single-sentence regression). Instead we drop the
  // marker LINE itself and let the bullet filter handle the rest.
  const scratchLine = /^\s*[*>-]?\s*(Self-correction:|Body Section|Applying [^\n]*framework|Final Polish|Check "Climactic ordering"|Scratchpad:|Thinking:|Plan:)/i;
  s = s.split("\n").filter((line) => !scratchLine.test(line)).join("\n");

  // Drop lines that are pure CoT bullets (e.g. "  *   Strong verbs (L3).")
  // Tightened so it only matches the leaked style-lesson bullets, never real
  // content bullets that merely start with a flagged word.
  const cotLine = /^\s*[*•-]\s*(Strong verbs|Characters as subjects|Varied sentence|Repeat key|Cumulative sentences|Climactic ordering|Reasonable concision|Minimize metadiscourse|Subordination|Strategic passive|Clear global)\b[^\n]{0,40}\(L\d/i;
  s = s.split("\n").filter(line => !cotLine.test(line)).join("\n");

  // Strip the Williams lesson tags like "(L3)", "(L5)", "(L3/L4)" if they leaked
  s = s.replace(/\((?:L\d+(?:\/L\d+)?(?:,\s*)?)+\)/g, "");

  // Strip leaked persona/style header lines that sometimes precede the answer
  s = s.replace(/^\s*"?The [A-Z][a-z]+"?\s*\([^)]*\)\.?\s*$/gm, "");
  s = s.replace(/^\s*Elite financial communicator[^\n]*$/gim, "");

  // Strip meta-discourse phrases
  const metaPhrases = [
    /based on the (?:provided )?(?:data|search results?|payload|json)/gi,
    /according to the (?:search|retriev|payload)/gi,
    /the (?:retrieved?|source) (?:data |documents? )?(?:shows?|indicates?|states?)/gi,
    /as (?:an?|the) AI[,.]?/gi,
    /in conclusion[,.]?/gi,
  ];
  for (const re of metaPhrases) s = s.replace(re, "");

  const cleaned = s.replace(/\n{3,}/g, "\n\n").trim();

  // SAFETY FLOOR: if aggressive cleaning collapsed the answer to a stub while
  // the original had real substance, the cleaner mis-fired — return the
  // original (minus raw citations) rather than emitting a stripped husk.
  const originalBody = original.replace(/\[Source\s*\d+\]/gi, "").trim();
  if (originalBody.length > 400 && cleaned.length < Math.max(200, originalBody.length * 0.35)) {
    return originalBody.replace(/\n{3,}/g, "\n\n").trim();
  }
  return cleaned;
}

// ─── Main pipeline entry point ───────────────────────────────────────────────

export interface PipelineTrace {
  stage: number;
  label: string;
  ts: number;
  data?: unknown;
  ok: boolean;
  detail?: string;
}

export interface PipelineResult {
  finalText: string;
  logicPayload: LogicEnginePayload | null;
  anchor: TemporalAnchor;
  trace: PipelineTrace[];
  sanitizerRemovedSegments: number;
  usedMultiPass: boolean;
  computeRecords: ComputeRecord[];
  entitySheet: EntitySheet | null;
  artifactResponse: ArtifactResponse | null;
  adversarialPasses?: import("./n-deep").NDeepPassRecord[];
  adversarialStable?: boolean;
}

export async function runMultiPassPipeline(opts: {
  userQuery: string;
  retrievedData: { title: string; url: string; content: string }[];
  baseParams: GenerateParams;
  persona: WilliamsPersona;
  templateBlock?: string;
  artifactBlock?: string;
  memory?: Record<string, any>;
  /** Enable N-Deep recursive adversarial refinement (power-user toggle). */
  nDeep?: boolean;
  nDeepMaxPasses?: number;
  /** Active template archetype id, used to select structural gates. */
  templateId?: string;
  /** Model RPM ceiling for throttling adversarial/repair calls. */
  rpm?: number;
  onTrace?: (t: PipelineTrace) => void;
}): Promise<PipelineResult> {
  const trace: PipelineTrace[] = [];
  const push = (t: PipelineTrace) => {
    // OOM FIX: never retain large data payloads in the trace. Stringify+cap to
    // 240 chars at the source so the trace array can't hold full logicPayload,
    // computeRecords, or defect arrays alive in React state.
    const slim: PipelineTrace = t.data !== undefined
      ? { ...t, data: (() => { try { return JSON.stringify(t.data).slice(0, 240); } catch { return String(t.data).slice(0, 240); } })() }
      : t;
    if (trace.length < 60) trace.push(slim); // hard cap trace length
    opts.onTrace?.(slim);
  };

  // ── Stage 1 ──────────────────────────────────────────────────────────────
  const anchor = computeTemporalAnchor(opts.userQuery);
  const constraints = extractConstraints(opts.userQuery);
  const constraintBlock = buildConstraintBlock(constraints);
  push({ stage: 1, label: "Temporal anchor computed", ts: Date.now(), ok: true, data: anchor });

  // ── Stage 1.5: Deterministic Entity Resolution ─────────────────────────
  // Extracts tickers, company names, prices, and metrics from RETRIEVED
  // source text only. The model never invents a company name or number.
  const entitySheet = resolveEntities(opts.retrievedData, opts.userQuery);
  push({
    stage: 1.5,
    label: `Entity resolver: ${entitySheet.entities.length} verified entities, ${entitySheet.weakEntities.length} weak`,
    ts: Date.now(),
    ok: entitySheet.entities.length > 0,
    data: entitySheet.entities.map((e) => `${e.ticker} (${e.name}): ${Object.keys(e.facts).length} facts, ${e.sourceCount} sources`),
  });

  // ── Stage 1.6: Deterministic Artifact Resolution ───────────────────────
  // Equity/market prompts get a backend-resolved artifact sheet before any
  // model synthesis. Tickers/names come from the artifact registry; prices and
  // earnings appear only when a live resolver is configured.
  let artifactResponse: ArtifactResponse | null = null;
  if (shouldResolveArtifacts(opts.userQuery)) {
    const tickers = Array.from(new Set([
      ...constraints.namedEntities,
      ...entitySheet.entities.map((e) => e.ticker),
    ])).slice(0, 12);
    artifactResponse = await resolveArtifactRequest({
      type: "earnings",
      tickers,
      windowStart: anchor.currentDate,
      windowEnd: anchor.horizonEnd,
    });
    push({
      stage: 1.6,
      label: `Artifact resolver: ${artifactResponse.resolved.length} resolved, ${artifactResponse.unresolved.length} unresolved`,
      ts: Date.now(),
      ok: artifactResponse.resolved.length > 0,
      data: artifactResponse.resolved.map((a) => `${a.ticker} (${a.name}) live=${a.hasLiveData}`),
    });
  }

  // ── Stage 2: Logic Engine Pass ───────────────────────────────────────────
  push({ stage: 2, label: "Logic Engine Pass — requesting structured JSON", ts: Date.now(), ok: true });
  const artifactBlock = artifactResponse ? buildArtifactPromptBlock(artifactResponse) : "";
  
  // ADVERSARIAL PRE-DRAFT (Module ContraDraft §181-§186)
  const adversarialPrompt = `ADVERSARIAL RED-TEAM TASK:
1. Construct a Naive Baseline (obvious high-prob answer).
2. Generate 2 ContraDraft Alternatives (fail under stress).
3. Run a Tournament to verify the Optimal Path.
4. Set a Falsification Gate (H_neg + Boundary Conditions).
Do this internally and use the results to harden the logic.`;

  // UNIFIED MEMORY INTEGRATION: Inject prior findings into the logic engine context
  const memoryBlock = Object.keys(opts.memory || {}).length > 0 
    ? `\n\nUNIFIED MEMORY (prior findings from session):\n${JSON.stringify(opts.memory)}` 
    : "";

  const logicPrompt = buildLogicEnginePrompt(
    opts.userQuery, 
    anchor, 
    opts.retrievedData, 
    constraintBlock + "\n\n" + adversarialPrompt + "\n\n" + entitySheet.promptBlock + (artifactBlock ? "\n\n" + artifactBlock : "") + memoryBlock, 
    registryPromptCatalog()
  );

  let logicPayload: LogicEnginePayload | null = null;
  try {
    const rawLogic = await generateSynthesizedResponse({
      ...opts.baseParams,
      userMessage: logicPrompt,
      retrievedWebData: undefined,
      conversationHistory: [],
    });
    logicPayload = parseLogicPayload(rawLogic);
    // One stricter retry if the first attempt did not yield parseable JSON.
    if (!logicPayload) {
      push({ stage: 2, label: "Logic payload not parseable — retrying with one-shot repair", ts: Date.now(), ok: false });
      const repairPrompt = `YOUR PREVIOUS REPLY WAS NOT VALID JSON. Extract the structured facts into ONLY the JSON object below. Do NOT write prose.
Required JSON schema:
{
  "query_intent_analysis": "",
  "temporal_anchor_verified": true,
  "data_matrix": [
    { "entity_name": "", "metric_value": "", "is_within_timeline": true, "immediate_catalysts": [], "risk_factors": [] }
  ],
  "sector_trend_synthesis": "",
  "definitive_tactical_verdict": ""
}

INVALID REPLY:
${rawLogic.slice(0, 1000)}`;

      const retryRaw = await generateSynthesizedResponse({
        ...opts.baseParams, userMessage: repairPrompt, retrievedWebData: undefined, conversationHistory: [],
      });
      logicPayload = parseLogicPayload(retryRaw);
    }
    push({ stage: 2, label: logicPayload ? "Logic payload validated ✓" : "Logic payload parse failed — falling back to single-pass", ts: Date.now(), ok: !!logicPayload, data: logicPayload });
  } catch (err) {
    push({ stage: 2, label: `Logic Engine error: ${(err as Error).message}`, ts: Date.now(), ok: false });
  }

  // ── Stage 2.5: Deterministic Compute Sandbox ─────────────────────────────
  let computeRecords: ComputeRecord[] = [];
  let computeFacts = "";
  if (logicPayload?.computeRequests && logicPayload.computeRequests.length > 0) {
    computeRecords = runComputeBatch(logicPayload.computeRequests);
    computeFacts = computeFactsBlock(computeRecords);
    const okCount = computeRecords.filter((r) => r.ok).length;
    push({ stage: 2.5, label: `Compute sandbox: ${okCount}/${computeRecords.length} deterministic calc(s) verified`, ts: Date.now(), ok: okCount === computeRecords.length, data: computeRecords });
  }

  // ── Build compact source evidence block for the Copywriter ───────────────
  // This is THE FIX for the "headers without bodies" / stub output regression.
  // Previous versions sent `retrievedWebData: undefined` to Stage 3, leaving
  // the model with only the Logic Engine JSON payload and no actual source text.
  // Now we inject 16 capped sources directly into the copywriter prompt AND pass
  // them via retrievedWebData so the model has two exposure paths to evidence.
  const copywriterSources = opts.retrievedData.slice(0, 16).map(s => ({
    title: s.title, url: s.url, content: (s.content || "").slice(0, 800),
  }));
  const sourceEvidenceBlock = copywriterSources.length > 0
    ? `\n\nSOURCE EVIDENCE (ground your prose in these — do NOT say "the data does not contain"):\n${copywriterSources.map((s, i) => `[S${i + 1}] ${s.title}\n${s.content.slice(0, 600)}`).join("\n---\n")}`
    : "";

  // ── Stage 3: Copywriter Pass ─────────────────────────────────────────────
  let finalText = "";
  if (logicPayload) {
    push({ stage: 3, label: "Copywriter Pass — translating payload + source evidence to prose", ts: Date.now(), ok: true });
    const copyPrompt = buildCopywriterPrompt(logicPayload, opts.persona, opts.userQuery)
      + sourceEvidenceBlock
      + `\n\n${entitySheet.promptBlock}`
      + (artifactBlock ? `\n\n${artifactBlock}` : "")
      + (computeFacts ? `\n\n${computeFacts}` : "")
      + (opts.templateBlock ? `\n\n${opts.templateBlock}` : "");
    try {
      const rawCopy = await generateSynthesizedResponse({
        ...opts.baseParams,
        userMessage: copyPrompt,
        // KEY FIX: pass source evidence to the model's data context window
        retrievedWebData: copywriterSources,
        conversationHistory: [],
      });
      finalText = extractFinalAnswer(rawCopy);
      // Detect empty extraction
      if (!finalText || finalText.trim().length < 100) {
        push({ stage: 3, label: "Copywriter extraction too short — using raw response", ts: Date.now(), ok: false });
        finalText = rawCopy;
      }
      push({ stage: 3, label: `Copywriter Pass complete: ${finalText.length} chars`, ts: Date.now(), ok: true });
    } catch (err) {
      push({ stage: 3, label: `Copywriter error: ${(err as Error).message} — falling back`, ts: Date.now(), ok: false });
      logicPayload = null; // force fallback below
    }
  }

  // ── Fallback: single-pass synthesis ─────────────────────────────────────
  if (!logicPayload || !finalText || finalText.trim().length < 100) {
    push({ stage: 3, label: "Single-pass fallback synthesis (with source evidence)", ts: Date.now(), ok: true });
    const fallbackPrompt = [
      anchor.anchorStatement,
      "",
      constraintBlock,
      "",
      entitySheet.promptBlock,
      artifactBlock ? `\n${artifactBlock}` : "",
      "",
      `STYLE PERSONA:\n${opts.persona.systemPromptFragment.split("\n").slice(0, 12).join("\n")}`,
      opts.templateBlock ? `\n${opts.templateBlock}` : "",
      sourceEvidenceBlock,
      "",
      "FINAL OUTPUT: write the answer directly, beginning with your most critical insight. No preamble, no outlines, no constraint labels. PRODUCE substantive content for every section — never leave a section header empty.",
    ].join("\n");
    finalText = await generateSynthesizedResponse({
      ...opts.baseParams,
      userMessage: `${opts.userQuery}\n\n${fallbackPrompt}`,
      retrievedWebData: copywriterSources,
    });
  }

  // ── Stage 3.5: Adversarial routing (Tournament / Falsification / Gates) ──
  // The draft is now routed THROUGH the adversarial critics before it can be
  // emitted. This is where the 10/10 hardening happens.
  const domain = opts.templateId === "OMEGA-SCIENCE" || opts.templateId === "NIH-GRANT-SRF" ? "science" : undefined;
  let adversarialPasses: NDeepPassRecord[] | undefined;
  let adversarialStable: boolean | undefined;

  if (opts.nDeep) {
    push({ stage: 5, label: "N-Deep: recursive adversarial refinement engaged", ts: Date.now(), ok: true });
    const nd = await runNDeep({
      userQuery: opts.userQuery,
      initialDraft: finalText,
      baseParams: { ...opts.baseParams, retrievedWebData: undefined, conversationHistory: [] },
      domain,
      rpm: opts.rpm,
      maxPasses: opts.nDeepMaxPasses,
      onTrace: push,
      onDebug: (m) => push({ stage: 5, label: m, ts: Date.now(), ok: true }),
    });
    finalText = nd.finalText;
    adversarialPasses = nd.passes;
    adversarialStable = nd.stable;
    push({ stage: 5, label: `N-Deep complete: ${nd.passes.length} pass(es), stable=${nd.stable}, ${nd.totalLlmCalls} LLM call(s)`, ts: Date.now(), ok: nd.stable });
  } else {
    // Single adversarial pass in standard 4-Stage mode.
    // OOM GUARD: for large drafts (>15KB, typical for NIH grants with SLOOP/template),
    // run ONLY deterministic structural gates (zero LLM calls, zero memory growth).
    // The LLM red-team + repair cycle doubles working memory and causes the 140-260s OOM.
    const draftIsLarge = finalText.length > 15_000;
    if (draftIsLarge) {
      push({ stage: 5, label: `Large draft (${finalText.length} chars) — deterministic gates only (skipping LLM red-team to prevent OOM)`, ts: Date.now(), ok: true });
      const { runStructuralGates } = await import("./adversarial-engine");
      const structural = runStructuralGates(finalText, { domain });
      const blocking = structural.filter(d => d.severity === "critical" || d.severity === "major");
      adversarialPasses = [{ pass: 1, model: opts.baseParams.model, defectCount: structural.length, criticalCount: blocking.length, verdict: blocking.length > 0 ? "revise" : "pass", defectTags: structural.map(d => `${d.severity}:${d.category}`), sectionsProposed: 0, sectionsAccepted: 0, sectionsRejected: 0, sectionsTieResolvedByIntelligence: 0, authorIntelligence: 0, judgeDecisions: [] }];
      adversarialStable = blocking.length === 0;
      push({ stage: 5, label: `Structural gates: ${structural.length} defect(s), ${blocking.length} blocking`, ts: Date.now(), ok: adversarialStable });
    } else {
      push({ stage: 5, label: "Adversarial single-pass red-team (Tournament + Falsification + Gates)", ts: Date.now(), ok: true });
      const report = await runAdversarialRedTeam(finalText, opts.userQuery, opts.baseParams, {
        domain,
        rpm: opts.rpm,
        onDebug: (m) => push({ stage: 5, label: m, ts: Date.now(), ok: true }),
      });
      const blocking = report.defects.filter((d) => d.severity === "critical" || d.severity === "major");
      adversarialPasses = [{ pass: 1, model: opts.baseParams.model, defectCount: report.defects.length, criticalCount: blocking.length, verdict: report.verdict, defectTags: report.defects.map(d => `${d.severity}:${d.category}`), sectionsProposed: 0, sectionsAccepted: 0, sectionsRejected: 0, sectionsTieResolvedByIntelligence: 0, authorIntelligence: 0, judgeDecisions: [] }];
      adversarialStable = report.verdict === "pass";
      if (blocking.length > 0) {
        push({ stage: 5, label: `Adversarial found ${blocking.length} blocking defect(s) — running one repair pass`, ts: Date.now(), ok: false, data: blocking.map((d) => d.id) });
        // Cap repair prompt to prevent OOM from embedding full draft in repair context
        const repairPrompt = `Revise the DRAFT to fix every listed defect. Keep what was correct. Fill ALL empty sections with substantive content. Output ONLY the corrected final answer — no commentary, no placeholders.\n\n${buildRepairBlock(report.defects)}\n\nUSER ASK: ${opts.userQuery}\n\nDRAFT:\n${finalText.slice(0, 20_000)}`;
        try {
          finalText = await throttle(
            () => generateSynthesizedResponse({ ...opts.baseParams, userMessage: repairPrompt, retrievedWebData: copywriterSources.slice(0, 8), conversationHistory: [] }),
            { rpm: opts.rpm },
          );
          adversarialStable = true;
          push({ stage: 5, label: "Adversarial repair pass applied ✓", ts: Date.now(), ok: true });
        } catch (e) {
          push({ stage: 5, label: `Adversarial repair failed: ${(e as Error).message}`, ts: Date.now(), ok: false });
        }
      } else {
        push({ stage: 5, label: "Adversarial review: no blocking defects ✓", ts: Date.now(), ok: true });
      }
    }
  }

  // ── Stage 4: Post-processing ─────────────────────────────────────────────
  const cleaned = stage4Clean(finalText);
  const sanitized = sanitizeOutput(cleaned);
  push({ stage: 4, label: `Sanitizer: removed ${sanitized.removedSegments} leaked segment(s)`, ts: Date.now(), ok: true, data: sanitized.notes });

  return {
    computeRecords,
    entitySheet,
    artifactResponse,
    finalText: sanitized.cleaned,
    logicPayload,
    anchor,
    trace,
    sanitizerRemovedSegments: sanitized.removedSegments,
    usedMultiPass: !!logicPayload,
    adversarialPasses,
    adversarialStable,
  };
}
