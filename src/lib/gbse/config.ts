import type { EngineConfig, SPRTConfig } from "./types";

export function sprtUpper(cfg: SPRTConfig): number {
  return Math.log((1 - cfg.beta) / cfg.alpha);
}
export function sprtLower(cfg: SPRTConfig): number {
  return Math.log(cfg.beta / (1 - cfg.alpha));
}

export const defaultConfig = (overrides: Partial<EngineConfig> = {}): EngineConfig => ({
  sprt: { alpha: 0.05, beta: 0.10, minSupportingSources: 2 },
  evidence: { llrCap: 2.2, maxPriorLogOdds: 1.5, couplingCap: 0.9 },
  graph: { restartProb: 0.15, maxIters: 100, tolerance: 1e-8, maxNodes: 2000 },
  collapseMargin: 0.20,
  pruneFloor: 0.02,
  maxTokens: 200_000,
  maxSeconds: 1800,
  seed: 42,
  ...overrides,
});
