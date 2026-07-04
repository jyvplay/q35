import { TIERS } from "./gbse/tiers";

export type DriverId =
  | "frontier"
  | "gemma4-31b"
  | "qwen3.6"
  | "gemma4-e4b"
  | "apple-ondevice"
  | "bonsai-8b";

export interface EstimateInput {
  query: string;
  tier: number;
  driver: DriverId;
  anchorMode: "required" | "preferred" | "off";
  webAccess: "on" | "trusted" | "off";
  verifierAlpha: number;
  councilWidth: number;
  workerDepth: number;
}

export interface Estimate {
  tier: number;
  time_s: number;
  tokens_in: number;
  tokens_out: number;
  tools: number;
  paths: number;
  states: number;
  ram_bytes: number;
  dense_states_avoided: number;
  dense_bytes_avoided: number;
  coverage: number;
}

export interface Actuals {
  actual_in: number;
  actual_out: number;
  actual_tools: number;
  actual_paths: number;
  actual_states: number;
  actual_ram: number;
  entropy: number;
  contradictions: number;
  token_saved: number;
}

const DRIVER_MULTIPLIER: Record<DriverId, { time: number; tokens: number; coverage: number }> = {
  frontier: { time: 0.8, tokens: 1.0, coverage: 1.02 },
  "gemma4-31b": { time: 1.0, tokens: 1.0, coverage: 1.0 },
  "qwen3.6": { time: 1.25, tokens: 1.12, coverage: 1.0 },
  "gemma4-e4b": { time: 1.8, tokens: 0.78, coverage: 0.88 },
  "apple-ondevice": { time: 2.0, tokens: 0.65, coverage: 0.82 },
  "bonsai-8b": { time: 2.3, tokens: 0.55, coverage: 0.78 },
};

export function estimateResources(input: EstimateInput): Estimate {
  const tier = Math.max(0, Math.min(5, input.tier));
  const spec = TIERS[tier];
  const words = input.query.trim().split(/\s+/).filter(Boolean).length;
  const complexity = Math.min(2.0, 0.65 + words / 80 + input.councilWidth / 40 + input.workerDepth / 60);
  const driver = DRIVER_MULTIPLIER[input.driver];
  const anchorDiscount = input.anchorMode === "required" ? 0.72 : input.anchorMode === "preferred" ? 0.86 : 1.0;
  const webMultiplier = input.webAccess === "off" ? 0.35 : input.webAccess === "trusted" ? 0.75 : 1.0;
  const verifierBoost = 1 + Math.max(0, input.verifierAlpha - 0.2) * 0.9;

  const tokens = spec.maxTokens * 0.32 * complexity * driver.tokens * anchorDiscount * verifierBoost;
  const tokens_in = Math.round(tokens * 0.68);
  const tokens_out = Math.round(tokens * 0.32);
  const tools = Math.max(0, Math.round(spec.evidenceProbes * complexity * webMultiplier + (input.anchorMode === "off" ? 0 : 6)));
  const paths = Math.max(1, Math.round(input.councilWidth * Math.max(1, input.workerDepth / 3)));
  const states = Math.max(1, Math.round(paths * (tier + 1) * 1.7));
  const sparseEdges = Math.max(1, tools + paths * 3 + states);
  const ram_bytes = sparseEdges * 64;
  const dense_states_avoided = Math.pow(2, Math.min(20, Math.max(1, states)));
  const dense_bytes_avoided = dense_states_avoided * 8;
  const coverage = Math.max(
    0.15,
    Math.min(0.98, spec.forecastCoverage * driver.coverage * (input.anchorMode === "required" ? 0.96 : 1) * (input.webAccess === "off" ? 0.78 : 1)),
  );
  const time_s = Math.round(spec.maxSeconds * 0.45 * complexity * driver.time * webMultiplier * verifierBoost);

  return { tier, time_s, tokens_in, tokens_out, tools, paths, states, ram_bytes, dense_states_avoided, dense_bytes_avoided, coverage };
}

/** Honest empty actuals when no run has occurred. No simulation — zeros mean "not measured yet". */
export function zeroActuals(): Actuals {
  return {
    actual_in: 0, actual_out: 0, actual_tools: 0, actual_paths: 0,
    actual_states: 0, actual_ram: 0, entropy: 0, contradictions: 0, token_saved: 0,
  };
}

export function aegisPanel(est: Estimate, actual: Actuals, elapsed: number): string {
  const d = (a: number, e: number) => `${a >= e ? "+" : ""}${a - e}`;
  const densePower = Math.floor(Math.log2(Math.max(1, est.dense_states_avoided)));
  return [
    "╔════════════════════════════════════════════════════════════════════╗",
    `║ AEGIS-PHI  ::  T${est.tier} ${TIERS[est.tier].name.padEnd(14)}  ::  live  ${elapsed.toFixed(1).padStart(6)}s      ║`,
    "╠════════════════════════════════════════════════════════════════════╣",
    `║ TIME       est ${String(est.time_s).padStart(7)}s act ${elapsed.toFixed(1).padStart(8)}s Δ ${(elapsed - est.time_s).toFixed(0).padStart(7)} ║`,
    `║ TOK IN     est ${String(est.tokens_in).padStart(8)} act ${String(actual.actual_in).padStart(8)} Δ ${d(actual.actual_in, est.tokens_in).padStart(7)} ║`,
    `║ TOK OUT    est ${String(est.tokens_out).padStart(8)} act ${String(actual.actual_out).padStart(8)} Δ ${d(actual.actual_out, est.tokens_out).padStart(7)} ║`,
    `║ TOOLS      est ${String(est.tools).padStart(8)} act ${String(actual.actual_tools).padStart(8)} Δ ${d(actual.actual_tools, est.tools).padStart(7)} ║`,
    `║ PATHS      est ${String(est.paths).padStart(8)} act ${String(actual.actual_paths).padStart(8)} Δ ${d(actual.actual_paths, est.paths).padStart(7)} ║`,
    `║ STATES     est ${String(est.states).padStart(8)} act ${String(actual.actual_states).padStart(8)} Δ ${d(actual.actual_states, est.states).padStart(7)} ║`,
    `║ RAM sparse est ${String(est.ram_bytes).padStart(8)}B act ${String(actual.actual_ram).padStart(8)}B             ║`,
    `║ DENSE AVOIDED  2^${densePower} mask = ${(est.dense_bytes_avoided / 1024).toFixed(1).padStart(7)} KB                 ║`,
    `║ TOK SAVED  via collapse vs raw fan-in: ${String(actual.token_saved).padStart(8)}              ║`,
    `║ PSI-ENTROPY  ${actual.entropy.toFixed(3)}   CONTRADICTIONS  ${String(actual.contradictions).padStart(3)}                 ║`,
    `║ COVERAGE   forecast ${(est.coverage * 100).toFixed(1).padStart(5)}%                              ║`,
    "╚════════════════════════════════════════════════════════════════════╝",
  ].join("\n");
}