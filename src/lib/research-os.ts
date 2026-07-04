/**
 * ResearchOS v6 — Academic Research & NIH Grant Engine
 *
 * Provides:
 * 1. Claim type taxonomy (OBS/DERIV/ASSUMP/HYP/THEORY/METHOD/RESULT/INTERP/LIMIT/REC/NORM)
 * 2. NIH mechanism metadata (R01/R03/R15/R21 with page limits, budgets, review factors)
 * 3. Study-design modules with reporting-standard mappings
 * 4. Reviewer-vulnerability heuristic scoring
 * 5. Reporting-standard selector (PRISMA/CONSORT/STROBE/COREQ/APA JARS)
 * 6. Research gap taxonomy
 * 7. Manuscript readiness score
 *
 * All scoring functions are heuristic engineering estimates, not official NIH formulas.
 */

// ─── Claim types ────────────────────────────────────────────────────
export type ClaimType =
  | "OBS"    // observed fact / literature claim
  | "DERIV"  // statistical / mathematical derivation
  | "ASSUMP" // explicit assumption
  | "HYP"    // hypothesis
  | "THEORY" // theoretical proposition
  | "METHOD" // methodological choice
  | "RESULT" // empirical finding
  | "INTERP" // interpretation of results
  | "LIMIT"  // limitation
  | "REC"    // recommendation
  | "NORM";  // normative / philosophical claim

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  OBS: "Observed fact / literature claim",
  DERIV: "Statistical / mathematical derivation",
  ASSUMP: "Explicit assumption",
  HYP: "Hypothesis",
  THEORY: "Theoretical proposition",
  METHOD: "Methodological choice",
  RESULT: "Empirical finding",
  INTERP: "Interpretation of results",
  LIMIT: "Limitation",
  REC: "Recommendation",
  NORM: "Normative / philosophical claim",
};

// ─── NIH Mechanisms ─────────────────────────────────────────────────
export interface NIHMechanism {
  code: string;
  name: string;
  researchStrategyPages: number;
  budgetAnchor: string;
  duration: string;
  reviewFactors: string[];
  bestFor: string;
  fatalFlaws: string[];
}

export const NIH_MECHANISMS: NIHMechanism[] = [
  {
    code: "R01",
    name: "Research Project Grant",
    researchStrategyPages: 12,
    budgetAnchor: "Generally not capped; must reflect actual project needs",
    duration: "1-5 budget periods",
    reviewFactors: [
      "Factor 1: Importance of the Research (Significance + Innovation, scored 1-9)",
      "Factor 2: Rigor and Feasibility (Approach, scored 1-9)",
      "Factor 3: Expertise and Resources (Investigator + Environment, sufficient/gaps)",
    ],
    bestFor: "Full independent project with strong premise and sustained impact",
    fatalFlaws: [
      "No central hypothesis",
      "No rigorous prior-research assessment",
      "No power/precision/sample justification",
      "No alternatives for risky steps",
      "Aims are dependent dominoes (if Aim 1 fails, whole project collapses)",
      "Team expertise gap unpatched",
    ],
  },
  {
    code: "R03",
    name: "Small Research Grant",
    researchStrategyPages: 6,
    budgetAnchor: "Up to $50,000 direct costs/year, up to 2 years, nonrenewable",
    duration: "Up to 2 years",
    reviewFactors: [
      "Factor 1: Importance (smaller scope, tight focus)",
      "Factor 2: Rigor and Feasibility",
      "Factor 3: Expertise and Resources",
    ],
    bestFor: "Small, self-contained project: pilot/feasibility, secondary analysis, methods development",
    fatalFlaws: [
      "Looks like a compressed R01 instead of a self-contained project",
      "Scope exceeds 2-year / $50K/yr reality",
      "No clear finish line or next-step logic",
    ],
  },
  {
    code: "R15",
    name: "Research Enhancement Award (AREA/REAP)",
    researchStrategyPages: 12,
    budgetAnchor: "Modular/R&R thresholds; project period limited to 3 years",
    duration: "Up to 3 years",
    reviewFactors: [
      "Factor 1: Importance of the Research",
      "Factor 2: Rigor and Feasibility",
      "Factor 3: Expertise, Resources, AND student involvement + institutional strengthening",
    ],
    bestFor: "Meritorious research at eligible institutions; student exposure to research",
    fatalFlaws: [
      "Student involvement is decorative rather than operational",
      "PI eligibility conflicts not addressed",
      "Institutional eligibility letter missing or weak",
      "Too ambitious for a 3-year R15",
      "Student training plan not connected to scientific milestones",
    ],
  },
  {
    code: "R21",
    name: "Exploratory / Developmental Grant",
    researchStrategyPages: 6,
    budgetAnchor: "Up to $275,000 total direct costs over 2 years; no more than $200,000 in any one year",
    duration: "Up to 2 years, nonrenewable",
    reviewFactors: [
      "Factor 1: Importance and Innovation (must justify uncertainty)",
      "Factor 2: Rigor and Feasibility",
      "Factor 3: Expertise and Resources",
    ],
    bestFor: "High-risk/high-reward, feasibility, novel direction",
    fatalFlaws: [
      "Uncertainty is not scientifically justified (application is simply underdeveloped)",
      "No clear stopping rules",
      "No logic connecting R21 output to R01-scale work",
    ],
  },
];

