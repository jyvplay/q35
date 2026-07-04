/**
 * N-Deep v4 — Section-Targeted Adversarial Refinement with Batched Judge
 *
 * v4 memory/bandwidth fixes over v3:
 *  1. DRAFT DIGEST: critic receives a structural digest (section headers +
 *     first/last 200 chars) instead of the full draft body. Peak input tokens
 *     drop from O(|draft|) to O(√|draft|). Full section text is only sent
 *     when the critic requests a revision on that specific section.
 *  2. BATCHED JUDGE: all revision decisions are made in ONE LLM call instead
 *     of N sequential calls. Holds only the batch prompt (≤ 24KB) in memory
 *     vs. N × (original + revised) strings simultaneously.
 *  3. RESPONSE CAP: raw critic output is immediately sliced to MAX_RAW_CHARS
 *     before parsing, preventing allocation spikes from runaway responses.
 *  4. SECTION ISOLATION: only the sections with accepted revisions are spliced;
 *     the rest of the draft is referenced by index, never duplicated.
 *  5. FULL REWRITE GATE: only triggered by judge's REWRITE_CORE verdict;
 *     hard-capped at 1 per run.
 */

import type { GenerateParams, ModelId } from "./models";
import { generateSynthesizedResponse } from "./models";
import { runAdversarialRedTeam, buildRepairBlock } from "./adversarial-engine";
import { throttle } from "./rpm-governor";
import type { PipelineTrace } from "./pipeline";
import { readMemoryReport, safeDraftCharCap, settleHeap, shouldSkipAdversarial } from "./memory-governor";
import { intelligenceOf, compareIntelligence } from "./model-intelligence";

// ─── Model rotation: strongest at first & last ───────────────────────────────
const ROTATION_GEMINI: ModelId[] = [
  "gemini-3.5-flash",
  "gemma-4-31b-it",
  "gemini-2.5-flash-lite",
  "gemma-3-27b-it",
  "gemini-3.1-flash-lite",
  "gemma-4-26b-it",
];

