/**
 * V15 Pipeline entry — Multi-Agent Refinement with Rotation & Elo Consensus.
 *
 * Flow: Draft → scanUniversalFlaws → autoFix → re-scan → parallel Elo Judges.
 * If score < 9.0 or critical issues remain, enters iterative multi-agent loop
 * (Critique → Editor) up to maxDepth using fast model rotation.
 */
import { ensureFlawsLoaded } from "./flaws";
import { runFlawScan, runAutoFix, type ScanContext } from "./flaw-registry";
import { generateWithRotation, parallelJudgeRotation, getActiveRotationPool } from "./model-rotator";
import { calculateEloConsensus, type EloConsensusResult } from "./elo-registry";
import { proposeGateWithLLM, runTestbedGates, type TestbedGate } from "./v15-gate-testbed";
import { ensureOriginalDefensePackLoaded } from "./flaws/original-defenses-pack";
import { groundQuestion } from "./v15-grounding";
import { runAdversarialRedTeam } from "@/lib/adversarial-engine";

/**
 * V15 Pipeline Profile — mirrors the original 4-stage / N-Deep / Cluster /
 * SLOOP knobs from the base app so calibration can benchmark any single
 * profile, any combination, or all together with variable quantities.
 *
 * All fields are OPTIONAL and default to a lightweight profile so nothing
 * breaks when callers don't opt in. When any of the four flags is true,
 * V15 injects the corresponding synthesis-side directives into the drafting
 * system-prompt (still purely additive — the deterministic critique/editor
 * refinement loop and Elo judging run identically underneath).
 */
export interface V15Profile {
  fourStage?: boolean;         // enable 4-stage micro-agent framing
  nDeep?: boolean;             // enable N-Deep recursive adversarial refinement
  nDeepPasses?: number;        // depth cap (1..8), default 4
  cluster?: boolean;           // enable clustered hypothesis synthesis
  clusterSize?: number;        // parallel breadth (1..16), default 8
  sloop?: boolean;             // enable SLOOP long-form report mode
  sloopPages?: number;         // target pages (1..32), default 4
  templateId?: string;         // e.g. "OMEGA-STRATEGY", "NIH-GRANT-SRF"
  styleOverride?: string;      // e.g. "--mckinsey-classic"
  useOriginalDefensePack?: boolean; // register + scan original 246-defense pack
  williamsPersona?: string;    // Williams-style persona archetype to test (e.g. "The Architect")
  adversarial?: boolean;       // run the adversarial red-team engine on the draft
  webSearch?: boolean;         // enable live grounding retrieval
  webBackends?: { ogScraper?: boolean; prismafetch?: boolean; jina?: boolean };
}

/**
 * Independent Comparative Judge — a THIRD judge with a fresh context that sees
 * the QUESTION and BOTH answers (baseline + V15) together and scores each,
 * computes the gap, and lists the concrete improvements each needs to reach 9.9.
 * This is distinct from the per-answer Elo panel (which never sees both answers).
 */
export interface ComparativeJudgeResult {
  baselineScore: number;
  v15Score: number;
  gap: number;
  winner: "baseline" | "v15" | "tie";
  baselineImprovements: string[];
  v15Improvements: string[];
  rationale: string;
  judgeModel: string;
  ok: boolean;
  error?: string;
}

export interface V15RunOutcome {
  question: string;
  draft: string;              // raw model output
  fixed: string;              // after deterministic auto-fix & multi-agent refinement
  issues: { code: string; severity: string; message: string }[];
  autoFixesApplied: string[];
  guardScore: number;         // deterministic 0-10
  judgeScore: number | null;  // Elo-weighted consensus score 0-10
  judgeNote: string;
  eloConsensus?: EloConsensusResult;
  testbedGatesProposed?: TestbedGate[];
  judgeRoster?: { model: string; elo: number; tier?: string; ok: boolean; latencyMs: number; score?: number }[];
  modelUsed: string;
  passes: number;
  stable: boolean;
  totalLatencyMs: number;
  error?: string;
  /** Exact settings this run used (shown per-question in the UI). */
  runSettings?: {
    depth: number; fourStage: boolean; cluster: boolean; clusterSize: number;
    sloop: boolean; sloopPages: number; templateId?: string; styleOverride?: string;
    williamsPersona?: string; adversarial: boolean; webSearch: boolean;
    defensePack: boolean; advancedGates: boolean; singleJudge: boolean;
  };
  groundingProvider?: string;
  groundingCount?: number;
}

/**
 * Deterministic per-question model seed — distributes the STARTING preferred
 * model across the rotation pool based on a stable hash of the question text.
 * This is purely an efficiency improvement: generateWithRotation() already
 * falls back across the full pool on any single failure, but when many
 * questions run concurrently (as the calibration dialog now does), having
 * them all start on the identical "preferred" model concentrates collision
 * risk on one endpoint. Spreading the starting point avoids that without
 * changing any scoring, judging, or fallback semantics.
 */
