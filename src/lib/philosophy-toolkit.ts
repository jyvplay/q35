// MODULE B — Compact catalogs used by report templates.

export interface Paradigm {
  id: string; name: string;
  ontology: string; epistemology: string;
  tendency: "quantitative" | "qualitative" | "mixed";
  goodFor: string;
}

export const PARADIGMS: Paradigm[] = [
  { id: "positivism", name: "Positivism", ontology: "realist", epistemology: "empiricist", tendency: "quantitative", goodFor: "controlled trials, predictive models" },
  { id: "post-positivism", name: "Post-positivism", ontology: "critical-realist", epistemology: "empiricist", tendency: "quantitative", goodFor: "large-N with explicit limits" },
  { id: "critical-realism", name: "Critical Realism", ontology: "critical-realist", epistemology: "rationalist", tendency: "mixed", goodFor: "causal-mechanism studies" },
  { id: "interpretivism", name: "Interpretivism", ontology: "relativist", epistemology: "hermeneutic", tendency: "qualitative", goodFor: "lived experience, meaning" },
  { id: "constructionism", name: "Social Constructionism", ontology: "constructionist", epistemology: "hermeneutic", tendency: "qualitative", goodFor: "discourse, identity" },
  { id: "critical-theory", name: "Critical Theory", ontology: "critical-realist", epistemology: "critical", tendency: "qualitative", goodFor: "power, emancipatory work" },
  { id: "pragmatism", name: "Pragmatism", ontology: "pragmatist", epistemology: "pragmatist", tendency: "mixed", goodFor: "applied research, policy evaluation" },
];

export interface QualMethod { id: string; name: string; lineage: string; steps: string[]; }
export const QUAL_METHODS: QualMethod[] = [
  { id: "phenomenology", name: "Phenomenology", lineage: "Husserl tradition", steps: ["bracketing", "data collection", "horizonalization", "cluster themes", "textural description", "structural description", "composite essence"] },
  { id: "grounded-theory", name: "Grounded Theory", lineage: "Glaser-Strauss / Charmaz", steps: ["open coding", "axial coding", "selective coding", "theoretical sampling", "saturation", "core category"] },
  { id: "ethnography", name: "Ethnography", lineage: "Geertz / Spradley", steps: ["field design", "participant observation", "field notes", "interviews", "artifact analysis", "thick description", "cultural themes"] },
  { id: "case-study", name: "Case Study", lineage: "Yin / Stake", steps: ["case selection", "unit of analysis", "multi-source evidence", "pattern matching", "cross-case synthesis"] },
  { id: "narrative", name: "Narrative Inquiry", lineage: "Clandinin & Connelly", steps: ["living", "telling", "retelling", "reliving"] },
  { id: "discourse", name: "Critical Discourse Analysis", lineage: "Fairclough", steps: ["text description", "discursive practice", "social practice"] },
  { id: "action-research", name: "Action Research", lineage: "Lewin tradition", steps: ["plan", "act", "observe", "reflect", "iterate"] },
];

export interface MixedDesign { id: string; name: string; sequence: string; }
export const MIXED_DESIGNS: MixedDesign[] = [
  { id: "convergent", name: "Convergent Parallel", sequence: "QUAL + QUAN simultaneous, then compare" },
  { id: "explanatory", name: "Explanatory Sequential", sequence: "QUAN then qual to explain" },
  { id: "exploratory", name: "Exploratory Sequential", sequence: "qual then QUAN to instrument" },
  { id: "embedded", name: "Embedded", sequence: "one nested in the other" },
  { id: "transformative", name: "Transformative", sequence: "justice frame drives both" },
];

export interface LogicSystem { id: string; name: string; operators: string; useCase: string; }
export const LOGIC_SYSTEMS: LogicSystem[] = [
  { id: "prop", name: "Propositional Logic", operators: "AND OR NOT IMP IFF", useCase: "argument validity" },
  { id: "fopl", name: "First-Order Predicate Logic", operators: "FORALL EXISTS predicates", useCase: "reasoning over individuals" },
  { id: "modal", name: "Modal Logic", operators: "necessarily, possibly", useCase: "counterfactual reasoning" },
  { id: "deontic", name: "Deontic Logic", operators: "Obligatory, Permitted, Forbidden", useCase: "regulatory and ethics analysis" },
  { id: "epistemic", name: "Epistemic Logic", operators: "K_a, B_a", useCase: "information asymmetry, game theory" },
];

export interface Fallacy { id: string; category: string; name: string; }
export const FALLACIES: Fallacy[] = [
  { id: "ad-hominem", category: "Relevance", name: "Ad Hominem" },
  { id: "straw-man", category: "Relevance", name: "Straw Man" },
  { id: "red-herring", category: "Relevance", name: "Red Herring" },
  { id: "appeal-authority", category: "Relevance", name: "Appeal to Authority" },
  { id: "begging", category: "Presumption", name: "Begging the Question" },
  { id: "false-dilemma", category: "Presumption", name: "False Dilemma" },
  { id: "slippery-slope", category: "Presumption", name: "Slippery Slope" },
  { id: "equivocation", category: "Ambiguity", name: "Equivocation" },
  { id: "hasty-generalization", category: "Inductive", name: "Hasty Generalization" },
  { id: "false-cause", category: "Inductive", name: "False Cause" },
  { id: "base-rate", category: "Statistical", name: "Base Rate Neglect" },
  { id: "survivorship", category: "Statistical", name: "Survivorship Bias" },
];

export interface ArgScheme { id: string; name: string; criticalQuestions: string[]; }
export const ARG_SCHEMES: ArgScheme[] = [
  { id: "expert-opinion", name: "Argument from Expert Opinion", criticalQuestions: ["credentials", "field-of-expertise match", "bias", "consensus"] },
  { id: "analogy", name: "Argument from Analogy", criticalQuestions: ["relevant similarities", "disanalogies", "scope"] },
  { id: "consequences", name: "Argument from Consequences", criticalQuestions: ["likelihood", "magnitude", "side effects"] },
  { id: "best-explanation", name: "Argument from Best Explanation", criticalQuestions: ["alternative explanations", "explanatory completeness"] },
  { id: "practical", name: "Practical Reasoning", criticalQuestions: ["goal validity", "means necessity", "side effects"] },
  { id: "slippery", name: "Slippery Slope", criticalQuestions: ["mechanism between steps", "intermediate stopping points"] },
];

export const TOULMIN_PARTS = ["Claim", "Data", "Warrant", "Backing", "Qualifier", "Rebuttal"];
