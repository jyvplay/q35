/**
 * Live telemetry — REAL measured counters accumulated during a run.
 * Replaces the simulated AEGIS-PHI actuals with measured values:
 *   - tokensIn/Out estimated from actual prompt/response char counts (≈4 chars/token)
 *   - toolCalls counted as real jinaSearch / model calls fire
 *   - sources counted from real Jina results
 *   - hypotheses/claims counted from real pipeline output
 *   - elapsedMs from a real monotonic clock
 *   - entropy lowered as the run converges (real progress, not random)
 */

export interface LiveTelemetry {
  running: boolean;
  phase: string;
  startedAt: number;
  elapsedMs: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  searchCalls: number;
  modelCalls: number;
  computeCalls: number;
  sources: number;
  hypotheses: number;
  claimsTotal: number;
  claimsVerified: number;
  injectionsBlocked: number;
  sanitizerStrips: number;
  anchorCoverage: number | null;
  measuredCoverage: number | null;
  coverageNumerator: number;
  coverageDenominator: number;
  entropy: number;
  contradictions: number;
  tier: number | null;
  sscpHash: string | null;
  evidenceTier: "CTX" | "SRC" | "TOOL" | "DERIV";
  pipelineStage: number;
  pipelineTrace?: import("./pipeline").PipelineTrace[];
  artifactResolved: number;
  artifactUnresolved: number;
}

export function emptyTelemetry(): LiveTelemetry {
  return {
    running: false, phase: "idle", startedAt: 0, elapsedMs: 0,
    tokensIn: 0, tokensOut: 0, toolCalls: 0, searchCalls: 0, modelCalls: 0, computeCalls: 0,
    sources: 0, hypotheses: 0, claimsTotal: 0, claimsVerified: 0,
    injectionsBlocked: 0, sanitizerStrips: 0, anchorCoverage: null,
    measuredCoverage: null, coverageNumerator: 0, coverageDenominator: 0,
    entropy: 1, contradictions: 0, tier: null, sscpHash: null,
    evidenceTier: "CTX", pipelineStage: 0,
    artifactResolved: 0, artifactUnresolved: 0,
  };
}

/** Rough token estimate from text (≈4 chars/token, std GPT-family heuristic). */
export function estTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
