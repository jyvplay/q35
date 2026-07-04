/**
 * Universal Rigor Guard V14 — Terminal Canonical
 * - Registry-backed flaw scanner (delegates to pluggable flaws/ system)
 * - Deterministic Auto-Fix loop (per-pass + final post-loop pass)
 * - Multi-agent refinement loop (Draft → Critique → Editor) with early exit
 * - Remediation hints injected into critique + editor prompts
 * - Stable promotion after final auto-fix rescue
 * - Balanced-brace JSON extraction for judge replies
 * - Parallel Blind Judge Ensemble with optional cross-model rotation
 */

import type { GenerateParams, ModelId } from "./models";
import { generateSynthesizedResponse } from "./models";
import type { ComputeRecord } from "./compute-sandbox";
import type { ExtractedConstraints } from "./constraints";
import { throttle } from "./rpm-governor";
import { runFlawScan, runAutoFix, type ScanContext, type ScanSource } from "./flaw-registry";
import { ensureFlawsLoaded } from "./flaws";

// ─── TYPES ─────────────────────────────────────────────────────────────────
export interface GuardIssue {
  severity: "info" | "warning" | "major" | "critical";
  code: string;
  message: string;
  remediation?: string;
}

export interface GuardScore {
  errorDetectionScore: number;
  mathRigorScore: number;
  writingStyleScore: number;
  hallucinationScore: number;
  combinedScore: number;
  shortNote: string;
  issues: GuardIssue[];
}

export interface JudgeEnsembleResult {
  median: number;
  min: number;
  max: number;
  spread?: number;
  scores: number[];
  notes: string[];
  calls: number;
  available: boolean;
  verificationDetails?: any[];
}

export interface UniversalRigorResult {
  finalText: string;
  guardScore: GuardScore;
  judgeResult: JudgeEnsembleResult;
  passes: number;
  stable: boolean;
  autoFixesApplied: string[];
  debugLog: any[];
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** Balanced-brace JSON object extractor; prefers candidates with `requiredKey`. */
function parseBestJsonObject(raw: string, requiredKey?: string): any {
  // Prefer a fenced block first
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : raw;

  const candidates: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) { candidates.push(src.slice(start, i + 1)); start = -1; }
    }
  }
  const ordered = requiredKey
    ? [...candidates].reverse().sort((a, b) =>
        Number(b.includes(`"${requiredKey}"`)) - Number(a.includes(`"${requiredKey}"`)))
    : candidates;
  for (const c of ordered) { try { return JSON.parse(c); } catch { /* try next */ } }
  return {};
}

function buildRemediationBlock(issues: GuardIssue[]): string {
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const i of issues) {
    if (!i.remediation || seen.has(i.remediation)) continue;
    seen.add(i.remediation);
    hints.push(`- [${i.code}] ${i.remediation}`);
    if (hints.length >= 10) break;
  }
  return hints.length > 0
    ? `\n\nREMEDIATION HINTS (apply where appropriate; preserve correct content):\n${hints.join("\n")}`
    : "";
}

