// MODULE A — VC / Medallion-grade Quantitative Engine.
// Deterministic, pure-TypeScript, composable, side-effect free.

// ─── Unit economics ─────────────────────────────────────────────────
export const mrr = (customers: number, arpu: number) => customers * arpu;
export const arr = (m: number) => m * 12;
export const cac = (sm: number, n: number) => n > 0 ? sm / n : NaN;
export const ltv = (arpuM: number, gm: number, churnM: number) => churnM > 0 ? (arpuM * gm) / churnM : NaN;
export const ltvCacRatio = (l: number, c: number) => c > 0 ? l / c : NaN;
export const cacPaybackMonths = (c: number, arpuM: number, gm: number) => c / (arpuM * gm);
export const nrr = (start: number, exp: number, contr: number, churn: number) => start > 0 ? (start + exp - contr - churn) / start : NaN;
export const grr = (start: number, contr: number, churn: number) => start > 0 ? (start - contr - churn) / start : NaN;
export const magicNumber = (netNewARR: number, priorQSM: number) => priorQSM > 0 ? netNewARR / priorQSM : NaN;
export const burnMultiple = (netBurn: number, netNewARR: number) => netNewARR > 0 ? netBurn / netNewARR : NaN;
export const ruleOf40 = (growthPct: number, marginPct: number) => growthPct + marginPct;
export const monthsRunway = (cash: number, monthlyBurn: number) => monthlyBurn > 0 ? cash / monthlyBurn : Infinity;

// ─── DCF / IRR / WACC / CAPM ────────────────────────────────────────
export interface DcfResult {
  pvCashFlows: number; pvTerminal: number; enterpriseValue: number;
  terminalPctOfEV: number; impliedExitMultiple: number;
}
export function dcfNpv(cashFlows: number[], discountRate: number, terminalGrowth = 0.02): DcfResult {
  const n = cashFlows.length;
  const tv = cashFlows[n - 1] * (1 + terminalGrowth) / (discountRate - terminalGrowth);
  const pvCfs = cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + discountRate, t + 1), 0);
  const pvTerm = tv / Math.pow(1 + discountRate, n);
  const ev = pvCfs + pvTerm;
  return { pvCashFlows: pvCfs, pvTerminal: pvTerm, enterpriseValue: ev,
    terminalPctOfEV: pvTerm / ev, impliedExitMultiple: tv / cashFlows[n - 1] };
}
export function irr(cashFlows: number[], guess = 0.1): number {
  let rate = guess;
  for (let i = 0; i < 1000; i++) {
    const npv = cashFlows.reduce((a, cf, t) => a + cf / Math.pow(1 + rate, t), 0);
    const dnpv = cashFlows.reduce((a, cf, t) => a + (-t * cf) / Math.pow(1 + rate, t + 1), 0);
    if (Math.abs(dnpv) < 1e-12) break;
    rate -= npv / dnpv;
  }
  return rate;
}
export const moic = (exit: number, invested: number) => invested > 0 ? exit / invested : NaN;
export const wacc = (eq: number, costEq: number, dbt: number, costDbt: number, tax: number) =>
  eq * costEq + dbt * costDbt * (1 - tax);
export const capm = (rf: number, beta: number, mp: number, size = 0, country = 0) =>
  rf + beta * mp + size + country;

// ─── VC method ──────────────────────────────────────────────────────
export function vcMethodPreMoney(exitValue: number, targetIRR: number, years: number, dilution = 0.2): number {
  const pv = exitValue / Math.pow(1 + targetIRR, years);
  return pv * (1 - dilution);
}

// ─── Portfolio / fund / signal stats ───────────────────────────────
export interface WaterfallResult {
  grossMOIC: number; netMOIC: number; grossIRRApprox: number;
  totalMgmtFees: number; gpCarry: number; lpDistributions: number; dpi: number;
}
export function fundWaterfall(committed: number, invested: number, totalDistributed: number,
  mgmtFeePct = 0.02, carryPct = 0.2, preferredReturn = 0.08, fundLife = 10): WaterfallResult {
  const totalMgmtFees = committed * mgmtFeePct * fundLife;
  const netInvested = invested - totalMgmtFees;
  const hurdle = netInvested * (Math.pow(1 + preferredReturn, fundLife) - 1);
  const profit = Math.max(0, totalDistributed - netInvested);
  const gpCarry = Math.max(0, (profit - hurdle) * carryPct);
  const lpNet = totalDistributed - gpCarry;
  return {
    grossMOIC: totalDistributed / invested,
    netMOIC: lpNet / committed,
    grossIRRApprox: Math.pow(totalDistributed / invested, 1 / fundLife) - 1,
    totalMgmtFees, gpCarry, lpDistributions: lpNet, dpi: lpNet / committed,
  };
}
export function powerLawPortfolio(n: number, winnerPct = 0.1, winnerMultiple = 20, loserReturn = -1) {
  const nW = Math.max(1, Math.round(n * winnerPct));
  const nL = n - nW;
  const total = nW * winnerMultiple + nL * loserReturn;
  return { nCompanies: n, nWinners: nW, nLosers: nL,
    totalPortfolioMOIC: total / n,
    winnerContributionPct: total !== 0 ? (nW * winnerMultiple) / total : 0,
    lossRatio: nL / n };
}
export function hhi(shares: number[]) {
  const v = shares.reduce((a, s) => a + s * s, 0) * 10000;
  return { hhi: v, classification: v > 2500 ? "Highly Concentrated" : v > 1500 ? "Moderately Concentrated" : "Competitive" };
}

