// ─── Deterministic Compute Sandbox ──────────────────────────────────────────
// A whitelisted function registry. The reasoning pipeline emits structured
// calculation requests (function id + numeric args); the sandbox executes the
// REAL pure-TypeScript quant functions and returns verified results.
//
// Safety properties (this is a reality-based engineering system):
//   • No eval / no Function(): only pre-registered pure functions run.
//   • Pure & side-effect-free: same inputs → same outputs, always.
//   • Bounded: arg arrays are capped; non-finite results are flagged, not hidden.
//   • Auditable: every call records {id, args, result, ok, error, ms}.
//
// The AI never computes numbers itself — it requests them and synthesizes the
// returned, verified values. This eliminates numeric hallucination.

import * as Q from "./quant-engine";

export interface ComputeSpec {
  id: string;             // registry key, e.g. "dcf_npv"
  label: string;          // human label
  group: string;          // grouping for UI/routing
  params: { name: string; kind: "number" | "number[]"; default: number | number[] }[];
  formula: string;        // documentation
  run: (args: Record<string, number | number[]>) => Record<string, number> | number;
}

const n = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);
const arr = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter((x) => isFinite(x)).slice(0, 512) : [];

// ─── The registry: every entry is a real, deterministic function ────────────
export const COMPUTE_REGISTRY: ComputeSpec[] = [
  // Unit economics
  { id: "ltv", label: "Lifetime Value", group: "Unit economics", formula: "(ARPU·GM)/churn",
    params: [{ name: "arpuMonthly", kind: "number", default: 45 }, { name: "grossMargin", kind: "number", default: 0.78 }, { name: "churnMonthly", kind: "number", default: 0.02 }],
    run: (a) => ({ ltv: Q.ltv(n(a.arpuMonthly), n(a.grossMargin), n(a.churnMonthly)) }) },
  { id: "cac", label: "Customer Acquisition Cost", group: "Unit economics", formula: "S&M / new customers",
    params: [{ name: "salesMarketing", kind: "number", default: 1_200_000 }, { name: "newCustomers", kind: "number", default: 400 }],
    run: (a) => ({ cac: Q.cac(n(a.salesMarketing), n(a.newCustomers)) }) },
  { id: "ltv_cac", label: "LTV : CAC ratio", group: "Unit economics", formula: "LTV / CAC (target > 3)",
    params: [{ name: "ltv", kind: "number", default: 1755 }, { name: "cac", kind: "number", default: 3000 }],
    run: (a) => ({ ratio: Q.ltvCacRatio(n(a.ltv), n(a.cac)) }) },
  { id: "nrr", label: "Net Revenue Retention", group: "Unit economics", formula: "(start+exp−contr−churn)/start",
    params: [{ name: "start", kind: "number", default: 1_000_000 }, { name: "expansion", kind: "number", default: 200_000 }, { name: "contraction", kind: "number", default: 50_000 }, { name: "churn", kind: "number", default: 80_000 }],
    run: (a) => ({ nrr: Q.nrr(n(a.start), n(a.expansion), n(a.contraction), n(a.churn)) }) },
  { id: "burn_multiple", label: "Burn Multiple", group: "Unit economics", formula: "net burn / net new ARR",
    params: [{ name: "netBurn", kind: "number", default: 4_000_000 }, { name: "netNewARR", kind: "number", default: 3_000_000 }],
    run: (a) => ({ burnMultiple: Q.burnMultiple(n(a.netBurn), n(a.netNewARR)) }) },
  { id: "rule_of_40", label: "Rule of 40", group: "Unit economics", formula: "growth% + margin%",
    params: [{ name: "growthPct", kind: "number", default: 60 }, { name: "marginPct", kind: "number", default: -15 }],
    run: (a) => ({ ruleOf40: Q.ruleOf40(n(a.growthPct), n(a.marginPct)) }) },
  { id: "months_runway", label: "Months of Runway", group: "Unit economics", formula: "cash / monthly burn",
    params: [{ name: "cash", kind: "number", default: 24_000_000 }, { name: "monthlyBurn", kind: "number", default: 1_500_000 }],
    run: (a) => ({ months: Q.monthsRunway(n(a.cash), n(a.monthlyBurn)) }) },

  // Valuation
  { id: "dcf_npv", label: "DCF / Enterprise Value", group: "Valuation", formula: "Σ CF/(1+r)^t + terminal",
    params: [{ name: "cashFlows", kind: "number[]", default: [10, 12, 15, 18, 22] }, { name: "discountRate", kind: "number", default: 0.12 }, { name: "terminalGrowth", kind: "number", default: 0.02 }],
    run: (a) => { const r = Q.dcfNpv(arr(a.cashFlows), n(a.discountRate, 0.12), n(a.terminalGrowth, 0.02)); return { enterpriseValue: r.enterpriseValue, pvCashFlows: r.pvCashFlows, pvTerminal: r.pvTerminal, terminalPctOfEV: r.terminalPctOfEV }; } },
  { id: "irr", label: "Internal Rate of Return", group: "Valuation", formula: "rate s.t. NPV = 0",
    params: [{ name: "cashFlows", kind: "number[]", default: [-100, 20, 30, 40, 60] }],
    run: (a) => ({ irr: Q.irr(arr(a.cashFlows)) }) },
  { id: "moic", label: "MOIC", group: "Valuation", formula: "exit / invested",
    params: [{ name: "exit", kind: "number", default: 450 }, { name: "invested", kind: "number", default: 100 }],
    run: (a) => ({ moic: Q.moic(n(a.exit), n(a.invested)) }) },
  { id: "wacc", label: "WACC", group: "Valuation", formula: "wE·rE + wD·rD·(1−t)",
    params: [{ name: "equityWeight", kind: "number", default: 0.7 }, { name: "costEquity", kind: "number", default: 0.12 }, { name: "debtWeight", kind: "number", default: 0.3 }, { name: "costDebt", kind: "number", default: 0.06 }, { name: "taxRate", kind: "number", default: 0.21 }],
    run: (a) => ({ wacc: Q.wacc(n(a.equityWeight), n(a.costEquity), n(a.debtWeight), n(a.costDebt), n(a.taxRate)) }) },
  { id: "capm", label: "CAPM cost of equity", group: "Valuation", formula: "rf + β·mrp",
    params: [{ name: "riskFree", kind: "number", default: 0.043 }, { name: "beta", kind: "number", default: 1.2 }, { name: "marketPremium", kind: "number", default: 0.055 }],
    run: (a) => ({ costEquity: Q.capm(n(a.riskFree), n(a.beta), n(a.marketPremium)) }) },
  { id: "vc_premoney", label: "VC-method pre-money", group: "Valuation", formula: "PV(exit)·(1−dilution)",
    params: [{ name: "exitValue", kind: "number", default: 1000 }, { name: "targetIRR", kind: "number", default: 0.35 }, { name: "years", kind: "number", default: 5 }, { name: "dilution", kind: "number", default: 0.2 }],
    run: (a) => ({ preMoney: Q.vcMethodPreMoney(n(a.exitValue), n(a.targetIRR), n(a.years), n(a.dilution)) }) },

  // Portfolio / fund
  { id: "fund_waterfall", label: "Fund 2/20 waterfall", group: "Portfolio", formula: "carry over preferred hurdle",
    params: [{ name: "committed", kind: "number", default: 100 }, { name: "invested", kind: "number", default: 90 }, { name: "distributed", kind: "number", default: 250 }],
    run: (a) => { const r = Q.fundWaterfall(n(a.committed), n(a.invested), n(a.distributed)); return { grossMOIC: r.grossMOIC, netMOIC: r.netMOIC, dpi: r.dpi, gpCarry: r.gpCarry }; } },
  { id: "power_law", label: "Power-law portfolio", group: "Portfolio", formula: "winners·mult + losers·(−1)",
    params: [{ name: "companies", kind: "number", default: 30 }, { name: "winnerPct", kind: "number", default: 0.1 }, { name: "winnerMultiple", kind: "number", default: 20 }],
    run: (a) => { const r = Q.powerLawPortfolio(n(a.companies, 30), n(a.winnerPct, 0.1), n(a.winnerMultiple, 20)); return { portfolioMOIC: r.totalPortfolioMOIC, winnerContributionPct: r.winnerContributionPct, lossRatio: r.lossRatio }; } },
  { id: "hhi", label: "HHI concentration", group: "Portfolio", formula: "Σ share² × 10000",
    params: [{ name: "shares", kind: "number[]", default: [0.4, 0.3, 0.2, 0.1] }],
    run: (a) => { const r = Q.hhi(arr(a.shares)); return { hhi: r.hhi }; } },

  // Signal / risk statistics
  { id: "sharpe", label: "Sharpe ratio", group: "Statistics", formula: "mean(excess)/σ",
    params: [{ name: "returns", kind: "number[]", default: [0.02, -0.01, 0.03, 0.015, -0.005] }, { name: "riskFree", kind: "number", default: 0 }],
    run: (a) => ({ sharpe: Q.sharpeRatio(arr(a.returns), n(a.riskFree)) }) },
  { id: "sortino", label: "Sortino ratio", group: "Statistics", formula: "mean(excess)/downsideDev",
    params: [{ name: "returns", kind: "number[]", default: [0.02, -0.01, 0.03, 0.015, -0.005] }, { name: "riskFree", kind: "number", default: 0 }],
    run: (a) => ({ sortino: Q.sortinoRatio(arr(a.returns), n(a.riskFree)) }) },
  { id: "max_drawdown", label: "Max drawdown", group: "Statistics", formula: "max peak-to-trough decline",
    params: [{ name: "equityCurve", kind: "number[]", default: [100, 110, 105, 120, 90, 130] }],
    run: (a) => ({ maxDrawdown: Q.maxDrawdown(arr(a.equityCurve)) }) },
  { id: "kelly", label: "Kelly criterion", group: "Statistics", formula: "(p·b − q)/b",
    params: [{ name: "winProb", kind: "number", default: 0.55 }, { name: "winLossRatio", kind: "number", default: 1.8 }],
    run: (a) => ({ kellyFraction: Q.kellyCriterion(n(a.winProb), n(a.winLossRatio)) }) },
  { id: "zscore", label: "Z-score", group: "Statistics", formula: "(x − μ)/σ",
    params: [{ name: "value", kind: "number", default: 211 }, { name: "mean", kind: "number", default: 180 }, { name: "std", kind: "number", default: 25 }],
    run: (a) => ({ z: Q.zScore(n(a.value), n(a.mean), n(a.std)) }) },
  { id: "effective_n", label: "Cluster Effective N (ICC Fix)", group: "Statistics", formula: "n / (1 + (m-1)·ρ)",
    params: [{ name: "nominalN", kind: "number", default: 400 }, { name: "clusterSize", kind: "number", default: 20 }, { name: "icc", kind: "number", default: 0.05 }],
    run: (a) => ({ effectiveN: Q.calcEffectiveN(n(a.nominalN), n(a.clusterSize), n(a.icc)) }) },
  { id: "required_n", label: "Required Nominal N (Cluster)", group: "Statistics", formula: "nTarget · (1 + (m-1)·ρ)",
    params: [{ name: "targetN", kind: "number", default: 100 }, { name: "clusterSize", kind: "number", default: 20 }, { name: "icc", kind: "number", default: 0.05 }],
    run: (a) => ({ requiredNominalN: Q.calcRequiredNominalN(n(a.targetN), n(a.clusterSize), n(a.icc)) }) },
  { id: "crct_power", label: "cRCT Power → Clusters Per Arm", group: "Statistics", formula: "two-arm cluster RCT sample size w/ ICC design effect + attrition",
    params: [
      { name: "delta", kind: "number", default: 0.5 }, { name: "sd", kind: "number", default: 1.5 },
      { name: "alpha", kind: "number", default: 0.05 }, { name: "power", kind: "number", default: 0.80 },
      { name: "icc", kind: "number", default: 0.02 }, { name: "clusterSize", kind: "number", default: 14 },
      { name: "attrition", kind: "number", default: 0.20 },
    ],
    run: (a) => {
      const r = Q.calcClusterRCTPower({ delta: n(a.delta, 0.5), sd: n(a.sd, 1.5), alpha: n(a.alpha, 0.05), power: n(a.power, 0.80), icc: n(a.icc, 0.02), clusterSize: n(a.clusterSize, 14), attrition: n(a.attrition, 0) });
      return { individualsPerArm: r.individualsPerArm, designEffect: r.designEffect, evaluablePerArm: r.evaluablePerArm, clustersPerArmIdeal: r.clustersPerArmIdeal, recruitPerCluster: r.recruitPerCluster, clustersPerArmWithAttrition: r.clustersPerArmWithAttrition, totalClustersWithAttrition: r.totalClustersWithAttrition, totalRecruit: r.totalRecruit };
    } },
  { id: "attrition_check", label: "Attrition Adequacy Check", group: "Statistics", formula: "evaluable = recruited · (1−attrition) ≥ required?",
    params: [
      { name: "clustersPerArm", kind: "number", default: 15 }, { name: "recruitPerCluster", kind: "number", default: 14 },
      { name: "attrition", kind: "number", default: 0.20 }, { name: "requiredEvaluablePerArm", kind: "number", default: 178 },
    ],
    run: (a) => {
      const r = Q.calcAttritionAdequacy({ clustersPerArm: n(a.clustersPerArm, 15), recruitPerCluster: n(a.recruitPerCluster, 14), attrition: n(a.attrition, 0.20), requiredEvaluablePerArm: n(a.requiredEvaluablePerArm, 178) });
      return { recruitedPerArm: r.recruitedPerArm, evaluablePerArm: r.evaluablePerArm, adequate: r.adequate ? 1 : 0, deficit: r.deficit };
    } },
];

