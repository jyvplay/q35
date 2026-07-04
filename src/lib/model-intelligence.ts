/**
 * Model intelligence ratings — Arena.ai / LMSys Arena-aligned Elo-style scores.
 * Higher = stronger. Used for tie-breaking in N-Deep accept/reject judge:
 * when the judge cannot confidently decide between the critic's revision and
 * the original text, the text produced by the *stronger* author model wins.
 *
 * Scores are normalized to the 0..100 band and reflect Arena leaderboard
 * rankings as of early 2026. They are deliberately approximate (±3 pts) and
 * used only as a deterministic ordering signal — never as an absolute quality
 * claim.
 */
import type { ModelId } from "./models";

export const MODEL_INTELLIGENCE: Record<ModelId, number> = {
  // Gemini frontier
  "gemini-3.5-flash": 92,
  "gemini-3-flash-preview": 90,
  "gemini-2.5-pro": 94,
  "gemini-2.5-flash": 88,
  "gemini-3.1-flash-lite": 82,
  "gemini-2.5-flash-lite": 78,
  // Gemma open weights
  "gemma-4-31b-it": 80,
  "gemma-4-26b-it": 76,
  "gemma-3-27b-it": 74,
  // Claude
  "claude-3-7-sonnet-latest": 93,
  "claude-3-5-sonnet-latest": 89,
  "claude-3-5-haiku-latest": 80,
  // Grok
  "grok-2-latest": 86,
  // DeepSeek
  "deepseek-reasoner": 91,
  "deepseek-chat": 85,
};

export function intelligenceOf(model: ModelId | string): number {
  return (MODEL_INTELLIGENCE as Record<string, number>)[model] ?? 70;
}

/** Compare two model IDs. Returns a (intelligence > b ? 1 : a === b ? 0 : -1). */
export function compareIntelligence(a: ModelId | string, b: ModelId | string): number {
  const ai = intelligenceOf(a);
  const bi = intelligenceOf(b);
  if (ai > bi) return 1;
  if (ai < bi) return -1;
  return 0;
}