// ─── Statistical / signal processing ───────────────────────────────
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[], ddof = 1) => {
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - ddof);
  return Math.sqrt(v);
};

export const zScore = (value: number, m: number, s: number) => (value - m) / s;
export const sharpeRatio = (returns: number[], rf = 0) => {
  const ex = returns.map(r => r - rf);
  return mean(ex) / std(ex);
};
export function sortinoRatio(returns: number[], rf = 0, target = 0) {
  const ex = returns.map(r => r - rf);
  const dn = returns.map(r => Math.min(0, r - target) ** 2);
  const dd = Math.sqrt(mean(dn));
  return dd > 0 ? mean(ex) / dd : Infinity;
}
export function maxDrawdown(equity: number[]): number {
  let peak = equity[0], maxDD = 0;
  for (const v of equity) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, (peak - v) / peak); }
  return maxDD;
}
export function kellyCriterion(winProb: number, winLossRatio: number): number {
  const q = 1 - winProb;
  return (winProb * winLossRatio - q) / winLossRatio;
}
export const informationRatio = (active: number[]) => mean(active) / std(active);

/**
 * ICC-adjusted Sample Size (Design Effect)
 * neffective = n / (1 + (m - 1) * rho)
 * m: cluster size, rho: intraclass correlation
 */
export const calcEffectiveN = (n: number, m: number, rho: number) => {
  const deff = 1 + (m - 1) * rho;
  return n / deff;
};

/**
 * Required nominal N to reach target power given cluster design.
 * nNominal = nTarget * (1 + (m - 1) * rho)
 */
export const calcRequiredNominalN = (nTarget: number, m: number, rho: number) => {
  return nTarget * (1 + (m - 1) * rho);
};

// ─── Inverse normal CDF (Acklam's algorithm) — needed for power calcs ───
function invNorm(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= phigh) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

/**
 * cRCT power calculation: required clusters PER ARM to detect a mean
 * difference with given power, accounting for ICC design effect AND attrition.
 *
 * Two-arm parallel cluster-randomized trial, continuous outcome.
 *  delta: target mean difference
 *  sd: pooled standard deviation
 *  alpha: two-sided significance (default 0.05)
 *  power: target power (default 0.80)
 *  icc: intraclass correlation
 *  clusterSize: AVERAGE evaluable participants per cluster at endpoint
 *  attrition: fraction lost to follow-up (default 0)
 */
export function calcClusterRCTPower(opts: {
  delta: number; sd: number; alpha?: number; power?: number;
  icc: number; clusterSize: number; attrition?: number;
}): {
  individualsPerArm: number;
  designEffect: number;
  evaluablePerArm: number;
  clustersPerArmIdeal: number;
  recruitPerCluster: number;
  clustersPerArmWithAttrition: number;
  totalClustersWithAttrition: number;
  totalRecruit: number;
} {
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.80;
  const attrition = Math.max(0, Math.min(0.95, opts.attrition ?? 0));
  const m = Math.max(1, opts.clusterSize);
  const zAlpha = invNorm(1 - alpha / 2);
  const zBeta = invNorm(power);
  const effectSize = Math.abs(opts.delta) / opts.sd;
  // Individual-level N per arm for a two-sample test
  const nIndiv = Math.ceil((2 * Math.pow(zAlpha + zBeta, 2)) / Math.pow(effectSize, 2));
  // Design effect inflation
  const deff = 1 + (m - 1) * opts.icc;
  const evaluablePerArm = Math.ceil(nIndiv * deff);
  // Ideal clusters per arm (no attrition)
  const clustersIdeal = Math.ceil(evaluablePerArm / m);
  // Attrition adjustment: recruit more per cluster so evaluable = target
  const recruitPerCluster = attrition > 0 ? Math.ceil(m / (1 - attrition)) : m;
  const clustersWithAttrition = Math.ceil(evaluablePerArm / m);
  const totalRecruit = clustersWithAttrition * recruitPerCluster * 2;
  return {
    individualsPerArm: nIndiv,
    designEffect: Math.round(deff * 1000) / 1000,
    evaluablePerArm,
    clustersPerArmIdeal: clustersIdeal,
    recruitPerCluster,
    clustersPerArmWithAttrition: clustersWithAttrition,
    totalClustersWithAttrition: clustersWithAttrition * 2,
    totalRecruit,
  };
}

/**
 * Attrition adequacy check: given a recruitment plan, does it survive attrition?
 * Returns the post-attrition evaluable count and whether it clears the threshold.
 */
export function calcAttritionAdequacy(opts: {
  clustersPerArm: number; recruitPerCluster: number; attrition: number; requiredEvaluablePerArm: number;
}): { recruitedPerArm: number; evaluablePerArm: number; adequate: boolean; deficit: number } {
  const recruited = opts.clustersPerArm * opts.recruitPerCluster;
  const evaluable = Math.floor(recruited * (1 - opts.attrition));
  const deficit = opts.requiredEvaluablePerArm - evaluable;
  return { recruitedPerArm: recruited, evaluablePerArm: evaluable, adequate: deficit <= 0, deficit: Math.max(0, deficit) };
}

// ─── Display helper ─────────────────────────────────────────────────
export interface QuantResult { label: string; value: number; unit?: string; formula: string; }

export function fmtPct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
export function fmtMoney(x: number): string {
  if (!isFinite(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(x / 1e3).toFixed(1)}K`;
  return `$${x.toFixed(0)}`;
}