function stripMetaDiscourse(text: string): string {
  let s = text;
  s = s.replace(/###\s*Deterministic Audit Overlay[\s\S]*?(?=\n###|\n---|$)/gi, "");
  s = s.replace(/based on the provided data/gi, "");
  return s.trim();
}

// ─── FLAW SCAN (delegates to registry) ─────────────────────────────────────
export function scanUniversalFlaws(
  prompt: string,
  answer: string,
  computeRecords: ComputeRecord[],
  constraints: ExtractedConstraints,
  sources?: ScanSource[],
  extra?: { anchorDateISO?: string; domainTags?: string[]; templateId?: string },
): GuardIssue[] {
  ensureFlawsLoaded();
  const ctx: ScanContext = {
    prompt, answer, lowerAnswer: answer.toLowerCase(),
    computeRecords, constraints,
    sources,
    anchorDateISO: extra?.anchorDateISO,
    domainTags: extra?.domainTags,
    templateId: extra?.templateId,
  };
  return runFlawScan(ctx).map((i) => {
    const out: GuardIssue = { severity: i.severity, code: i.code, message: i.message };
    if (i.remediation) out.remediation = i.remediation;
    return out;
  });
}

// ─── OVERLAY ──────────────────────────────────────────────────────────────
export function generateUniversalOverlay(
  computeRecords: ComputeRecord[],
  constraints: ExtractedConstraints,
): string {
  let overlay = `\n\n---\n\n### Deterministic Audit Overlay (Universal)\n`;
  if (constraints.timeHorizon || constraints.explicitComparisonTargets.length > 0) {
    overlay += `**Active Constraints:**\n`;
    if (constraints.timeHorizon) overlay += `- Horizon: ${constraints.timeHorizon.days} days\n`;
    if (constraints.explicitComparisonTargets.length > 0)
      overlay += `- Targets: ${constraints.explicitComparisonTargets.join(", ")}\n`;
  }
  if (computeRecords.length > 0) {
    overlay += `\n**Computed Ground Truth (MUST MATCH EXACTLY):**\n`;
    for (const rec of computeRecords) {
      if (rec.ok && rec.result) overlay += `- ${rec.label} [${rec.formula}]: ${JSON.stringify(rec.result)}\n`;
      else overlay += `- ${rec.label}: FAILED (${rec.error})\n`;
    }
  } else {
    overlay += `\n**Computed Ground Truth:** None required/generated.\n`;
  }
  return overlay;
}

// ─── SCORING ──────────────────────────────────────────────────────────────
export function scoreUniversalGuard(
  prompt: string, answer: string,
  computeRecords: ComputeRecord[], constraints: ExtractedConstraints,
  sources?: ScanSource[],
  extra?: { anchorDateISO?: string; domainTags?: string[]; templateId?: string },
): GuardScore {
  const issues = scanUniversalFlaws(prompt, answer, computeRecords, constraints, sources, extra);

  let err = 10, math = 10, style = 9.5, hall = 0;
  for (const issue of issues) {
    if (issue.severity === "critical") { err -= 2.5; math -= 2.0; hall += 2.5; }
    else if (issue.severity === "major") { err -= 1.2; math -= 1.5; hall += 1.2; }
    else if (issue.severity === "warning") { err -= 0.4; math -= 0.4; hall += 0.4; }
  }

  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  if (wordCount < 40) {
    style -= 1.5;
    issues.push({ severity: "warning", code: "LOW_INFORMATION_DENSITY", message: "Answer lacks contextual depth." });
  }

  err = clamp(err, 0, 10); math = clamp(math, 0, 10); style = clamp(style, 0, 10); hall = clamp(hall, 0, 10);
  const combinedScore = round(0.40 * err + 0.30 * math + 0.20 * style + 0.10 * (10 - hall), 2);

  return {
    errorDetectionScore: round(err, 2),
    mathRigorScore: round(math, 2),
    writingStyleScore: round(style, 2),
    hallucinationScore: round(hall, 2),
    combinedScore,
    shortNote: `Score: ${combinedScore}/10 | Issues: ${issues.length ? issues.map(i => `${i.code}(${i.severity})`).join(", ") : "none"}`,
    issues,
  };
}

// ─── MULTI-AGENT REFINEMENT PIPELINE ──────────────────────────────────────
export async function executeUniversalRigorPipeline(opts: {
  initialDraft: string;
  userQuery: string;
  baseParams: GenerateParams;
  computeRecords: ComputeRecord[];
  constraints: ExtractedConstraints;
  rpm?: number;
  maxDepth?: number;
  sources?: ScanSource[];
  anchorDateISO?: string;
  domainTags?: string[];
  templateId?: string;
  judgeModels?: ModelId[];
  onDebug?: (msg: string) => void;
}): Promise<UniversalRigorResult> {
  const maxDepth = clamp(opts.maxDepth ?? 3, 1, 5);
  const debugLog: any[] = [];
  let currentDraft = opts.initialDraft;
  let stable = false;
  let finalScore: GuardScore | null = null;
  let actualDepth = 0;
  const allAutoFixes: string[] = [];

  const scanExtra = {
    anchorDateISO: opts.anchorDateISO,
    domainTags: opts.domainTags,
    templateId: opts.templateId,
  };

  const buildAutoFixCtx = (ans: string): ScanContext => ({
    prompt: opts.userQuery,
    answer: ans,
    lowerAnswer: ans.toLowerCase(),
    computeRecords: opts.computeRecords,
    constraints: opts.constraints,
    sources: opts.sources,
    anchorDateISO: opts.anchorDateISO,
    domainTags: opts.domainTags,
    templateId: opts.templateId,
  });

  const overlay = generateUniversalOverlay(opts.computeRecords, opts.constraints);
  opts.onDebug?.(`[Universal Rigor] Starting multi-agent loop (max depth ${maxDepth})`);

  for (let d = 1; d <= maxDepth; d++) {
    actualDepth = d;

    // Loop-top deterministic auto-fix
    const af = runAutoFix(currentDraft, buildAutoFixCtx(currentDraft));
    if (af.applied.length > 0) {
      currentDraft = af.text;
      allAutoFixes.push(...af.applied);
      opts.onDebug?.(`[Universal Rigor] Deterministic auto-fix (pass ${d}): ${af.applied.join(", ")}`);
    }

    const score = scoreUniversalGuard(
      opts.userQuery, currentDraft, opts.computeRecords, opts.constraints,
      opts.sources, scanExtra,
    );
    finalScore = score;

    if (score.combinedScore >= 9.5 && !score.issues.some(i => i.severity === "critical")) {
      opts.onDebug?.(`[Universal Rigor] ✓ Stable at depth ${d} (Score: ${score.combinedScore})`);
      stable = true;
      break;
    }

    opts.onDebug?.(`[Universal Rigor] Depth ${d} failed (Score: ${score.combinedScore}, ${score.issues.length} issues). Running Critique → Editor.`);

    // Build remediation hints for both critique + editor
    const remediationBlock = buildRemediationBlock(score.issues);

    // 1. Critique Pass
    const critiqueSys = `You are a strict deterministic auditor. Review the DRAFT against the REFERENCE OVERLAY and the listed ISSUES. Return JSON: {"clear": boolean, "errors": string[], "corrections": string[]}.${remediationBlock}\n\nREFERENCE OVERLAY:\n${overlay}\n\nISSUES DETECTED:\n${JSON.stringify(score.issues)}\n\nDRAFT:\n${currentDraft}`;

    const critique = await throttle(
      () => generateSynthesizedResponse({ ...opts.baseParams, userMessage: critiqueSys, conversationHistory: [] }),
      { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[Universal Rigor] RPM wait ${ms}ms`) }
    );
    debugLog.push({ stage: `Critique ${d}`, content: critique });

    // 2. Editor Pass
    const editorSys = `You are the final editor. Fix the draft based on the CRITIQUE and REFERENCE OVERLAY. You MUST preserve all correct content, units, and deterministic values. Output ONLY the revised prose. Do not output JSON or commentary.${remediationBlock}\n\nREFERENCE OVERLAY:\n${overlay}\n\nCRITIQUE:\n${critique}\n\nDRAFT:\n${currentDraft}`;

    const revised = await throttle(
      () => generateSynthesizedResponse({ ...opts.baseParams, userMessage: editorSys, conversationHistory: [] }),
      { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[Universal Rigor] RPM wait ${ms}ms`) }
    );

    currentDraft = revised.trim();
    debugLog.push({ stage: `Editor ${d}`, content: currentDraft });
  }

  if (!finalScore) {
    finalScore = scoreUniversalGuard(
      opts.userQuery, currentDraft, opts.computeRecords, opts.constraints,
      opts.sources, scanExtra,
    );
  }

  // Final post-loop auto-fix — closes the last-editor leak gap
  const finalAf = runAutoFix(currentDraft, buildAutoFixCtx(currentDraft));
  if (finalAf.applied.length > 0) {
    currentDraft = finalAf.text;
    allAutoFixes.push(...finalAf.applied);
    opts.onDebug?.(`[Universal Rigor] Final auto-fix: ${finalAf.applied.join(", ")}`);
  }

  // Always re-score the exact shipped draft
  finalScore = scoreUniversalGuard(
    opts.userQuery, currentDraft, opts.computeRecords, opts.constraints,
    opts.sources, scanExtra,
  );

  // Promote stable if final draft qualifies
  if (!stable && finalScore.combinedScore >= 9.5 && !finalScore.issues.some(i => i.severity === "critical")) {
    stable = true;
    opts.onDebug?.(`[Universal Rigor] Stabilized by final draft score ${finalScore.combinedScore}.`);
  }

  // Blind Third-Party Judge (parallel)
  opts.onDebug?.(`[Universal Rigor] Running Blind Third-Party Judge Ensemble`);
  const judgeResult = await judgeEnsembleUniversal({
    prompt: opts.userQuery,
    draft: currentDraft,
    overlay,
    baseParams: opts.baseParams,
    rpm: opts.rpm,
    judgeModels: opts.judgeModels,
    onDebug: opts.onDebug,
  });

  return {
    finalText: currentDraft,
    guardScore: finalScore,
    judgeResult,
    passes: actualDepth,
    stable,
    autoFixesApplied: allAutoFixes,
    debugLog,
  };
}