const BY_ID = new Map(COMPUTE_REGISTRY.map((s) => [s.id, s]));

export interface ComputeCall {
  id: string;
  args: Record<string, number | number[]>;
}

export interface ComputeRecord {
  id: string;
  label: string;
  group: string;
  formula: string;
  args: Record<string, number | number[]>;
  result: Record<string, number> | null;
  ok: boolean;
  error?: string;
  ms: number;
}

/** Execute a single whitelisted call. Never throws. */
export function runComputeCall(call: ComputeCall): ComputeRecord {
  const spec = BY_ID.get(call.id);
  const t0 = performance.now();
  if (!spec) {
    return { id: call.id, label: call.id, group: "?", formula: "", args: call.args, result: null, ok: false, error: `unknown function "${call.id}"`, ms: 0 };
  }
  try {
    const raw = spec.run(call.args || {});
    const obj = typeof raw === "number" ? { value: raw } : raw;
    // Flag non-finite outputs rather than hiding them.
    const cleaned: Record<string, number> = {};
    let ok = true;
    for (const [k, v] of Object.entries(obj)) {
      cleaned[k] = v;
      if (!isFinite(v)) ok = false;
    }
    return { id: spec.id, label: spec.label, group: spec.group, formula: spec.formula, args: call.args, result: cleaned, ok, error: ok ? undefined : "non-finite result (check inputs)", ms: performance.now() - t0 };
  } catch (e) {
    return { id: spec.id, label: spec.label, group: spec.group, formula: spec.formula, args: call.args, result: null, ok: false, error: (e as Error).message, ms: performance.now() - t0 };
  }
}

