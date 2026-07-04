/**
 * Unified Defense Registry — the single source of truth for the
 * "active defenses" count shown across the UI.
 *
 * It combines:
 *  - the 126 named failure-mode → solution mappings (failure-modes.ts), and
 *  - the kernel / pipeline-level defenses that are actually wired into the
 *    runtime (constraints, temporal anchor, sanitizer, SSCP receipt,
 *    persona, multi-pass pipeline, verification gates, etc.).
 *
 * Every kernel defense listed here corresponds to real code that runs.
 * Nothing is decorative; this is the honest count.
 */

import { FAILURE_MODES } from "./failure-modes";

export interface KernelDefense {
  id: string;
  name: string;
  group: string;
  wiredIn: string; // file/function that implements it
}

export const KERNEL_DEFENSES: KernelDefense[] = [
  // ── Input / constraint layer ──────────────────────────────────────
  { id: "K01", name: "Prompt-injection screen", group: "Input", wiredIn: "defenses.detectInjection" },
  { id: "K02", name: "Time-horizon extraction", group: "Constraints", wiredIn: "constraints.extractConstraints" },
  { id: "K03", name: "Comparison-target extraction", group: "Constraints", wiredIn: "constraints.extractConstraints" },
  { id: "K04", name: "Format-hint extraction", group: "Constraints", wiredIn: "constraints.extractConstraints" },
  { id: "K05", name: "Exclusion extraction", group: "Constraints", wiredIn: "constraints.extractConstraints" },
  { id: "K06", name: "Domain detection", group: "Constraints", wiredIn: "constraints.detectDomain" },
  { id: "K07", name: "Short/long horizon classifier", group: "Constraints", wiredIn: "constraints.extractConstraints" },
  { id: "K08", name: "Constraint block enforcement", group: "Constraints", wiredIn: "constraints.buildConstraintBlock" },
  // ── Temporal layer ────────────────────────────────────────────────
  { id: "K09", name: "Current-date anchor injection", group: "Temporal", wiredIn: "pipeline.computeTemporalAnchor" },
  { id: "K10", name: "Horizon-end calculation", group: "Temporal", wiredIn: "pipeline.computeTemporalAnchor" },
  { id: "K11", name: "Out-of-window catalyst flag", group: "Temporal", wiredIn: "pipeline / synthesis prompt" },
  // ── Retrieval layer ───────────────────────────────────────────────
  { id: "K12", name: "Retrieve-first enforcement (Jina required)", group: "Retrieval", wiredIn: "ChatApp.handleSubmit" },
  { id: "K13", name: "Two-pass hypothesis verification", group: "Retrieval", wiredIn: "ChatApp.handleSubmit" },
  { id: "K14", name: "Source de-duplication", group: "Retrieval", wiredIn: "ChatApp.handleSubmit" },
  { id: "K15", name: "Data-only context rule", group: "Retrieval", wiredIn: "models.SYSTEM_PROMPT" },
  { id: "K16", name: "Wikidata anchor baseline probe", group: "Retrieval", wiredIn: "connectors.wikidata.anchorProbe" },
  // ── Reasoning / multi-pass layer ──────────────────────────────────
  { id: "K17", name: "Logic Engine structured-JSON pass", group: "Pipeline", wiredIn: "pipeline.runMultiPassPipeline" },
  { id: "K18", name: "Strict JSON extraction + repair", group: "Pipeline", wiredIn: "pipeline.extractStrictJson" },
  { id: "K19", name: "Copywriter pass (logic→prose decouple)", group: "Pipeline", wiredIn: "pipeline.runMultiPassPipeline" },
  { id: "K20", name: "Single-pass fallback on parse failure", group: "Pipeline", wiredIn: "pipeline.runMultiPassPipeline" },
  { id: "K21", name: "Scratchpad isolation (CoT never shown)", group: "Pipeline", wiredIn: "pipeline + sanitizer" },
  // ── Output sanitation layer ───────────────────────────────────────
  { id: "K22", name: "Scaffolding/outline stripper", group: "Sanitizer", wiredIn: "constraints.sanitizeOutput" },
  { id: "K23", name: "Meta-discourse stripper", group: "Sanitizer", wiredIn: "pipeline.stage4Clean" },
  { id: "K24", name: "Persona-label leak stripper", group: "Sanitizer", wiredIn: "constraints.sanitizeOutput" },
  { id: "K25", name: "Raw-citation stripper (templated)", group: "Sanitizer", wiredIn: "pipeline.stage4Clean" },
  { id: "K26", name: "Self-correction / planning leak stripper", group: "Sanitizer", wiredIn: "constraints.sanitizeOutput" },
  // ── Grounding / ledger layer ──────────────────────────────────────
  { id: "K27", name: "Atomic claim extraction", group: "Grounding", wiredIn: "defenses.extractClaims" },
  { id: "K28", name: "Claim → source entailment match", group: "Grounding", wiredIn: "ChatApp.handleSubmit" },
  { id: "K29", name: "Verified/unverified status labels", group: "Grounding", wiredIn: "ChatApp claim ledger" },
  { id: "K30", name: "Cross-turn coherence / drift check", group: "Grounding", wiredIn: "defenses.checkCoherence" },
  { id: "K31", name: "Confidence ≤ weakest evidence link", group: "Grounding", wiredIn: "ReportOS calc engines" },
  // ── Receipt / audit layer ─────────────────────────────────────────
  { id: "K32", name: "SHA-256 Merkle SSCP receipt", group: "Audit", wiredIn: "sscp.buildSSCPReceipt" },
  { id: "K33", name: "Claim-ledger root hash", group: "Audit", wiredIn: "sscp.buildSSCPReceipt" },
  { id: "K34", name: "Tool-log root hash", group: "Audit", wiredIn: "sscp.buildSSCPReceipt" },
  { id: "K35", name: "Gate root hash", group: "Audit", wiredIn: "sscp.buildSSCPReceipt" },
  { id: "K36", name: "Evidence-tier classification", group: "Audit", wiredIn: "sscp + telemetry" },
  // ── Verification / red-team gates (ReportOS v3) ───────────────────
  { id: "K37", name: "Objective-fit gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K38", name: "Evidence-binding gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K39", name: "Status-labeling gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K40", name: "MECE-structure gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K41", name: "Calculation-reproducibility gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K42", name: "Falsification / red-team gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K43", name: "Compliance-standard gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  { id: "K44", name: "Audience-density gate", group: "Gates", wiredIn: "reportos.QUALITY_GATES" },
  // ── Calculation engines (ReportOS v3) ─────────────────────────────
  { id: "K45", name: "Market-sizing engine (TAM/SAM/SOM/CAGR)", group: "Calc", wiredIn: "reportos.calcMarketSizing" },
  { id: "K46", name: "Valuation engine (NPV/IRR/EBITDA/FCF/MOIC)", group: "Calc", wiredIn: "reportos.calcValuation" },
  { id: "K47", name: "Scenario/sensitivity engine (EV/bear-base-bull)", group: "Calc", wiredIn: "reportos.calcScenario" },
  { id: "K48", name: "Risk scoring engine (P×I/RPN/residual)", group: "Calc", wiredIn: "reportos.calcRisk" },
  { id: "K49", name: "Evidence-confidence scoring engine", group: "Calc", wiredIn: "reportos.calcConfidence" },
  { id: "K50", name: "Research statistics engine (effect size/RR/OR/I²)", group: "Calc", wiredIn: "reportos.calcResearchStats" },
  { id: "K51", name: "Policy cost-benefit engine (BCR/NSB)", group: "Calc", wiredIn: "reportos.calcCostBenefit" },
  { id: "K52", name: "ESG/climate engine (GHG/intensity/abatement)", group: "Calc", wiredIn: "reportos.calcESG" },
  { id: "K53", name: "Digital/AI readiness engine", group: "Calc", wiredIn: "reportos.calcAIReadiness" },
  { id: "K54", name: "Pricing engine (pocket price/realization)", group: "Calc", wiredIn: "reportos.calcPricing" },
  // ── Style / persona layer ─────────────────────────────────────────
  { id: "K55", name: "19-dimension Williams style persona", group: "Style", wiredIn: "williams-style.generatePersona" },
  { id: "K56", name: "Deterministic seeded persona (reproducible)", group: "Style", wiredIn: "williams-style" },
  { id: "K57", name: "OMEGA template skeleton injection", group: "Style", wiredIn: "omega-templates.buildTemplatePrompt" },
  { id: "K58", name: "Style-override registry (40 legacy presets)", group: "Style", wiredIn: "omega-templates.STYLE_OVERRIDES" },
  // ── Telemetry / governance layer ──────────────────────────────────
  { id: "K59", name: "Live measured telemetry (no simulated data)", group: "Governance", wiredIn: "live-telemetry + app-state" },
  { id: "K60", name: "Adaptive tier governor (T0–T5)", group: "Governance", wiredIn: "gbse/tiers.pickTier" },
];

export const TOTAL_DEFENSES = FAILURE_MODES.length + KERNEL_DEFENSES.length;

export function defenseGroups(): { group: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of KERNEL_DEFENSES) map.set(d.group, (map.get(d.group) ?? 0) + 1);
  return [...map.entries()].map(([group, count]) => ({ group, count }));
}