// ─── BLIND JUDGE (parallel, optional cross-model) ─────────────────────────
async function judgeEnsembleUniversal(opts: {
  prompt: string;
  draft: string;
  overlay: string;
  baseParams: GenerateParams;
  samples?: number;
  rpm?: number;
  judgeModels?: ModelId[];
  onDebug?: (msg: string) => void;
}): Promise<JudgeEnsembleResult> {
  const samples = opts.samples ?? 3;
  const blindDraft = stripMetaDiscourse(opts.draft);

  const judgeSystem = `You are an INDEPENDENT third-party grader. You did NOT write the answer. Grade skeptically.

MANDATORY VERIFICATION PROTOCOL:
Step 1 (TOPIC MATCH): Does the answer address the prompt? If completely off-topic, HARD CAP score at 2.0.
Step 2 (NUMERIC DERIVATION): Compare the answer's numbers to the REFERENCE OVERLAY. If they contradict, HARD CAP at 5.0.
Step 3 (LOGICAL CONSISTENCY): Are there internal contradictions? If yes, HARD CAP at 3.0.
Step 4 (UNITS): If numeric prompt lacks units, HARD CAP at 7.0.
Step 5 (OUTPUT): Return STRICT JSON ONLY:
{"combinedScore":<0-10>,"topicMatch":<true|false>,"numbersMatchOverlay":<true|false>,"shortNote":<string>}

REFERENCE OVERLAY:
${opts.overlay}

USER PROMPT:
${opts.prompt}

ANSWER UNDER REVIEW:
${blindDraft.slice(0, 15000)}`;

  // Parallel execution with optional cross-model rotation
  const judgePromises = Array.from({ length: samples }, (_, i) => {
    const jm = (opts.judgeModels && opts.judgeModels.length)
      ? opts.judgeModels[i % opts.judgeModels.length]
      : opts.baseParams.model;
    return throttle(
      () => generateSynthesizedResponse({ ...opts.baseParams, model: jm, userMessage: judgeSystem, conversationHistory: [] }),
      { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[Universal Judge] RPM wait ${ms}ms`) }
    ).then(txt => {
      try {
        const parsed = parseBestJsonObject(txt, "combinedScore");
        let sc = Number(parsed.combinedScore);
        if (!Number.isFinite(sc)) sc = 0;
        sc = clamp(sc, 0, 10);
        if (parsed.topicMatch === false) sc = Math.min(sc, 2.0);
        if (parsed.numbersMatchOverlay === false) sc = Math.min(sc, 5.0);
        return {
          score: sc,
          note: parsed.shortNote ? String(parsed.shortNote).slice(0, 200) : "",
          detail: parsed,
        };
      } catch (err: any) {
        return { score: 0, note: `judge_parse_error: ${err?.message ?? ""}`, detail: null };
      }
    }).catch((err: any) => ({ score: 0, note: `judge_call_error: ${err?.message ?? ""}`, detail: null }));
  });

  const results = await Promise.all(judgePromises);
  const scores = results.map(r => r.score);
  const notes = results.map(r => r.note);
  const verificationDetails = results.map(r => r.detail);

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length % 2 !== 0
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;

  return {
    median: round(median, 2),
    min: Math.min(...scores),
    max: Math.max(...scores),
    spread: round(spread, 2),
    scores,
    notes,
    calls: samples,
    available: true,
    verificationDetails,
  };
}
