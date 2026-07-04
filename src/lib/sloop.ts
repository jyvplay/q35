// MODULE D — SLOOP: Small-LLM Orchestration for Output Production.
// Decomposes a report into per-section sessions, each fitting inside a small
// model's context window (default 4096 tokens). Pure orchestration code;
// the LLM is called per section, never given the whole report at once.

export interface SectionSpec {
  id: string;
  name: string;
  promptTemplate: string;          // small, focused prompt for THIS section only
  evidenceChunks: string[];        // IDs of evidence chunks to inject
  dependsOn: string[];             // sections whose summaries we need
  outputSchema?: string;           // JSON schema name (for structured decoding)
  maxOutputTokens: number;
  requiredFields?: string[];
}

export interface ReportSpec {
  reportId: string;
  template: string;                 // OMEGA archetype id
  styleOverride: string | null;
  sections: SectionSpec[];
  assemblyOrder: string[];
  calculations?: Record<string, { fn: string; inputsFrom: string }>;
}

export interface SessionBudget {
  systemPromptTok: number;
  contextSummaryTok: number;
  evidenceTok: number;
  outputReserveTok: number;
  safetyMarginTok: number;
}

export const DEFAULT_BUDGET_4K: SessionBudget = {
  systemPromptTok: 600,
  contextSummaryTok: 500,
  evidenceTok: 1200,
  outputReserveTok: 1200,
  safetyMarginTok: 596,
};

export function totalBudget(b: SessionBudget): number {
  return b.systemPromptTok + b.contextSummaryTok + b.evidenceTok + b.outputReserveTok + b.safetyMarginTok;
}

// Rough token estimate (≈4 chars / token, std English heuristic).
export const estTokens = (s: string) => Math.max(1, Math.round(s.length / 4));

export interface ModelProfile {
  id: string;
  name: string;
  ctxTokens: number;
  budget: SessionBudget;
  notes: string;
}

export const MODEL_PROFILES: ModelProfile[] = [
  { id: "apple-fm", name: "Apple Foundation Model (on-device)", ctxTokens: 4096, budget: DEFAULT_BUDGET_4K, notes: "Standard SLOOP loop." },
  { id: "phi-3-mini", name: "Phi-3 mini", ctxTokens: 4096, budget: DEFAULT_BUDGET_4K, notes: "Same budget; use JSON mode." },
  { id: "qwen2-5-3b", name: "Qwen2.5 3B", ctxTokens: 4096, budget: DEFAULT_BUDGET_4K, notes: "Standard SLOOP loop." },
  { id: "gemma-2b", name: "Gemma 2B", ctxTokens: 8192, budget: { ...DEFAULT_BUDGET_4K, evidenceTok: 2400, outputReserveTok: 2400, safetyMarginTok: 600 }, notes: "Double evidence chunks." },
  { id: "llama-3-2-1b", name: "Llama 3.2 1B", ctxTokens: 8192, budget: { ...DEFAULT_BUDGET_4K, evidenceTok: 2400, outputReserveTok: 2000, safetyMarginTok: 800 }, notes: "Add verification session." },
  { id: "phi-4", name: "Phi-4", ctxTokens: 16384, budget: { ...DEFAULT_BUDGET_4K, evidenceTok: 6000, outputReserveTok: 4000, safetyMarginTok: 2000 }, notes: "Can batch 2-3 sections." },
  { id: "mistral-7b", name: "Mistral 7B", ctxTokens: 32768, budget: { ...DEFAULT_BUDGET_4K, evidenceTok: 12000, outputReserveTok: 8000, safetyMarginTok: 4000 }, notes: "Can batch 4-6 sections." },
];

export interface EscalationTrigger { id: string; label: string; }
export const ESCALATION_TRIGGERS: EscalationTrigger[] = [
  { id: "world-knowledge", label: "Task requires world knowledge not in evidence chunks" },
  { id: "deep-reasoning", label: "Section requires >3 inference steps" },
  { id: "cross-synthesis", label: "Creative synthesis across >4 evidence sources" },
  { id: "tier-5", label: "User explicitly requested deep / Tier-5 mode" },
  { id: "contradiction", label: "Verification detected contradictions requiring judgment" },
  { id: "crisis-legal", label: "OMEGA-CRISIS with privilege / legal implications" },
];

export const SLOOP_PRINCIPLES = [
  "Calculations are deterministic, not LLM-generated",
  "Each session is stateless (memory is in controller-side summaries)",
  "Structured output only (JSON schema → prose formatter)",
  "Verification is controller-side, not another LLM pass",
  "Graceful degradation: retry once, then emit [INCOMPLETE] tag",
  "Evidence pre-chunked and ranked by relevance",
];

/** Build a default per-archetype section pipeline. */
export function buildReportSpec(archetypeId: string, styleOverride: string | null = null): ReportSpec {
  const orderByArchetype: Record<string, string[]> = {
    "decision-strategy":     ["bluf", "situation", "diagnostic", "options", "recommendation", "implementation", "risks", "appendix"],
    "investment-financial":  ["thesis", "asset", "market", "commercial-dd", "financial-dd", "value-plan", "valuation", "risks", "decision-pkg", "appendix"],
    "implementation-tech":   ["summary", "current-state", "target-state", "portfolio", "operating-model", "roadmap", "business-case", "risk-rai", "adoption", "appendix"],
    "audit-assurance":       ["assurance-summary", "scope", "methodology", "findings", "risk", "controls", "recommendations", "governance", "appendix"],
    "scientific-academic":   ["abstract", "background", "aims", "methods", "results", "discussion", "impact", "compliance", "references", "supplementary"],
    "policy-public":         ["policy-summary", "mandate", "diagnostic", "evidence", "options", "impact", "preferred", "implementation", "annexes"],
    "market-commercial":     ["sector-summary", "market-def", "sizing", "demand", "competitive", "economics", "trends", "implications", "appendix"],
  };
  const sections = (orderByArchetype[archetypeId] ?? orderByArchetype["decision-strategy"]).map<SectionSpec>(id => ({
    id, name: id.replace(/-/g, " "),
    promptTemplate: `Generate the "${id}" section only. Do not echo other sections. Output JSON matching the section schema.`,
    evidenceChunks: [], dependsOn: [], maxOutputTokens: 800,
  }));
  return {
    reportId: `r-${Date.now().toString(36)}`, template: archetypeId, styleOverride,
    sections, assemblyOrder: sections.map(s => s.id),
  };
}

/** Estimate how many sessions a model needs for a given report spec. */
export function plannedSessions(spec: ReportSpec, profile: ModelProfile): { sessions: number; words: number } {
  const sectionsPerSession = profile.ctxTokens >= 16384 ? 2 : profile.ctxTokens >= 32000 ? 4 : 1;
  const sessions = Math.ceil(spec.sections.length / sectionsPerSession);
  const wordsPerSection = Math.round(profile.budget.outputReserveTok * 0.75); // tokens -> words
  return { sessions, words: spec.sections.length * wordsPerSection };
}
