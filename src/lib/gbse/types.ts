// GBSE — shared types
// Classical Bayesian belief search; no quantum metaphors.

export enum Verdict {
  SUPPORT = "support",
  REFUTE = "refute",
  SILENT = "silent",
  CONTESTED = "contested",
}

export interface Evidence {
  sourceId: string;
  text: string;
  verdict: Verdict;
  reliability: number; // [0,1]
  strength: number; // [0,1]
  tokenCost: number;
  url?: string;
  ts: number;
}

export interface Hypothesis {
  hid: string;
  text: string;
  logw: number;
  alive: boolean;
  evidence: Evidence[];
  coupled: Record<string, number>;
  anchorVerdict: Verdict;
  anchorConfidence: number;
  spentTokens: number;
}

export interface BeliefState {
  sid: string;
  hyps: Record<string, Hypothesis>;
  committed: string | null;
  commitReason: string;
  spentTokens: number;
  createdAt: number;
}

export interface SPRTConfig {
  alpha: number;
  beta: number;
  minSupportingSources: number;
}

export interface EvidenceConfig {
  llrCap: number;
  maxPriorLogOdds: number;
  couplingCap: number;
}

export interface GraphConfig {
  restartProb: number;
  maxIters: number;
  tolerance: number;
  maxNodes: number;
}

export interface EngineConfig {
  sprt: SPRTConfig;
  evidence: EvidenceConfig;
  graph: GraphConfig;
  collapseMargin: number;
  pruneFloor: number;
  maxTokens: number;
  maxSeconds: number;
  seed: number;
}

export enum SPRTDecision {
  ACCEPT = "accept",
  CONTINUE = "continue",
  REJECT = "reject",
}

export interface TierSpec {
  tier: number;
  name: string;
  hypothesisCount: number;
  evidenceProbes: number;
  maxTokens: number;
  maxSeconds: number;
  forecastCoverage: number;
}

export interface TraceEvent {
  ts: number;
  phase: string;
  message: string;
  data?: unknown;
}
