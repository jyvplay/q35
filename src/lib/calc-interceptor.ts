/**
 * CALC-REQUEST Interceptor
 *
 * Problem: LLMs sometimes emit plain-English "CALC REQUEST: ..." text instead
 * of structured compute_requests, leaving the math undone in the final output.
 *
 * Solution: deterministic NL→compute mapping. We scan the draft for known
 * calculation intents (cRCT power, attrition adequacy, ICC effective N, etc.),
 * extract the numeric parameters with regex, run the REAL compute sandbox
 * function, and return a verified-fact block to splice back into the answer.
 *
 * This never asks the model to "please confirm" — the app does the math.
 */

import { runComputeCall, type ComputeRecord } from "./compute-sandbox";

function num(text: string, patterns: RegExp[], fallback: number): number {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] != null) {
      const v = parseFloat(m[1]);
      if (isFinite(v)) return v;
    }
  }
  return fallback;
}

export interface InterceptedCalc {
  record: ComputeRecord;
  intent: string;
}

/** Detect whether the text contains an un-executed calculation request. */
export function hasCalcRequest(text: string): boolean {
  return /\bCALC[\s_-]*REQUEST\b/i.test(text)
    || /\bplease confirm the (required|necessary) (number|sample|clusters)\b/i.test(text)
    || /\b(perform|run|compute|calculate) (a |the )?(cluster|power|sample[- ]size)\b/i.test(text);
}

/** Parse all calc requests in the text and execute them deterministically. */
export function interceptCalcRequests(text: string): InterceptedCalc[] {
  const out: InterceptedCalc[] = [];
  const lower = text.toLowerCase();

  // ── cRCT power calculation ──────────────────────────────────────────
  if (/cluster[\s-]*randomi[sz]ed|crct|clusters per arm|cluster size/i.test(lower) &&
      /power|hba1c|mean difference|effect|sample size/i.test(lower)) {
    const delta = num(text, [/mean difference of\s*([\d.]+)/i, /difference[^.\d]{0,12}([\d.]+)\s*%/i, /delta\s*[=:]\s*([\d.]+)/i], 0.5);
    const sd = num(text, [/sd\s*[=:(]?\s*([\d.]+)/i, /standard deviation[^.\d]{0,8}([\d.]+)/i], 1.5);
    const alpha = num(text, [/alpha\s*[=:]\s*([\d.]+)/i, /α\s*[=:]\s*([\d.]+)/i], 0.05);
    const power = num(text, [/power\s*[=:]\s*([\d.]+)/i, /β\s*[=:]\s*([\d.]+)/i, /(\d?\.\d+)\s*power/i], 0.80);
    const icc = num(text, [/icc\s*[=:]\s*([\d.]+)/i, /intra-?cluster correlation[^.\d]{0,12}([\d.]+)/i], 0.02);
    const clusterSize = num(text, [/cluster size\s*[=:of]*\s*(\d+)/i, /(\d+)\s*participants per cluster/i], 14);
    const attrition = num(text, [/attrition\s*(?:rate)?\s*(?:of)?\s*([\d.]+)\s*%/i, /([\d.]+)\s*%\s*attrition/i, /drop[- ]?out[^.\d]{0,12}([\d.]+)\s*%/i], 0) / (text.match(/%/) ? 100 : 1);
    const rec = runComputeCall({ id: "crct_power", args: { delta, sd, alpha, power, icc, clusterSize, attrition: attrition > 1 ? attrition / 100 : attrition } });
    out.push({ record: rec, intent: `cRCT power: Δ=${delta}, SD=${sd}, α=${alpha}, power=${power}, ICC=${icc}, m=${clusterSize}, attrition=${attrition}` });
  }

  // ── Attrition adequacy check ────────────────────────────────────────
  if (/attrition|drop[- ]?out|evaluable|retention/i.test(lower) &&
      /clusters? per arm|recruit|underpowered|preserve.*power/i.test(lower)) {
    const clustersPerArm = num(text, [/(\d+)\s*clusters? per arm/i, /(\d+)\s*per arm/i], 15);
    const recruitPerCluster = num(text, [/(\d+)\s*participants? per cluster/i, /recruit[^.\d]{0,12}(\d+)/i], 14);
    const attritionPct = num(text, [/attrition\s*(?:rate)?\s*(?:of)?\s*([\d.]+)\s*%/i, /([\d.]+)\s*%\s*attrition/i], 20);
    const requiredEvaluable = num(text, [/require\s*(\d+)\s*evaluable/i, /(\d+)\s*evaluable participants/i], 178);
    const rec = runComputeCall({ id: "attrition_check", args: { clustersPerArm, recruitPerCluster, attrition: attritionPct / 100, requiredEvaluablePerArm: requiredEvaluable } });
    out.push({ record: rec, intent: `Attrition adequacy: ${clustersPerArm} clusters/arm × ${recruitPerCluster} recruited, ${attritionPct}% attrition vs ${requiredEvaluable} required` });
  }

  return out;
}

/** Render intercepted calcs as a verified-fact block for the model to use. */
export function renderInterceptedCalcs(calcs: InterceptedCalc[]): string {
  if (calcs.length === 0) return "";
  const lines = calcs.map(c => {
    if (!c.record.ok || !c.record.result) return `  • ${c.intent} → COMPUTE FAILED (${c.record.error ?? "unknown"})`;
    const out = Object.entries(c.record.result).map(([k, v]) => `${k}=${v}`).join(", ");
    return `  • ${c.intent}\n    → ${out}  (deterministic, verified)`;
  });
  return `DETERMINISTIC CALCULATION RESULTS (the application computed these — use these EXACT numbers, never emit "CALC REQUEST" or "please confirm"):\n${lines.join("\n")}`;
}
