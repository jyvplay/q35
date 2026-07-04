import type { TierSpec } from "./types";

export const TIERS: Record<number, TierSpec> = {
  0: { tier: 0, name: "T0 REFLEX",     hypothesisCount: 0,  evidenceProbes: 0,  maxTokens: 2_000,    maxSeconds: 15,   forecastCoverage: 0.30 },
  1: { tier: 1, name: "T1 SCOUT",      hypothesisCount: 4,  evidenceProbes: 3,  maxTokens: 20_000,   maxSeconds: 180,  forecastCoverage: 0.55 },
  2: { tier: 2, name: "T2 SURVEY",     hypothesisCount: 6,  evidenceProbes: 8,  maxTokens: 80_000,   maxSeconds: 480,  forecastCoverage: 0.70 },
  3: { tier: 3, name: "T3 DEEP_DIVE",  hypothesisCount: 8,  evidenceProbes: 14, maxTokens: 300_000,  maxSeconds: 1200, forecastCoverage: 0.82 },
  4: { tier: 4, name: "T4 EXHAUSTIVE", hypothesisCount: 10, evidenceProbes: 24, maxTokens: 1_200_000, maxSeconds: 2700, forecastCoverage: 0.91 },
  5: { tier: 5, name: "T5 SATURATION", hypothesisCount: 12, evidenceProbes: 40, maxTokens: 3_000_000, maxSeconds: 5400, forecastCoverage: 0.96 },
};

const HIGH_STAKES = new Set(["medical", "clinical", "legal", "financial", "safety", "security", "dosage", "diagnosis"]);
const VOLATILE = new Set(["current", "today", "price", "ceo", "president", "latest", "recent", "now", "2025", "2026"]);

export function pickTier(query: string, anchorCoverage = 0.0): { tier: number; reason: string } {
  const ql = query.toLowerCase();
  const stakes = [...HIGH_STAKES].some((k) => ql.includes(k));
  const volatile = [...VOLATILE].some((k) => ql.includes(k));
  const entities = query.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length;
  const complexity = Math.min(1.0, query.split(/\s+/).length / 40 + 0.05 * entities);
  const score = complexity + (volatile ? 0.3 : 0) + (stakes ? 0.3 : 0);

  if (anchorCoverage >= 0.75 && !stakes && !volatile) {
    return { tier: 0, reason: "anchor covers query; low stakes" };
  }
  let tier: number;
  if (score < 0.25) tier = 1;
  else if (score < 0.45) tier = 2;
  else if (score < 0.70) tier = 3;
  else if (score < 0.90) tier = 4;
  else tier = 5;
  if (stakes) tier = Math.max(tier, 3);
  return {
    tier,
    reason: `complexity=${score.toFixed(2)} stakes=${stakes} volatile=${volatile}`,
  };
}

export interface TokenReport {
  measuredSpent: number;
  counterfactualBaseline: number;
  estimatedSaved: number;
  baselineAssumption: string;
  nHypotheses: number;
  nPruned: number;
}

export function tokenReport(
  spentTokens: number,
  nHypotheses: number,
  nPruned: number,
  synthesisCostPerHyp: number,
): TokenReport {
  const baseline = spentTokens + (nHypotheses - 1) * synthesisCostPerHyp;
  const saved = Math.max(0, baseline - (spentTokens + synthesisCostPerHyp));
  return {
    measuredSpent: spentTokens,
    counterfactualBaseline: baseline,
    estimatedSaved: saved,
    baselineAssumption:
      "Baseline ASSUMES every hypothesis would be fully synthesized. Real savings depend on the host pipeline and are not measured here.",
    nHypotheses,
    nPruned,
  };
}
