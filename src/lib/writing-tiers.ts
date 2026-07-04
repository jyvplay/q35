// MODULE C — Prose register calibration + citation style routing +
// argument-structure templates. Drives the "register" of each report
// archetype so the same content sounds right for board/analyst/scientist/legal.

export type AudienceTier = "executive" | "analytical" | "technical" | "legal";

export interface RegisterProfile {
  id: AudienceTier;
  name: string;
  audience: string;
  sentenceWords: [number, number];   // min, max average
  paragraphSentences: [number, number];
  vocabulary: string;
  voice: "active" | "active-with-passive" | "passive-ok";
  evidenceDensity: string;
  hedging: string;
  rules: string[];
}

export const REGISTERS: RegisterProfile[] = [
  {
    id: "executive", name: "Executive", audience: "board, C-suite, ministers, investors",
    sentenceWords: [12, 20], paragraphSentences: [2, 4],
    vocabulary: "business English; define jargon at first use",
    voice: "active", evidenceDensity: "one data point per claim",
    hedging: "minimal — 'we recommend', not 'it might be considered'",
    rules: [
      "Open with the verdict in one sentence",
      "No nominalizations that hide agency",
      "One key number per paragraph",
      "End with the next decision required",
    ],
  },
  {
    id: "analytical", name: "Analytical", audience: "analysts, associates, researchers, program staff",
    sentenceWords: [15, 25], paragraphSentences: [3, 6],
    vocabulary: "technical terms allowed with first-use definition",
    voice: "active-with-passive", evidenceDensity: "multiple data points per major claim",
    hedging: "calibrated — pair each claim with a confidence level",
    rules: [
      "State methodology in one paragraph before findings",
      "Show the formula behind each calculated number",
      "Footnote methodology and caveats",
      "Quote disconfirming evidence and explain how it was handled",
    ],
  },
  {
    id: "technical", name: "Technical / Scientific", audience: "peer reviewers, engineers, auditors",
    sentenceWords: [15, 30], paragraphSentences: [3, 8],
    vocabulary: "domain-native, no simplification",
    voice: "active-with-passive", evidenceDensity: "full reproducibility detail",
    hedging: "precise — effect size + CI + p-value + test name",
    rules: [
      "Report statistics as: stat, df, p-value, effect size, 95% CI",
      "Methods must be reproducible from text alone",
      "Pre-register hypotheses where applicable",
      "Cite using discipline-appropriate format",
    ],
  },
  {
    id: "legal", name: "Legal / Regulatory", audience: "courts, regulators, compliance officers",
    sentenceWords: [12, 28], paragraphSentences: [2, 6],
    vocabulary: "every word legally defensible",
    voice: "passive-ok", evidenceDensity: "every assertion sourced",
    hedging: "explicit scope limitations and reliance statements",
    rules: [
      "Cross-reference by section and paragraph throughout",
      "Use defined-term capitalization consistently",
      "State scope, limitations, and reliance up front",
      "Avoid adjective inflation; let the facts carry the case",
    ],
  },
];

// ─── Citation style routing ─────────────────────────────────────────
export interface CitationStyle { id: string; name: string; goodFor: string; }
export const CITATION_STYLES: CitationStyle[] = [
  { id: "apa", name: "APA 7", goodFor: "psychology, education, social sciences" },
  { id: "chicago-nb", name: "Chicago 17 (Notes-Bibliography)", goodFor: "humanities, history, philosophy, arts" },
  { id: "chicago-ad", name: "Chicago 17 (Author-Date)", goodFor: "policy briefs, business" },
  { id: "mla", name: "MLA 9", goodFor: "literature, languages, cultural studies" },
  { id: "ama", name: "AMA 11 / Vancouver", goodFor: "medicine, health sciences" },
  { id: "ieee", name: "IEEE", goodFor: "engineering, computer science, technical" },
  { id: "bluebook", name: "Bluebook 21 / OSCOLA", goodFor: "law" },
  { id: "house", name: "House inline + reference annex", goodFor: "consulting, business, AI-native default" },
];

// Anti-patterns to flag in any register
export const ANTI_PATTERNS: { id: string; pattern: RegExp; brief: string }[] = [
  { id: "weasel", pattern: /\b(many|some|several|various)\s+(experts?|analysts?|studies)\s+(believe|think|say|claim)/i,
    brief: "Unquantified attribution to an unnamed group" },
  { id: "unattributed-stat", pattern: /\bstudies show that \d+%/i,
    brief: "Statistics without a named source" },
  { id: "hedge-stack", pattern: /\b(it may|may possibly|might potentially|could possibly|perhaps possibly)\b/i,
    brief: "Stacked hedges that erase meaning" },
  { id: "adj-inflation", pattern: /\b(extremely|incredibly|absolutely|truly)\s+(critical|important|essential|crucial|urgent)\b/i,
    brief: "Adjective inflation" },
  { id: "nominalization", pattern: /\b(implementation|optimization|utilization|determination|consideration) of [^.]{2,40}\b(was|is|are|were) (performed|conducted|undertaken|carried out)\b/i,
    brief: "Nominalization hiding the agent" },
];

export interface ArgStructure { id: string; name: string; parts: string[]; goodFor: string; }
export const ARG_STRUCTURES: ArgStructure[] = [
  { id: "minto", name: "Minto Pyramid", parts: ["Answer", "Key line arguments (3-5)", "Supporting evidence per argument"], goodFor: "consulting default" },
  { id: "toulmin", name: "Toulmin", parts: ["Claim", "Data", "Warrant", "Backing", "Qualifier", "Rebuttal"], goodFor: "academic / policy argument" },
  { id: "scqa", name: "SCQA", parts: ["Situation", "Complication", "Question", "Answer"], goodFor: "executive communication" },
  { id: "orid", name: "ORID", parts: ["Objective", "Reflective", "Interpretive", "Decisional"], goodFor: "workshops, interviews" },
  { id: "star", name: "STAR", parts: ["Situation", "Task", "Action", "Result"], goodFor: "case studies, behavioral examples" },
  { id: "spade", name: "SPADE", parts: ["Setting", "People", "Alternatives", "Decide", "Explain"], goodFor: "decision documentation" },
  { id: "scipab", name: "SCIPAB", parts: ["Situation", "Complication", "Implication", "Position", "Action", "Benefit"], goodFor: "persuasive pitches" },
];

/** Pick a register from the routed archetype id. */
export function registerForArchetype(archetypeId: string): AudienceTier {
  switch (archetypeId) {
    case "scientific-academic": return "technical";
    case "audit-assurance": return "legal";
    case "policy-public": return "analytical";
    case "investment-financial": return "analytical";
    case "implementation-tech": return "technical";
    case "decision-strategy":
    case "market-commercial":
    default: return "executive";
  }
}