function pickRotationSeed(text: string, pool: string[]): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

/**
 * Completion / fragmentation check (from the guard-vs-judge divergence critique).
 * A structurally truncated or mid-sentence answer is a hard failure — the LLM
 * judge correctly zeroes these while the regex guard historically under-
 * penalized. We detect it deterministically so the pipeline can Fail-and-Retry
 * BEFORE wasting a judge call on broken content.
 */
export function detectTruncation(text: string, opts?: { longForm?: boolean; targetPages?: number }): { truncated: boolean; reason: string } {
  const t = text.trim();
  if (t.length === 0) return { truncated: true, reason: "empty output" };
  const lastLine = t.slice(t.lastIndexOf("\n") + 1).trim();
  // Hanging structural markers / mid-sentence cut-offs.
  const danglingHyphen = /[-–—]\s*$/.test(lastLine) || /\b\\times\s*$/.test(lastLine);
  const danglingConnector = /[,;:]\s*$|\b(and|or|but|the|a|an|to|of|with|for|in|on|as|by|that|which|because|however|therefore|thus|since|while|where|when|is|are|was|were)\s*$/i.test(lastLine);
  const noTerminal = !/[.!?)"'»”\]\}`]\s*$/.test(lastLine) && !/^[#>|*\-+\d]/.test(lastLine) && /\w$/.test(lastLine) && lastLine.length > 0;
  const openFence = (t.match(/```/g) ?? []).length % 2 !== 0;
  const openMath = (t.match(/\$\$/g) ?? []).length % 2 !== 0;
  // Long-form under-length: requested N pages but got a fragment.
  const longFormShort = !!opts?.longForm && t.length < Math.max(1200, (opts.targetPages ?? 4) * 900);

  if (danglingHyphen) return { truncated: true, reason: "hanging hyphen / mid-formula cut-off" };
  if (danglingConnector) return { truncated: true, reason: "sentence ends on a dangling connector word" };
  if (openFence) return { truncated: true, reason: "unclosed code fence" };
  if (openMath) return { truncated: true, reason: "unclosed math delimiter" };
  if (noTerminal) return { truncated: true, reason: "final line lacks terminal punctuation (mid-sentence cut-off)" };
  if (longFormShort) return { truncated: true, reason: `long-form report far below requested length (${t.length} chars for ~${opts?.targetPages ?? 4} pages)` };
  return { truncated: false, reason: "" };
}

function sevRank(s: string): number {
  return s === "critical" ? 4 : s === "major" ? 3 : s === "warning" ? 2 : 1;
}

/**
 * Run the independent comparative judge (fresh context) over both answers.
 */
export async function runComparativeJudge(opts: {
  apiKey: string;
  question: string;
  baselineAnswer: string;
  v15Answer: string;
  judgeModel?: string;
}): Promise<ComparativeJudgeResult> {
  const pool = getActiveRotationPool();
  const model = opts.judgeModel ?? pool[Math.min(1, pool.length - 1)]; // distinct 2nd-Elo model by default
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const prompt = `You are an INDEPENDENT comparative judge with a completely fresh context (nonce ${nonce}). You are shown a QUESTION and TWO candidate answers (A = baseline, B = V15). Score EACH answer 0-10, compute the gap, and list the SPECIFIC improvements each answer needs to reach a 9.9.

HARD CAPS (apply the lowest that fits, to BOTH answers independently):
- Truncated / mid-sentence / fragment → cap 1
- Formula-only or partial calc with no explanation → cap 3
- Restates question / requires reader to already know the answer → cap 5
- Missing required units, jurisdiction, or scope → cap 6

Reserve 9+ only for answers a competent non-expert could act on immediately.

QUESTION:
${opts.question}

ANSWER A (baseline):
${opts.baselineAnswer.slice(0, 6000)}

ANSWER B (V15):
${opts.v15Answer.slice(0, 6000)}

Return STRICT JSON:
{"baselineScore": <0-10>, "v15Score": <0-10>, "winner": "baseline"|"v15"|"tie", "rationale": "one paragraph", "baselineImprovements": ["...to reach 9.9"], "v15Improvements": ["...to reach 9.9"]}`;

  const res = await generateWithRotation({ apiKey: opts.apiKey, prompt, preferredModel: model, maxOutputTokens: 800 });
  if (!res.ok) {
    return { baselineScore: 0, v15Score: 0, gap: 0, winner: "tie", baselineImprovements: [], v15Improvements: [], rationale: "", judgeModel: res.modelUsed, ok: false, error: res.error };
  }
  try {
    const m = res.text.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : res.text);
    const b = Math.max(0, Math.min(10, Number(j.baselineScore) || 0));
    const v = Math.max(0, Math.min(10, Number(j.v15Score) || 0));
    return {
      baselineScore: b, v15Score: v, gap: Math.round((v - b) * 100) / 100,
      winner: (j.winner === "baseline" || j.winner === "v15" || j.winner === "tie") ? j.winner : (v > b ? "v15" : v < b ? "baseline" : "tie"),
      baselineImprovements: Array.isArray(j.baselineImprovements) ? j.baselineImprovements.map(String).slice(0, 6) : [],
      v15Improvements: Array.isArray(j.v15Improvements) ? j.v15Improvements.map(String).slice(0, 6) : [],
      rationale: String(j.rationale ?? "").slice(0, 600),
      judgeModel: res.modelUsed, ok: true,
    };
  } catch {
    return { baselineScore: 0, v15Score: 0, gap: 0, winner: "tie", baselineImprovements: [], v15Improvements: [], rationale: "parse failure", judgeModel: res.modelUsed, ok: false, error: "json parse" };
  }
}

function scoreFromIssues(issues: { severity: string }[], draftLen: number): number {
  let err = 10, math = 10, style = 9.5, hall = 0;
  for (const i of issues) {
    if (i.severity === "critical") { err -= 2.5; math -= 2.0; hall += 2.5; }
    else if (i.severity === "major") { err -= 1.2; math -= 1.5; hall += 1.2; }
    else if (i.severity === "warning") { err -= 0.4; math -= 0.4; hall += 0.4; }
  }
  if (draftLen < 150) style -= 1.0;
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  err = clamp(err); math = clamp(math); style = clamp(style); hall = clamp(hall);
  const combined = 0.40 * err + 0.30 * math + 0.20 * style + 0.10 * (10 - hall);
  return Math.round(combined * 100) / 100;
}

/**
 * Full V15 run against one question with multi-agent loop and rotation.
 */
export async function runV15OnQuestion(opts: {
  apiKey: string;
  question: string;
  draftModel?: string;
  judgeModels?: string[];
  runJudge?: boolean;
  singleJudge?: boolean;            // when true, use exactly 1 judge (fastest, less consensus)
  judgeSampleSize?: number;         // when set (2..9), use that many rotated judges
  maxDepth?: number;
  advancedGates?: boolean;
  profile?: V15Profile;             // 4-stage / N-Deep / Cluster / SLOOP knobs
  onProgress?: (stage: string) => void;
}): Promise<V15RunOutcome> {
  ensureFlawsLoaded();
  const profile = opts.profile ?? {};
  if (profile.useOriginalDefensePack) ensureOriginalDefensePackLoaded();
  const t0 = Date.now();
  const { apiKey, question, runJudge = true, maxDepth = 3, onProgress } = opts;
  const draftModel = opts.draftModel ?? pickRotationSeed(question, getActiveRotationPool());

  // Build the drafting system prompt with any profile directives active.
  const directives: string[] = [
    "You are an elite, highly calibrated domain expert.",
    "Answer directly and comprehensively so the reader can act on it without further research.",
    "Always: state assumptions, define variables, give worked numbers with units, and add jurisdiction/scope caveats when relevant.",
    "Never respond with a formula alone — always show what it evaluates to for a concrete example even if the user did not provide inputs.",
  ];
  if (profile.fourStage) directives.push("Use the 4-Stage micro-agent framing internally (Plan → Draft → Critique → Polish), emit only the polished final answer.");
  if (profile.nDeep) directives.push(`Use N-Deep adversarial refinement across ${Math.max(1, Math.min(8, profile.nDeepPasses ?? 4))} internal passes to catch missed edge cases.`);
  if (profile.cluster) directives.push(`Cluster-synthesize across ${Math.max(1, Math.min(16, profile.clusterSize ?? 8))} parallel hypotheses internally, then present the merged best answer.`);
  if (profile.sloop) directives.push(`SLOOP long-form report mode: target approximately ${Math.max(1, Math.min(32, profile.sloopPages ?? 4))} pages with substantive prose in every section (no stubs, no bare headers).`);
  if (profile.templateId) directives.push(`Follow the "${profile.templateId}" template's section structure exactly (base OMEGA templates set).`);
  if (profile.styleOverride) directives.push(`Apply the "${profile.styleOverride}" style-override modulation silently.`);
  if (profile.williamsPersona) directives.push(`Write in the "${profile.williamsPersona}" Williams-style persona (Joseph Williams "Style: Toward Clarity and Grace") — apply its stylistic profile invisibly; never name the persona.`);

  // ── Live grounding (threaded through EVERY pass) ──────────────────────────
  let evidenceBlock = "";
  let groundingProvider: string | undefined;
  let groundingCount = 0;
  if (profile.webSearch) {
    onProgress?.("web grounding (retrieval)");
    const grounded = await groundQuestion({
      question,
      backends: profile.webBackends ?? { ogScraper: true },
      onDebug: (m: string) => onProgress?.(`grounding · ${m}`),
    });
    if (grounded.ok) {
      evidenceBlock = grounded.evidenceBlock;
      groundingProvider = grounded.provider;
      groundingCount = grounded.count;
      onProgress?.(`grounded via ${grounded.provider} · ${grounded.count} sources`);
    } else {
      groundingProvider = `unavailable: ${grounded.error}`;
      onProgress?.(`grounding unavailable (${grounded.error}) — proceeding ungrounded`);
    }
  }

  onProgress?.("drafting (rotated)");
  const draftRes = await generateWithRotation({
    apiKey,
    prompt: evidenceBlock ? `${evidenceBlock}\n\nUSER QUESTION:\n${question}` : question,
    preferredModel: draftModel,
    systemInstruction: directives.join("\n"),
    maxOutputTokens: profile.sloop ? Math.max(2400, (profile.sloopPages ?? 4) * 700) : 1400,
  });

  if (!draftRes.ok) {
    return {
      question, draft: "", fixed: "", issues: [], autoFixesApplied: [],
      guardScore: 0, judgeScore: null, judgeNote: "", modelUsed: draftRes.modelUsed,
      passes: 0, stable: false, totalLatencyMs: Date.now() - t0, error: draftRes.error,
    };
  }

  let currentText = draftRes.text;
  const allFixes: string[] = [];
  let passes = 1;
  let guardScore = 10;
  let finalIssues: { code: string; severity: string; message: string; remediation?: string }[] = [];
  let eloConsensus: EloConsensusResult | undefined;
  const testbedGatesProposed: TestbedGate[] = [];

  // ── HYPOTHESIS-DRIVEN ITERATIVE GROUNDING (HDIG) — ACL 2025 "Agentic
  //    Reasoning" pattern: the LLM identifies its OWN knowledge gaps in the
  //    draft, generates targeted search queries per gap, retrieves evidence,
  //    and the evidence is threaded into ALL subsequent N-Deep editor passes.
  //    This is strictly additive — when web grounding is OFF, HDIG is skipped.
  if (profile.webSearch && groundingCount > 0) {
    onProgress?.("hypothesis-driven iterative grounding (HDIG)");
    try {
      const gapRes = await generateWithRotation({
        apiKey,
        prompt: `You just drafted an answer to: "${question.slice(0, 400)}"\n\nYour draft:\n${currentText.slice(0, 3000)}\n\nIdentify up to 3 specific factual claims in your draft that would benefit from verification via web search. For each, output a targeted search query.\n\nReturn ONLY strict JSON:\n{"gaps": [{"claim": "...", "searchQuery": "..."}]}`,
        maxOutputTokens: 300,
      });
      if (gapRes.ok) {
        try {
          const m = gapRes.text.match(/\{[\s\S]*\}/);
          const j = JSON.parse(m ? m[0] : gapRes.text);
          const gaps: { claim: string; searchQuery: string }[] = Array.isArray(j.gaps) ? j.gaps.slice(0, 3) : [];
          if (gaps.length > 0) {
            onProgress?.(`HDIG: ${gaps.length} knowledge gap(s) identified — searching`);
            for (const gap of gaps) {
              const hitRes = await groundQuestion({
                question: gap.searchQuery,
                backends: profile.webBackends ?? { ogScraper: true },
                depth: 3,
                onDebug: (dm: string) => onProgress?.(`HDIG · ${dm}`),
              });
              if (hitRes.ok && hitRes.sources.length > 0) {
                // Thread the new evidence into the existing evidence block so
                // ALL subsequent N-Deep editor passes see it.
                const newEvidence = hitRes.sources.slice(0, 2).map((s, k) =>
                  `[S${groundingCount + k + 1}] ${s.title}\n${s.content}`
                ).join("\n---\n");
                evidenceBlock += `\n\nHDIG VERIFICATION for "${gap.claim.slice(0, 80)}":\n${newEvidence}`;
                groundingCount += hitRes.sources.length;
                onProgress?.(`HDIG: +${hitRes.sources.length} source(s) for "${gap.claim.slice(0, 40)}…"`);
              }
            }
          }
        } catch { /* JSON parse failure — skip silently, HDIG is best-effort */ }
      }
    } catch { onProgress?.("HDIG: gap analysis unavailable — continuing with existing evidence"); }
  }

  for (let d = 1; d <= maxDepth; d++) {
    passes = d;
    onProgress?.(`depth ${d}: scanning`);
    const ctx: ScanContext = {
      prompt: question,
      answer: currentText,
      lowerAnswer: currentText.toLowerCase(),
      computeRecords: [],
      constraints: { explicitComparisonTargets: [], exclusions: [], formatHints: [], namedEntities: [] } as any,
    };
    runFlawScan(ctx);

    onProgress?.(`depth ${d}: auto-fixing`);
    const af = runAutoFix(currentText, ctx);
    currentText = af.text;
    if (af.applied.length > 0) allFixes.push(...af.applied);

    const ctx2 = { ...ctx, answer: currentText, lowerAnswer: currentText.toLowerCase() };
    const scanned = runFlawScan(ctx2);
    const testbedIssues = runTestbedGates(currentText);
    finalIssues = [
      ...scanned.map(i => ({ code: i.code, severity: i.severity, message: i.message, remediation: i.remediation })),
      ...testbedIssues.map(i => ({ code: i.code, severity: i.severity, message: i.message, remediation: i.remediation })),
    ];

    // Completion-Check (from divergence critique): a truncated/fragmented answer
    // is a hard failure. Record it as a critical issue so the editor MUST fix it
    // and the guard score reflects it (Fail-and-Retry, not silent pass).
    const trunc = detectTruncation(currentText, { longForm: !!profile.sloop, targetPages: profile.sloopPages });
    if (trunc.truncated) {
      finalIssues.unshift({ code: "TRUNCATED_OPENING", severity: "critical", message: `Structural truncation: ${trunc.reason}.`, remediation: "Regenerate a COMPLETE answer end-to-end. Do not stop mid-sentence, mid-formula, or mid-section." });
    }
    guardScore = scoreFromIssues(finalIssues, currentText.length);

    // Per-depth advanced-gate mining: if enabled, mine NEW gates on EACH draft
    // (not just at the very end) so the editor can address them next pass.
    if (opts.advancedGates && d < maxDepth) {
      const proposed = await proposeGateWithLLM({ apiKey, question, answer: currentText, judgeNote: finalIssues.slice(0, 5).map(i => i.code).join(", "), model: "gemini-3.1-flash-lite" });
      if (proposed && !testbedGatesProposed.some(g => g.code === proposed.code)) testbedGatesProposed.push(proposed);
    }

    // Depth-honor mode: only allow early exit if the user did NOT explicitly
    // request maxDepth ≥ 3, AND there is no truncation. When calibrating
    // N-Deep=3+ we run ALL passes to exercise the full pipeline.
    if (maxDepth <= 2 && !trunc.truncated && guardScore >= 9.2 && !finalIssues.some(i => i.severity === "critical" || i.severity === "major")) {
      break;
    }

    if (d < maxDepth) {
      onProgress?.(`depth ${d}: refining via Critique -> Editor (${finalIssues.length} flaws${testbedGatesProposed.length ? ` + ${testbedGatesProposed.length} testbed proposals` : ""})`);
      // Cap the injected flaw list so the editor prompt stays focused on the
      // highest-severity issues (critical > major > warning > info), but ALWAYS
      // include truncation + all critical/major first.
      const ordered = [...finalIssues].sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 40);
      const issuesBlock = ordered.map(i => `- [${i.code}] (${i.severity}): ${i.remediation || i.message}`).join("\n");
      const testbedBlock = testbedGatesProposed.length > 0
        ? `\n\nCUTTING-EDGE TESTBED GATES (also satisfy these newly-discovered patterns):\n${testbedGatesProposed.map(g => `- [${g.code}] ${g.message} → ${g.remediation}`).join("\n")}`
        : "";
      const editorPrompt = `You are a meticulous technical editor performing recursive refinement pass ${d + 1}. Revise the DRAFT to fix EVERY listed compliance flaw while preserving all correct factual content and rigor. Produce a COMPLETE answer — never truncate, never stop mid-sentence or mid-section. State assumptions, define variables, give worked numbers WITH units, and add jurisdiction/scope caveats when relevant. If a formula is used, always show the concrete evaluated result.

DETECTED FLAWS (fix all — ordered by severity):
${issuesBlock || "Enhance clarity, completeness, and rigor."}${testbedBlock}
${evidenceBlock ? `\n\n${evidenceBlock}\n(Ground every factual claim in the evidence above; cite [S#].)` : ""}

USER PROMPT:
${question}

DRAFT TO REVISE:
${currentText}`;

      const activePool = getActiveRotationPool();
      const editRes = await generateWithRotation({
        apiKey,
        prompt: editorPrompt,
        preferredModel: pickRotationSeed(`${question}::edit${d}`, activePool),
        maxOutputTokens: profile.sloop ? Math.max(2400, (profile.sloopPages ?? 4) * 700) : 1600,
      });
      if (editRes.ok && editRes.text.trim().length > 50) {
        currentText = editRes.text.trim();
      }
    }
  }

  let judgeScore: number | null = null;
  let judgeNote = "";
  let judgeRoster: V15RunOutcome["judgeRoster"] = [];

  if (runJudge) {
    const activePool = getActiveRotationPool();
    // Judge selection: explicit judgeModels list > singleJudge > judgeSampleSize > full 9-model roster.
    let selectedJudgeModels: string[] | undefined = opts.judgeModels;
    if (!selectedJudgeModels && opts.singleJudge) {
      selectedJudgeModels = [activePool[0]]; // top-Elo model only
    }
    if (!selectedJudgeModels && opts.judgeSampleSize && opts.judgeSampleSize > 0) {
      selectedJudgeModels = activePool.slice(0, Math.min(opts.judgeSampleSize, activePool.length));
    }

    onProgress?.(opts.singleJudge ? "single-judge (fastest)" : `parallel judging (${selectedJudgeModels?.length ?? activePool.length} judges, Elo consensus)`);
    const judgeRun = await parallelJudgeRotation({
      apiKey,
      question,
      answer: currentText,
      judgeModels: selectedJudgeModels ?? activePool,
    });

    judgeRoster = judgeRun.attempts.map(a => {
      const j = judgeRun.judgments.find(x => x.model === a.model);
      return { model: a.model, elo: a.elo, tier: a.tier, ok: a.ok, latencyMs: a.latencyMs, score: j?.score };
    });

    if (judgeRun.judgments.length > 0) {
      eloConsensus = calculateEloConsensus(judgeRun.judgments);
      judgeScore = eloConsensus.weightedScore;
      judgeNote = eloConsensus.rationale;

      if (opts.advancedGates && (judgeScore < 9 || finalIssues.length === 0)) {
        onProgress?.("advanced gate mining");
        const proposed = await proposeGateWithLLM({
          apiKey,
          question,
          answer: currentText,
          judgeNote,
          model: "gemini-3.1-flash-lite",
        });
        if (proposed) testbedGatesProposed.push(proposed);
      }
    } else {
      judgeNote = "Judges temporarily rate-limited";
    }
  }

  // ── Adversarial red-team (additive — same engine as the base app) ─────────
  if (profile.adversarial) {
    onProgress?.("adversarial red-team");
    try {
      const adv = await runAdversarialRedTeam(currentText, question, {
        provider: "gemini", model: draftModel, apiKey, userMessage: question, conversationHistory: [],
      } as any, { onDebug: (m: string) => onProgress?.(`adversarial · ${m}`) });
      const blocking = (adv?.defects ?? []).filter((d) => d.severity === "critical" || d.severity === "major");
      for (const d of blocking.slice(0, 8)) {
        finalIssues.push({ code: `ADV_${String(d.category ?? d.id ?? "DEFECT").toUpperCase().replace(/\s+/g, "_")}`, severity: d.severity, message: String(d.detail ?? "adversarial defect") });
      }
      guardScore = scoreFromIssues(finalIssues, currentText.length);
    } catch (e) {
      onProgress?.(`adversarial engine unavailable: ${(e as Error).message}`);
    }
  }

  onProgress?.("done");
  const combined = judgeScore !== null ? Math.min(guardScore, judgeScore) : guardScore;
  const stable = combined >= 9.0 && !finalIssues.some(i => i.severity === "critical");

  return {
    question,
    draft: draftRes.text,
    fixed: currentText,
    issues: finalIssues,
    autoFixesApplied: [...new Set(allFixes)],
    guardScore,
    judgeScore,
    judgeNote,
    eloConsensus,
    testbedGatesProposed,
    judgeRoster,
    modelUsed: draftRes.modelUsed,
    passes,
    stable,
    totalLatencyMs: Date.now() - t0,
    groundingProvider,
    groundingCount,
    runSettings: {
      depth: maxDepth,
      fourStage: !!profile.fourStage,
      cluster: !!profile.cluster, clusterSize: profile.clusterSize ?? 8,
      sloop: !!profile.sloop, sloopPages: profile.sloopPages ?? 4,
      templateId: profile.templateId, styleOverride: profile.styleOverride,
      williamsPersona: profile.williamsPersona,
      adversarial: !!profile.adversarial, webSearch: !!profile.webSearch,
      defensePack: !!profile.useOriginalDefensePack, advancedGates: !!opts.advancedGates,
      singleJudge: !!opts.singleJudge,
    },
  };
}

/**
 * Baseline: no V15 processing (draft only), judged by the SAME judge policy
 * as V15 so the reported "judge" numbers are comparable side-by-side.
 */
/**
 * Divergence Analysis — when guardScore and judgeScore disagree, ask a
 * high-Elo LLM to explain WHY and produce a structured improvement suggestion
 * (single option OR list of alternative options). Additive: not called by
 * default; the UI opts in per row / per batch.
 */
export interface DivergenceSuggestion {
  reason: string;                        // one-paragraph plain-English cause
  category: "missing-gate" | "false-positive-gate" | "rubric-mismatch" | "context-window" | "other";
  suggestions: Array<{
    approach: "new-gate" | "modify-gate" | "extend-flaw-pack" | "adjust-scoring-weights" | "adjust-judge-rubric" | "new-domain-pack" | "other";
    description: string;
    estimatedImpact: "low" | "medium" | "high";
    tradeoffs: string;
  }>;
}

export interface DivergenceEntry {
  timestamp: number;
  question: string;
  guardScore: number;
  judgeScore: number;
  delta: number;
  suggestion: DivergenceSuggestion;
  authorityModel: string;
  /** Full judge panel that scored this answer (model + score + Elo). */
  judgePanel?: Array<{ model: string; score: number; elo: number }>;
  /** Engineer decision state for the improvement ledger. */
  decision?: "pending-decision" | "accepted" | "rejected";
}

const DIVERGENCE_LOG_KEY = "veritas.v15.divergenceLog";

export function getDivergenceLog(): DivergenceEntry[] {
  try {
    const raw = localStorage.getItem(DIVERGENCE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDivergenceEntry(entry: DivergenceEntry): void {
  try {
    const log = getDivergenceLog();
    log.push({ decision: "pending-decision", ...entry });
    // Keep last 200 entries
    localStorage.setItem(DIVERGENCE_LOG_KEY, JSON.stringify(log.slice(-200)));
  } catch { /* ignore */ }
}

export function clearDivergenceLog(): void {
  try { localStorage.removeItem(DIVERGENCE_LOG_KEY); } catch { /* ignore */ }
}

export async function analyzeDivergence(opts: {
  apiKey: string;
  question: string;
  answer: string;
  guardScore: number;
  judgeScore: number;
  guardIssues: { code: string; severity: string; message: string }[];
  judgeNote: string;
}): Promise<DivergenceSuggestion | null> {
  const prompt = `You are a system-improvement analyst. The V15 Rigor Guard's deterministic gate score and the independent third-party LLM judge score DIVERGED significantly on the following case. Analyze WHY and propose concrete improvements.

QUESTION:
${opts.question}

ANSWER UNDER EVALUATION:
${opts.answer.slice(0, 3000)}

GUARD SCORE: ${opts.guardScore}/10
GUARD ISSUES: ${JSON.stringify(opts.guardIssues.slice(0, 10))}
JUDGE SCORE: ${opts.judgeScore}/10
JUDGE NOTE: ${opts.judgeNote}
DELTA: ${(opts.judgeScore - opts.guardScore).toFixed(2)}

Produce STRICT JSON:
{
  "reason": "one paragraph explaining the divergence",
  "category": "missing-gate" | "false-positive-gate" | "rubric-mismatch" | "context-window" | "other",
  "suggestions": [
    { "approach": "new-gate" | "modify-gate" | "extend-flaw-pack" | "adjust-scoring-weights" | "adjust-judge-rubric" | "new-domain-pack" | "other",
      "description": "specific code-level change to implement",
      "estimatedImpact": "low" | "medium" | "high",
      "tradeoffs": "risks or downsides"
    }
  ]
}

Include MULTIPLE suggestions (2-4) when the divergence can plausibly be fixed several ways so an engineer can choose. Return ONLY the JSON.`;

  const activePool = getActiveRotationPool();
  const res = await generateWithRotation({
    apiKey: opts.apiKey,
    prompt,
    preferredModel: activePool[0],
    maxOutputTokens: 900,
  });
  if (!res.ok) return null;
  try {
    const match = res.text.match(/\{[\s\S]*\}/);
    const j = JSON.parse(match ? match[0] : res.text);
    if (!j.reason || !Array.isArray(j.suggestions)) return null;
    return j as DivergenceSuggestion;
  } catch { return null; }
}

/**
 * Long-Report Cohesion Pass — additive post-processor. Takes a long report
 * (from the real app's 4-Stage / N-Deep / cluster / SLOOP pipeline) and runs
 * a deterministic cohesion audit + rewrite of ONLY defective sections. Never
 * touches non-defective content. Returns the improved text + a diff summary.
 */
export interface CohesionPassResult {
  original: string;
  improved: string;
  sectionsRewritten: number;
  cohesionIssues: string[];
  ok: boolean;
  error?: string;
}

export async function runCohesionPass(opts: {
  apiKey: string;
  question: string;
  report: string;
  onProgress?: (stage: string) => void;
}): Promise<CohesionPassResult> {
  const { apiKey, question, report, onProgress } = opts;

  onProgress?.("cohesion audit");
  // Deterministic issue scan first.
  const cohesionIssues: string[] = [];
  const sections = report.split(/\n(?=#{1,3}\s)/);
  const stubbySections = sections.filter(s => {
    const body = s.replace(/^#{1,3}[^\n]*\n/, "").trim();
    return body.length < 120 || /^\[|^TBD|^\(placeholder\)/i.test(body);
  });
  if (stubbySections.length > 0) cohesionIssues.push(`${stubbySections.length} section(s) below cohesion floor (stub/placeholder/thin).`);
  if (!/^#\s/m.test(report)) cohesionIssues.push("Report lacks an H1 thesis header.");
  if (!/^(##\s.*Executive|##\s.*Summary|##\s.*BLUF|##\s.*TL;DR)/mi.test(report)) cohesionIssues.push("Missing executive-summary / BLUF section.");
  if (!/(?:^|\n)#{1,3}\s.*(?:Conclusion|Recommend|Next Steps|Implications)/mi.test(report)) cohesionIssues.push("Missing conclusion / recommendation section.");

  if (cohesionIssues.length === 0) {
    onProgress?.("no cohesion issues found");
    return { original: report, improved: report, sectionsRewritten: 0, cohesionIssues: [], ok: true };
  }

  onProgress?.(`rewriting ${stubbySections.length} defective section(s)`);
  const editorPrompt = `You are a senior report editor. A long-form report was generated. Do a MINIMAL cohesion repair — rewrite ONLY the sections listed as defective, PRESERVE every other section byte-for-byte. Add an executive summary if missing. Add a conclusion if missing. Return the FULL revised report (all sections in original order).

USER PROMPT:
${question}

COHESION ISSUES:
${cohesionIssues.map(i => `- ${i}`).join("\n")}

REPORT TO REVISE:
${report.slice(0, 20000)}`;

  const activePool = getActiveRotationPool();
  const res = await generateWithRotation({
    apiKey, prompt: editorPrompt,
    preferredModel: activePool[0],
    maxOutputTokens: Math.max(3000, Math.min(8000, report.length / 3 + 1000)),
  });
  if (!res.ok) return { original: report, improved: report, sectionsRewritten: 0, cohesionIssues, ok: false, error: res.error };
  return {
    original: report,
    improved: res.text.trim() || report,
    sectionsRewritten: stubbySections.length,
    cohesionIssues,
    ok: true,
  };
}

export async function runBaselineOnQuestion(opts: {
  apiKey: string;
  question: string;
  draftModel?: string;
  singleJudge?: boolean;
  judgeSampleSize?: number;
  onProgress?: (stage: string) => void;
}): Promise<V15RunOutcome> {
  const t0 = Date.now();
  const { apiKey, question, draftModel = "gemini-2.5-flash-lite", onProgress } = opts;

  onProgress?.("drafting baseline");
  const draftRes = await generateWithRotation({
    apiKey, prompt: question, preferredModel: draftModel, maxOutputTokens: 900,
  });
  if (!draftRes.ok) {
    return {
      question, draft: "", fixed: "", issues: [], autoFixesApplied: [],
      guardScore: 0, judgeScore: null, judgeNote: "", modelUsed: draftModel,
      passes: 1, stable: false, totalLatencyMs: Date.now() - t0, error: draftRes.error,
    };
  }

  onProgress?.("judging baseline");
  let selectedJudgeModels: string[] | undefined;
  const activePool = getActiveRotationPool();
  if (opts.singleJudge) selectedJudgeModels = [activePool[0]];
  else if (opts.judgeSampleSize && opts.judgeSampleSize > 0) selectedJudgeModels = activePool.slice(0, Math.min(opts.judgeSampleSize, activePool.length));
  else selectedJudgeModels = activePool;
  const judgeRun = await parallelJudgeRotation({
    apiKey, question, answer: draftRes.text, judgeModels: selectedJudgeModels,
  });

  let judgeScore: number | null = null;
  let judgeNote = "";
  let judgeRoster: V15RunOutcome["judgeRoster"] = [];
  if (judgeRun.judgments.length > 0) {
    const elo = calculateEloConsensus(judgeRun.judgments);
    judgeScore = elo.weightedScore;
    judgeNote = elo.rationale;
  }
  judgeRoster = judgeRun.attempts.map(a => {
    const j = judgeRun.judgments.find(x => x.model === a.model);
    return { model: a.model, elo: a.elo, tier: a.tier, ok: a.ok, latencyMs: a.latencyMs, score: j?.score };
  });

  onProgress?.("done");
  return {
    question,
    draft: draftRes.text,
    fixed: draftRes.text,
    issues: [],
    autoFixesApplied: [],
    guardScore: 0,
    judgeScore,
    judgeNote,
    judgeRoster,
    modelUsed: draftRes.modelUsed,
    passes: 1,
    stable: judgeScore !== null && judgeScore >= 9.0,
    totalLatencyMs: Date.now() - t0,
  };
}