/** Execute a batch of calls deterministically, in order. */
export function runComputeBatch(calls: ComputeCall[]): ComputeRecord[] {
  return (calls || []).slice(0, 24).map(runComputeCall);
}

/** Schema fragment for the Logic Engine prompt: lists callable functions. */
export function registryPromptCatalog(): string {
  const groups = new Map<string, ComputeSpec[]>();
  for (const s of COMPUTE_REGISTRY) {
    const g = groups.get(s.group) ?? [];
    g.push(s);
    groups.set(s.group, g);
  }
  const lines: string[] = [];
  for (const [group, specs] of groups) {
    lines.push(`  ${group}:`);
    for (const s of specs) {
      const params = s.params.map((p) => `${p.name}:${p.kind}`).join(", ");
      lines.push(`    - ${s.id}(${params})  // ${s.formula}`);
    }
  }
  return lines.join("\n");
}

/** Render finished compute records as a compact, model-readable fact block. */
export function computeFactsBlock(records: ComputeRecord[]): string {
  if (!records.length) return "";
  const lines = records.map((r) => {
    if (!r.ok || !r.result) return `  • ${r.label}: COMPUTE FAILED (${r.error ?? "unknown"}) — do NOT cite a number for this.`;
    const out = Object.entries(r.result).map(([k, v]) => `${k}=${fmt(v)}`).join(", ");
    return `  • ${r.label} [${r.formula}] → ${out}  (deterministic, verified)`;
  });
  return `VERIFIED COMPUTED VALUES (use these exact numbers; do not invent or alter them):\n${lines.join("\n")}`;
}

function fmt(v: number): string {
  if (!isFinite(v)) return "NaN";
  const a = Math.abs(v);
  if (a !== 0 && a < 0.01) return v.toExponential(2);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return v.toFixed(Math.abs(v) < 10 ? 3 : 1);
}
