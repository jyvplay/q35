/**
 * Elo Registry — Authoritative LMSYS / Arena.ai model rankings.
 * Stronger LLMs (higher Elo) carry higher weight in judge consensus and
 * hold tie-break authority when evaluating vague or contested answers.
 */

export interface ModelEloRating {
  id: string;
  name: string;
  elo: number;
  tier: "Frontier" | "Strong" | "Capable";
  provider: "gemini";
  tieBreakAuthority?: boolean;
}

export const ARENA_ELO_TABLE: Record<string, ModelEloRating> = {
  "gemini-3.5-flash": { id: "gemini:gemini-3.5-flash", name: "gemini:gemini-3.5-flash", elo: 1478, tier: "Frontier", provider: "gemini", tieBreakAuthority: true },
  "gemini-3-flash-preview": { id: "gemini:gemini-3-flash-preview", name: "gemini:gemini-3-flash-preview", elo: 1470, tier: "Frontier", provider: "gemini" },
  "gemini-3.1-flash-lite": { id: "gemini:gemini-3.1-flash-lite", name: "gemini:gemini-3.1-flash-lite", elo: 1465, tier: "Frontier", provider: "gemini" },
  "gemini-2.5-pro": { id: "gemini:gemini-2.5-pro", name: "gemini:gemini-2.5-pro", elo: 1460, tier: "Frontier", provider: "gemini" },
  "gemma-4-31b-it": { id: "gemini:gemma-4-31b-it", name: "gemini:gemma-4-31b-it", elo: 1449, tier: "Strong", provider: "gemini" },
  "gemma-4-26b-it": { id: "gemini:gemma-4-26b-it", name: "gemini:gemma-4-26b-it", elo: 1430, tier: "Strong", provider: "gemini" },
  "gemini-2.5-flash": { id: "gemini:gemini-2.5-flash", name: "gemini:gemini-2.5-flash", elo: 1420, tier: "Strong", provider: "gemini" },
  "gemini-2.5-flash-lite": { id: "gemini:gemini-2.5-flash-lite", name: "gemini:gemini-2.5-flash-lite", elo: 1395, tier: "Strong", provider: "gemini" },
  "gemma-3-27b-it": { id: "gemini:gemma-3-27b-it", name: "gemini:gemma-3-27b-it", elo: 1338, tier: "Capable", provider: "gemini" },
};

export const GEMINI_ELO_ROSTER = Object.keys(ARENA_ELO_TABLE);

export function getModelEloInfo(modelId: string): ModelEloRating {
  const norm = modelId.toLowerCase().trim();
  for (const [key, val] of Object.entries(ARENA_ELO_TABLE)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) return val;
  }
  return { id: `gemini:${modelId}`, name: `gemini:${modelId}`, elo: 1338, tier: "Capable", provider: "gemini" };
}

export function getModelElo(modelId: string): number {
  return getModelEloInfo(modelId).elo;
}

export interface EloJudgment {
  model: string;
  score: number;
  note?: string;
}

export interface EloConsensusResult {
  weightedScore: number;
  rawAverage: number;
  tieBreakApplied: boolean;
  authorityModel: string;
  authorityElo: number;
  rationale: string;
}

/**
 * Calculates Elo-weighted consensus score across multiple judges.
 * If there is divergence (>1.0 spread between judges), the highest-Elo model
 * acts as tie-breaker authority and pulls the consensus toward its score.
 */
export function calculateEloConsensus(judgments: EloJudgment[]): EloConsensusResult {
  if (judgments.length === 0) {
    return { weightedScore: 0, rawAverage: 0, tieBreakApplied: false, authorityModel: "none", authorityElo: 0, rationale: "No judgments provided" };
  }
  if (judgments.length === 1) {
    const info = getModelEloInfo(judgments[0].model);
    return {
      weightedScore: judgments[0].score,
      rawAverage: judgments[0].score,
      tieBreakApplied: false,
      authorityModel: info.name,
      authorityElo: info.elo,
      rationale: `Single judge evaluation by ${info.name} (Elo: ${info.elo})`,
    };
  }

  // Sort by Elo descending
  const sorted = [...judgments].sort((a, b) => getModelElo(b.model) - getModelElo(a.model));
  const authority = sorted[0];
  const authInfo = getModelEloInfo(authority.model);

  const rawSum = judgments.reduce((acc, j) => acc + j.score, 0);
  const rawAverage = Math.round((rawSum / judgments.length) * 100) / 100;

  // Calculate exponential Elo weighting: W = 10 ^ ((Elo - 1200) / 400)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const j of judgments) {
    const elo = getModelElo(j.model);
    const w = Math.pow(10, (elo - 1200) / 400);
    totalWeight += w;
    weightedSum += j.score * w;
  }

  let weightedScore = Math.round((weightedSum / totalWeight) * 100) / 100;
  const spread = Math.max(...judgments.map(j => j.score)) - Math.min(...judgments.map(j => j.score));
  let tieBreakApplied = false;

  // If judges diverge significantly (> 1.2 points), highest Elo model tie-breaks
  if (spread >= 1.2 && authInfo.elo >= 1320) {
    tieBreakApplied = true;
    // Authority model pulls score 60% towards its verdict
    weightedScore = Math.round((weightedScore * 0.4 + authority.score * 0.6) * 100) / 100;
  }

  return {
    weightedScore,
    rawAverage,
    tieBreakApplied,
    authorityModel: authInfo.name,
    authorityElo: authInfo.elo,
    rationale: tieBreakApplied
      ? `Tie-break authority applied by ${authInfo.name} (Elo ${authInfo.elo}) resolving ${spread.toFixed(1)}pt spread`
      : `Elo-weighted consensus across ${judgments.length} models (top: ${authInfo.name} @ ${authInfo.elo} Elo)`,
  };
}