// ─── Study designs + reporting standard mapping ─────────────────────
export interface StudyDesign {
  id: string;
  name: string;
  category: "quantitative" | "qualitative" | "mixed" | "review" | "theoretical";
  reportingStandards: string[];
  reviewerAttacks: string[];
}

export const STUDY_DESIGNS: StudyDesign[] = [
  { id: "rct", name: "Randomized Controlled Trial", category: "quantitative",
    reportingStandards: ["CONSORT 2025"],
    reviewerAttacks: ["Internal validity is weak", "Manipulation does not isolate mechanism"] },
  { id: "observational", name: "Observational (Cohort/Case-Control/Cross-Sectional)", category: "quantitative",
    reportingStandards: ["STROBE"],
    reviewerAttacks: ["Causal language exceeds design", "Confounders not adequately controlled"] },
  { id: "quasi-experimental", name: "Quasi-Experimental (DID/RD/ITS/IV)", category: "quantitative",
    reportingStandards: ["APA JARS-Quant"],
    reviewerAttacks: ["Identification assumptions are not credible"] },
  { id: "survey", name: "Survey / Cross-Sectional", category: "quantitative",
    reportingStandards: ["APA JARS-Quant", "STROBE"],
    reviewerAttacks: ["Common method variance", "Self-selection bias"] },
  { id: "sem", name: "Structural Equation Modeling", category: "quantitative",
    reportingStandards: ["APA JARS-Quant"],
    reviewerAttacks: ["Model fit acceptable but theory underidentified", "Measurement invariance not tested"] },
  { id: "grounded-theory", name: "Grounded Theory", category: "qualitative",
    reportingStandards: ["COREQ", "SRQR"],
    reviewerAttacks: ["This is thematic analysis mislabeled as grounded theory"] },
  { id: "thematic-analysis", name: "Reflexive Thematic Analysis", category: "qualitative",
    reportingStandards: ["COREQ", "SRQR", "APA JARS-Qual"],
    reviewerAttacks: ["Themes are topic summaries, not analytic themes"] },
  { id: "phenomenology", name: "Phenomenology / IPA", category: "qualitative",
    reportingStandards: ["COREQ"],
    reviewerAttacks: ["Analysis is descriptive but not phenomenological"] },
  { id: "ethnography", name: "Ethnography", category: "qualitative",
    reportingStandards: ["COREQ"],
    reviewerAttacks: ["Field engagement is too thin"] },
  { id: "case-study", name: "Case Study", category: "qualitative",
    reportingStandards: ["COREQ"],
    reviewerAttacks: ["Case is not bounded or theoretically justified"] },
  { id: "systematic-review", name: "Systematic Review / Meta-Analysis", category: "review",
    reportingStandards: ["PRISMA 2020"],
    reviewerAttacks: ["Search strategy is not reproducible", "Risk of bias not assessed"] },
  { id: "mixed-convergent", name: "Mixed Methods (Convergent Parallel)", category: "mixed",
    reportingStandards: ["APA JARS-Mixed", "MMAT"],
    reviewerAttacks: ["Integration is decorative not substantive"] },
  { id: "mixed-explanatory", name: "Mixed Methods (Explanatory Sequential)", category: "mixed",
    reportingStandards: ["APA JARS-Mixed"],
    reviewerAttacks: ["Qual strand does not explain the quant finding"] },
  { id: "philosophy", name: "Philosophy / Theory Paper", category: "theoretical",
    reportingStandards: [],
    reviewerAttacks: ["Argument contains a hidden premise", "Counterexample not addressed"] },
];

// ─── Reviewer Vulnerability Heuristic ───────────────────────────────
export interface VulnerabilityInput {
  importanceGap: number;      // 0-1
  methodsGap: number;         // 0-1
  measurementGap: number;     // 0-1
  theoryGap: number;          // 0-1
  powerSampleGap: number;     // 0-1
  reproducibilityGap: number; // 0-1
  writingClarityGap: number;  // 0-1
}

export function reviewerVulnerability(input: VulnerabilityInput): { score: number; level: string } {
  const score =
    0.25 * input.importanceGap +
    0.20 * input.methodsGap +
    0.15 * input.measurementGap +
    0.15 * input.theoryGap +
    0.10 * input.powerSampleGap +
    0.10 * input.reproducibilityGap +
    0.05 * input.writingClarityGap;
  const level =
    score <= 0.20 ? "Low vulnerability" :
    score <= 0.40 ? "Moderate vulnerability" :
    score <= 0.60 ? "Serious revision risk" :
    "Likely rejection / poor grant score";
  return { score, level };
}