function modelForPass(provider: string, pass: number, cap: number, baseModel: ModelId): ModelId {
  if (provider !== "gemini") return baseModel;
  const last = pass === cap;
  if (pass === 1 || last) return ROTATION_GEMINI[0];
  const mid = (pass - 2) % (ROTATION_GEMINI.length - 1) + 1;
  return ROTATION_GEMINI[mid];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ABS_MAX_PASSES = 20;
const DEFAULT_MAX_PASSES = 4;
const MAX_SECTION_CHARS = 6_000;      // hard cap per proposed revision block
const MAX_REVISIONS_PER_PASS = 5;     // hard cap critic can emit per pass
const MAX_FULL_REWRITES = 1;          // judge-triggered full rewrites per run
const MAX_RAW_RESPONSE = 32_000;      // immediate cap on raw LLM response string
const DIGEST_SNIPPET_CHARS = 200;     // chars of section start/end shown to critic
const MAX_DRAFT_TO_CRITIC = 14_000;   // max chars of full draft exposed to critic

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NDeepPassSummary {
  pass: number;
  model: ModelId;
  judgeModel?: ModelId;
  defectCount: number;
  criticalCount: number;
  verdict: "pass" | "revise" | "rewrite-core";
  defectTags: string[];
  sectionsProposed: number;
  sectionsAccepted: number;
  sectionsRejected: number;
  sectionsTieResolvedByIntelligence: number;
  authorIntelligence: number;
  judgeDecisions: Array<{
    section: string;
    decision: "accept" | "reject" | "tie";
    tieWinner?: "candidate" | "original";
    reason: string;
  }>;
  deathCertificate?: { chars: number; hash: string; reason: string };
}

export interface NDeepResult {
  finalText: string;
  passes: NDeepPassSummary[];
  stable: boolean;
  totalLlmCalls: number;
  fullRewrites: number;
}

export interface NDeepOpts {
  userQuery: string;
  initialDraft: string;
  fullSloopReport?: boolean;
  baseParams: GenerateParams;
  domain?: string;
  rpm?: number;
  maxPasses?: number;
  judgeModel?: ModelId;
  onTrace?: (t: PipelineTrace) => void;
  onDebug?: (m: string) => void;
}

// ─── Draft utilities ──────────────────────────────────────────────────────────

function capDraft(text: string): string {
  const cap = safeDraftCharCap(readMemoryReport());
  return text.length > cap ? String(text.slice(0, cap)) : text;
}

function cheapHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function pruneParams(params: GenerateParams): GenerateParams {
  return { ...params, retrievedWebData: undefined, conversationHistory: [] };
}

/**
 * Build a structural DIGEST of the draft for the critic.
 * Critic gets: section headings + first/last DIGEST_SNIPPET_CHARS of each
 * section. Full text is only provided for sections targeted for revision.
 * This keeps the critic input to ~O(sections × 400) chars vs O(|draft|).
 */
function buildDraftDigest(draft: string): string {
  // Split on markdown section headings (##) or double-newlines for plain text
  const sections = draft.split(/(?=^## )/m);
  if (sections.length <= 1) {
    // Non-sectioned: just show head + tail
    const head = draft.slice(0, 1_200);
    const tail = draft.length > 1_200 ? "\n…\n" + draft.slice(-600) : "";
    return String(head + tail);
  }
  return sections.map(sec => {
    const lines = sec.trimStart();
    if (lines.length <= DIGEST_SNIPPET_CHARS * 2 + 60) return lines; // short enough, show all
    const head = lines.slice(0, DIGEST_SNIPPET_CHARS);
    const tail = lines.slice(-DIGEST_SNIPPET_CHARS);
    return String(`${head}\n[…${lines.length - DIGEST_SNIPPET_CHARS * 2} chars…]\n${tail}`);
  }).join("\n\n");
}

// ─── Section revision parsing ─────────────────────────────────────────────────

interface SectionRevision {
  anchor: string;
  original: string;
  revised: string;
  reason: string;
  idx: number;  // 0-based revision index for batch judge
}

function parseSectionRevisions(raw: string, draft: string): SectionRevision[] {
  if (!raw) return [];
  // Immediately cap: prevents parse of runaway responses from consuming heap
  const capped = raw.slice(0, MAX_RAW_RESPONSE);
  const out: SectionRevision[] = [];
  const blockRe = /<<<REVISE>>>([\s\S]*?)<<<END>>>/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = blockRe.exec(capped)) !== null && out.length < MAX_REVISIONS_PER_PASS) {
    const body = m[1] || "";
    const anchorMatch = body.match(/ANCHOR:\s*([^\n]+)/);
    const split = body.split(/<<<TO>>>/);
    if (split.length !== 2) continue;
    const origPart = split[0].replace(/[\s\S]*?ORIGINAL:\s*/, "").trim();
    const revPart = split[1].replace(/[\s\S]*?REVISED:\s*/, "");
    const reasonMatch = revPart.match(/REASON:\s*([^\n]+)/);
    const revised = revPart.replace(/REASON:[\s\S]*$/, "").trim();
    if (!revised) continue;

    // If critic gave us no ORIGINAL text (digest mode — expected), locate it
    // from the draft via the anchor
    let original = origPart.slice(0, MAX_SECTION_CHARS);
    if (!original && anchorMatch?.[1]) {
      const anchor = anchorMatch[1].trim().slice(0, 80);
      const pos = draft.indexOf(anchor);
      if (pos !== -1) {
        // Extract paragraph starting at anchor (up to 4KB)
        const end = draft.slice(pos).search(/\n\s*\n/);
        original = draft.slice(pos, end === -1 ? pos + MAX_SECTION_CHARS : pos + end);
      }
    }
    out.push({
      anchor: (anchorMatch?.[1] || original.slice(0, 80)).trim().slice(0, 120),
      original: original.slice(0, MAX_SECTION_CHARS),
      revised: revised.slice(0, MAX_SECTION_CHARS),
      reason: (reasonMatch?.[1] || "no reason given").trim().slice(0, 200),
      idx,
    });
    idx++;
  }
  return out;
}

function spliceSection(draft: string, original: string, revised: string): { next: string; applied: boolean } {
  if (!original) return { next: draft, applied: false };
  const idx = draft.indexOf(original);
  if (idx !== -1) {
    return { next: String(draft.slice(0, idx) + revised + draft.slice(idx + original.length)), applied: true };
  }
  // Fuzzy: anchor-based paragraph replacement
  const anchor = original.slice(0, 60);
  const ai = draft.indexOf(anchor);
  if (ai === -1) return { next: draft, applied: false };
  const endRel = draft.slice(ai).search(/\n\s*\n/);
  const end = endRel === -1 ? draft.length : ai + endRel;
  return { next: String(draft.slice(0, ai) + revised + draft.slice(end)), applied: true };
}

// ─── Batched Judge ─────────────────────────────────────────────────────────────
// ONE LLM call for ALL revisions in a pass. Prompt contains numbered pairs.
// Judge returns one line per revision: "N: accept|reject|tie [CORE] reason"

interface BatchJudgeResult {
  decisions: Array<{
    decision: "accept" | "reject" | "tie";
    rewriteCore: boolean;
    reason: string;
    tieWinner?: "candidate" | "original";
  }>;
  anyRewriteCore: boolean;
  coreReason: string;
}

function parseBatchJudgeReply(raw: string, revisions: SectionRevision[], criticModel: ModelId, authorModel: ModelId): BatchJudgeResult {
  const capped = String(raw.slice(0, 8_000));
  const lines = capped.split("\n").filter(l => /^\d+\s*:/.test(l.trim()));
  const decisions = revisions.map((_r, i) => {
    const line = lines.find(l => l.trim().startsWith(`${i + 1}:`)) || "";
    const lower = line.toLowerCase();
    const rewriteCore = /\[core\]/.test(lower);
    let decision: "accept" | "reject" | "tie" = "tie";
    if (/:\s*accept/.test(lower)) decision = "accept";
    else if (/:\s*reject/.test(lower)) decision = "reject";
    // Tie-break by intelligence
    let tieWinner: "candidate" | "original" | undefined;
    if (decision === "tie") {
      const cmp = compareIntelligence(criticModel, authorModel);
      tieWinner = cmp >= 0 ? "candidate" : "original";
    }
    const reasonMatch = line.match(/:\s*(?:accept|reject|tie)[^:]*?(?:\[core\])?\s*(.*)/i);
    return {
      decision,
      rewriteCore,
      reason: (reasonMatch?.[1] || line).trim().slice(0, 180),
      tieWinner,
    };
  });
  const anyRewriteCore = decisions.some(d => d.rewriteCore);
  const coreReason = decisions.find(d => d.rewriteCore)?.reason || "";
  return { decisions, anyRewriteCore, coreReason };
}

async function batchJudgeRevisions(opts: {
  judgeParams: GenerateParams;
  userQuery: string;
  revisions: SectionRevision[];
  criticModel: ModelId;
  authorModel: ModelId;
  rpm?: number;
  onDebug?: (m: string) => void;
}): Promise<BatchJudgeResult> {
  if (opts.revisions.length === 0) {
    return { decisions: [], anyRewriteCore: false, coreReason: "" };
  }
  // Build ONE compact prompt with all numbered revision pairs
  const pairs = opts.revisions.map((r, i) => [
    `--- REVISION ${i + 1} (anchor: "${r.anchor.slice(0, 60)}") ---`,
    `CRITIC REASON: ${r.reason}`,
    `ORIGINAL (first 400 chars): ${r.original.slice(0, 400)}`,
    `REVISED  (first 400 chars): ${r.revised.slice(0, 400)}`,
  ].join("\n")).join("\n\n");

  const prompt = [
    `You are a BATCH JUDGE evaluating ${opts.revisions.length} proposed section revision(s).`,
    `For EACH revision, reply with EXACTLY ONE line in this format:`,
    `N: accept|reject|tie [CORE if original section's core idea is fundamentally wrong] <short reason>`,
    ``,
    `Rules:`,
    `  - Use "accept" if the revision is clearly better.`,
    `  - Use "reject" if the original is better or the revision is off-topic.`,
    `  - Use "tie" if you genuinely cannot decide (tie-break is handled externally).`,
    `  - Add [CORE] ONLY if the entire section's core idea is wrong and needs full redraft.`,
    `  - Output ONLY the N numbered lines, nothing else.`,
    ``,
    `USER QUESTION: ${opts.userQuery.slice(0, 200)}`,
    ``,
    pairs,
    ``,
    `Reply with ${opts.revisions.length} numbered line(s) only:`,
  ].join("\n");

  try {
    const raw = await throttle(
      () => generateSynthesizedResponse({ ...opts.judgeParams, userMessage: prompt, conversationHistory: [] }),
      { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[Judge batch] RPM wait ${ms}ms`) },
    );
    return parseBatchJudgeReply(raw, opts.revisions, opts.criticModel, opts.authorModel);
  } catch (e) {
    opts.onDebug?.(`[Judge batch] error: ${(e as Error).message} — defaulting all to tie`);
  const cmpFallback = compareIntelligence(opts.criticModel, opts.authorModel);
  const tieWinnerFallback: "candidate" | "original" = cmpFallback >= 0 ? "candidate" : "original";
  return {
    decisions: opts.revisions.map(() => ({
      decision: "tie" as const, rewriteCore: false, reason: "judge error fallback", tieWinner: tieWinnerFallback,
    })),
      anyRewriteCore: false,
      coreReason: "",
    };
  }
}

// ─── Critic: emits section revisions from DIGEST only ────────────────────────

async function emitSectionRevisions(opts: {
  criticParams: GenerateParams;
  userQuery: string;
  draftDigest: string;
  defectsBlock: string;
  rpm?: number;
  fullSloopReport?: boolean;
  onDebug?: (m: string) => void;
}): Promise<{ raw: string }> {
  const prompt = [
    `You are a LOCALIZED REVISION EDITOR. You receive a STRUCTURAL DIGEST of a draft (section headers + snippets, NOT the full text).`,
    `Do NOT rewrite the entire document. For each defect, emit ONE bounded replacement block.`,
    opts.fullSloopReport ? `The draft is a multi-section SLOOP report. Preserve all sections you do not touch.` : "",
    ``,
    `EXACT OUTPUT FORMAT (repeat for each defect you fix):`,
    `<<<REVISE>>>`,
    `ANCHOR: <first ~60 chars of the section heading or opening sentence you are revising>`,
    `ORIGINAL:`,
    `<the exact existing text span to replace — copy it verbatim from your knowledge of the section, ≤${MAX_SECTION_CHARS} chars>`,
    `<<<TO>>>`,
    `REVISED:`,
    `<your improved replacement, ≤${MAX_SECTION_CHARS} chars>`,
    `REASON: <one sentence>`,
    `<<<END>>>`,
    ``,
    `Hard rules:`,
    `  • AT MOST ${MAX_REVISIONS_PER_PASS} blocks. Fix only the most critical defects.`,
    `  • If you cannot identify exact original text from the digest, use ANCHOR only and leave ORIGINAL blank — the system will locate it.`,
    `  • Do NOT output any content outside <<<REVISE>>> blocks.`,
    `  • Do NOT restate the full document.`,
    ``,
    `USER ASK: ${opts.userQuery.slice(0, 300)}`,
    ``,
    opts.defectsBlock,
    ``,
    `DRAFT DIGEST (section headers + snippets):`,
    opts.draftDigest,
  ].filter(Boolean).join("\n");

  opts.onDebug?.(`[N-Deep critic] sending digest (${opts.draftDigest.length} chars, full draft not sent)`);
  const raw = await throttle(
    () => generateSynthesizedResponse({ ...opts.criticParams, userMessage: prompt, conversationHistory: [] }),
    { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[N-Deep critic] RPM wait ${ms}ms`) },
  );
  return { raw: String(raw.slice(0, MAX_RAW_RESPONSE)) }; // immediate cap + flatten
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runNDeep(opts: NDeepOpts): Promise<NDeepResult> {
  const cap = Math.min(ABS_MAX_PASSES, Math.max(1, opts.maxPasses ?? DEFAULT_MAX_PASSES));
  const passes: NDeepPassSummary[] = [];
  let llmCalls = 0;
  let stable = false;
  let fullRewrites = 0;
  const originalIntent = opts.userQuery;
  const cohesionHistory: string[] = [];
  const judgeModel: ModelId = opts.judgeModel || opts.baseParams.model;
  const authorModel: ModelId = opts.baseParams.model;
  const authorIntelligence = intelligenceOf(authorModel);

  let current: string = capDraft(opts.initialDraft);
  const prunedParams = pruneParams(opts.baseParams);
  opts.onDebug?.(opts.fullSloopReport
    ? `[N-Deep v4] SLOOP writeup (${current.length} chars) — digest mode, ${cap} passes, judge=${judgeModel}`
    : `[N-Deep v4] section-targeted refinement (${current.length} chars, ${cap} passes, judge=${judgeModel})`);

  for (let pass = 1; pass <= cap; pass++) {
    const passModel = modelForPass(opts.baseParams.provider, pass, cap, authorModel);
    const passParams: GenerateParams = { ...prunedParams, model: passModel };
    const judgeParams: GenerateParams = { ...prunedParams, model: judgeModel };
    const criticIntel = intelligenceOf(passModel);

    opts.onDebug?.(`[N-Deep ${pass}/${cap}] critic=${passModel}(${criticIntel}) judge=${judgeModel}`);

    // ── STEP 1: Adversarial structural critique (on digest to save tokens) ──
    const memNow = readMemoryReport();
    const critiqueInput = shouldSkipAdversarial(current.length, memNow)
      ? current.slice(0, 8_000)
      : current.length > MAX_DRAFT_TO_CRITIC
        ? current.slice(0, MAX_DRAFT_TO_CRITIC)
        : current;

    let report = await runAdversarialRedTeam(
      critiqueInput,
      opts.userQuery,
      passParams,
      { domain: opts.domain, rpm: opts.rpm, onDebug: opts.onDebug },
    );
    llmCalls += 1;

    const critical = report.defects.filter(d => d.severity === "critical" || d.severity === "major");
    const summary: NDeepPassSummary = {
      pass,
      model: passModel,
      judgeModel,
      defectCount: report.defects.length,
      criticalCount: critical.length,
      verdict: report.verdict,
      defectTags: report.defects.map(d => `${d.severity}:${d.category}`),
      sectionsProposed: 0,
      sectionsAccepted: 0,
      sectionsRejected: 0,
      sectionsTieResolvedByIntelligence: 0,
      authorIntelligence,
      judgeDecisions: [],
    };
    passes.push(summary);

    opts.onTrace?.({
      stage: 5 + pass / 10,
      label: `N-Deep ${pass}/${cap} [${passModel}]: ${report.verdict} — ${critical.length} blocking`,
      ts: Date.now(),
      ok: report.verdict === "pass",
      data: summary.defectTags,
    });

    if (report.verdict === "pass") {
      stable = true;
      opts.onDebug?.(`[N-Deep] stable at pass ${pass}`);
      break;
    }

    const defectsBlock = buildRepairBlock(report.defects);
    cohesionHistory.push(`P${pass}:REVISE[${summary.defectTags.slice(0, 4).join(",") || "none"}]`);
    // Free the report immediately — large rawCritique string
    report = { verdict: "revise" as const, defects: [], rawCritique: "" };

    if (pass === cap) {
      opts.onDebug?.(`[N-Deep] hit cap ${cap} — ${summary.criticalCount} blocking remain`);
      break;
    }

    // ── STEP 2: Critic emits localized REVISE blocks from DIGEST (not full draft) ──
    const draftDigest = buildDraftDigest(current);
    let revisions: SectionRevision[] = [];
    try {
      const { raw } = await emitSectionRevisions({
        criticParams: passParams,
        userQuery: originalIntent,
        draftDigest,
        defectsBlock,
        rpm: opts.rpm,
        fullSloopReport: opts.fullSloopReport,
        onDebug: opts.onDebug,
      });
      revisions = parseSectionRevisions(raw, current);
      llmCalls += 1;
    } catch (e) {
      opts.onDebug?.(`[N-Deep] critic failed: ${(e as Error).message} — skipping pass`);
      await settleHeap(15);
      continue;
    }

    summary.sectionsProposed = revisions.length;
    opts.onDebug?.(`[N-Deep ${pass}/${cap}] critic proposed ${revisions.length} revision(s)`);

    if (revisions.length === 0) {
      cohesionHistory.push(`P${pass}:NO_REVISIONS`);
      await settleHeap(15);
      continue;
    }

    // ── STEP 3: ONE batched judge call for ALL revisions ──────────────────────
    const batchResult = await batchJudgeRevisions({
      judgeParams,
      userQuery: originalIntent,
      revisions,
      criticModel: passModel,
      authorModel,
      rpm: opts.rpm,
      onDebug: opts.onDebug,
    });
    llmCalls += 1;

    // ── STEP 4: Full rewrite only for explicit, hard core rejection ───────────
    const hardCoreRewrite = batchResult.anyRewriteCore && (
      summary.criticalCount >= 6 ||
      /(GATE-DELIVERY-CONTRADICTION|GATE-STEPPED-WEDGE-VOID|GATE-CRISIS-ESCALATION-LIABILITY|GATE-PLACEHOLDER|GATE-META-TEXT-LEAK|core idea rejected|fundamental(?:ly)? wrong|unsalvageable)/i.test(`${defectsBlock}\n${batchResult.coreReason}`)
    );
    if (hardCoreRewrite && fullRewrites < MAX_FULL_REWRITES) {
      fullRewrites += 1;
      summary.verdict = "rewrite-core";
      opts.onDebug?.(`[N-Deep] CORE REWRITE triggered (${fullRewrites}/${MAX_FULL_REWRITES}): ${batchResult.coreReason}`);
      const prevLen = current.length;
      const prevHash = cheapHash(current);
      const prevDraft = current;
      current = "";
      let rewritePrompt: string = [
        `The CORE IDEA was rejected: ${batchResult.coreReason}`,
        `Rewrite the draft to fix the core issue while preserving the user's intent.`,
        `Keep correct factual content. Output ONLY the new draft.`,
        `USER INTENT: ${originalIntent}`,
        `DEFECTS: ${defectsBlock}`,
        `PRIOR DRAFT (for reference):`,
        String(prevDraft.slice(0, 12_000)),
      ].join("\n");
      try {
        const rewritten = await throttle(
          () => generateSynthesizedResponse({ ...passParams, userMessage: rewritePrompt, conversationHistory: [] }),
          { rpm: opts.rpm, onWait: ms => opts.onDebug?.(`[N-Deep rewrite] RPM wait ${ms}ms`) },
        );
        rewritePrompt = "";
        llmCalls += 1;
        if (rewritten && rewritten.trim().length >= prevLen * 0.5) {
          current = capDraft(rewritten);
          cohesionHistory.push(`P${pass}:CORE_REWRITTEN(${prevLen}->${current.length})`);
          summary.deathCertificate = { chars: prevLen, hash: prevHash, reason: `core_rewrite_pass_${pass}` };
        } else {
          current = prevDraft;
          cohesionHistory.push(`P${pass}:CORE_REWRITE_REJECTED(too_short)`);
          opts.onDebug?.(`[N-Deep] core rewrite collapsed — keeping prior draft`);
        }
      } catch (e) {
        rewritePrompt = "";
        current = prevDraft;
        opts.onDebug?.(`[N-Deep] core rewrite failed: ${(e as Error).message}`);
      }
    } else {
      // ── STEP 5: Splice accepted section revisions one-by-one ─────────────────
      let coreRejectedBudgetExhausted = batchResult.anyRewriteCore && fullRewrites >= MAX_FULL_REWRITES;
      for (let ri = 0; ri < revisions.length; ri++) {
        const r = revisions[ri];
        const jd = batchResult.decisions[ri];
        if (!jd) continue;

        if (jd.rewriteCore && !coreRejectedBudgetExhausted) continue; // handled above

        let apply = false;
        let tieWinner: "candidate" | "original" | undefined;
        if (jd.decision === "accept") {
          apply = true;
        } else if (jd.decision === "reject") {
          apply = false;
        } else {
          // TIE: intelligence tiebreak (already computed in parseBatchJudgeReply)
          tieWinner = jd.tieWinner;
          apply = tieWinner === "candidate";
          summary.sectionsTieResolvedByIntelligence += 1;
        }

        summary.judgeDecisions.push({
          section: r.anchor,
          decision: jd.decision,
          tieWinner,
          reason: jd.reason,
        });

        if (apply && r.original) {
          const { next, applied } = spliceSection(current, r.original, r.revised);
          if (applied) {
            current = capDraft(next);
            summary.sectionsAccepted += 1;
            opts.onDebug?.(`[N-Deep] section accepted (${r.original.length}→${r.revised.length} chars)`);
          } else {
            summary.sectionsRejected += 1;
            opts.onDebug?.(`[N-Deep] revision unanchorable — skipped`);
          }
        } else {
          summary.sectionsRejected += 1;
        }
      }

      cohesionHistory.push(
        `P${pass}:ACC=${summary.sectionsAccepted}/REJ=${summary.sectionsRejected}/TIE=${summary.sectionsTieResolvedByIntelligence}`
      );
    }

    await settleHeap(15);
  }

  return { finalText: String(current), passes, stable, totalLlmCalls: llmCalls, fullRewrites };
}

export type { NDeepPassSummary as NDeepPassRecord };