// ─── NIH Impact Heuristic ───────────────────────────────────────────
export function nihImpactHeuristic(
  importance: number,          // 1 exceptional - 9 poor
  rigorFeasibility: number,    // 1 exceptional - 9 poor
  resourcesGate: 0 | 1 | 2,   // 0 sufficient, 1 minor gaps, 2 major gaps
  humanSubjectsRisk = 0,
  biohazardRisk = 0,
  budgetConcern = 0,
): { score: number; label: string } {
  const resourcePenalty = [0, 0.5, 1.5][resourcesGate];
  const compliancePenalty = humanSubjectsRisk + biohazardRisk + budgetConcern;
  const raw = 0.45 * importance + 0.45 * rigorFeasibility + resourcePenalty + compliancePenalty;
  const score = Math.min(9, Math.max(1, raw));
  const label =
    score <= 2 ? "Exceptional" :
    score <= 3.5 ? "Outstanding" :
    score <= 5 ? "Good" :
    score <= 7 ? "Fair" :
    "Poor";
  return { score, label };
}

// ─── Manuscript Readiness Score ──────────────────────────────────────
export function manuscriptReadiness(i: {
  contributionStrength: number;  // 0-1
  methodsRigor: number;         // 0-1
  theoryFit: number;            // 0-1
  reportingCompliance: number;  // 0-1
  reproducibility: number;      // 0-1
  writingClarity: number;       // 0-1
  reviewerResilience: number;   // 0-1
}): { score: number; label: string } {
  const score =
    0.20 * i.contributionStrength +
    0.20 * i.methodsRigor +
    0.15 * i.theoryFit +
    0.15 * i.reportingCompliance +
    0.10 * i.reproducibility +
    0.10 * i.writingClarity +
    0.10 * i.reviewerResilience;
  const label =
    score >= 0.80 ? "Ready to submit" :
    score >= 0.60 ? "Needs minor revision" :
    score >= 0.40 ? "Needs major revision" :
    "Not ready";
  return { score, label };
}

// ─── Research Gap Taxonomy ──────────────────────────────────────────
export const RESEARCH_GAPS = [
  { id: "empirical", name: "Empirical Gap", desc: "No data on a population, setting, period, or outcome" },
  { id: "theoretical", name: "Theoretical Gap", desc: "Existing theories cannot explain a pattern" },
  { id: "measurement", name: "Measurement Gap", desc: "Construct is poorly operationalized" },
  { id: "method", name: "Method Gap", desc: "Existing designs cannot support the needed inference" },
  { id: "mechanism", name: "Mechanism Gap", desc: "Relationship observed but process unknown" },
  { id: "translational", name: "Translational Gap", desc: "Discovery exists but is not implemented" },
  { id: "equity", name: "Equity Gap", desc: "Populations or contexts excluded from evidence base" },
  { id: "replication", name: "Replication Gap", desc: "Claims depend on single, fragile, or underpowered studies" },
  { id: "synthesis", name: "Synthesis Gap", desc: "Literature exists but has not been integrated" },
];

// ─── Reporting Standard Selector (deterministic) ────────────────────
export function selectReportingStandards(design: {
  reviewType?: string;
  intervention?: string;
  designType?: string;
  qualitative?: boolean;
  mixedMethods?: boolean;
  field?: string;
}): string[] {
  const standards: string[] = [];
  if (design.reviewType === "systematic_review" || design.reviewType === "meta_analysis") standards.push("PRISMA 2020");
  if (design.intervention === "randomized_trial") standards.push("CONSORT 2025");
  if (["cohort", "case_control", "cross_sectional"].includes(design.designType ?? "")) standards.push("STROBE");
  if (design.qualitative) standards.push("COREQ", "SRQR");
  if (design.mixedMethods) standards.push("APA JARS-Mixed", "MMAT");
  if (["psychology", "behavioral_science", "social_science", "education"].includes(design.field ?? "")) standards.push("APA JARS");
  return [...new Set(standards)];
}

// ─── Reviewer Persona Definitions ───────────────────────────────────
export const REVIEWER_PERSONAS = [
  { id: "theory", name: "Theory Reviewer", focus: "Conceptual contribution, construct definitions, theory-hypothesis link" },
  { id: "methods", name: "Methods Reviewer", focus: "Design-inference match, sampling, models, robustness" },
  { id: "domain", name: "Field/Domain Reviewer", focus: "Literature currency, citation fairness, practical contribution" },
  { id: "statistician", name: "Skeptical Statistician", focus: "Power, assumptions, multiplicity, null interpretation" },
  { id: "qualitative", name: "Qualitative Rigor Reviewer", focus: "Epistemology, reflexivity, data grounding, transferability" },
  { id: "ethics", name: "Ethics/Open Science Reviewer", focus: "IRB/consent, DMS plan, preregistration, COI" },
];
