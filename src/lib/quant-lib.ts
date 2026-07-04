// MODULE A.2 — VC / Medallion-grade Quantitative Engine
// All formulas below are deterministic functions, taking inputs and returning outputs.
// These are wired into the ReportOS v3 system for high-rigor financial reporting.

import { QuantResult } from "./reportos";

// ── 8.1.1 Unit Economics ──────────────────────────────────────────────

export function calcCAC(smSpend: number, newCustomers: number): QuantResult {
  const val = newCustomers > 0 ? smSpend / newCustomers : 0;
  return { label: "CAC", value: val, unit: "$", formula: "S&M spend / new customers", inputs: { smSpend, newCustomers } };
}

export function calcLTV(arpuMonthly: number, grossMarginPct: number, churnMonthly: number): QuantResult {
  const val = churnMonthly > 0 ? (arpuMonthly * grossMarginPct) / churnMonthly : 0;
  return { label: "LTV", value: val, unit: "$", formula: "(ARPU × GM%) / churn", inputs: { arpuMonthly, grossMarginPct, churnMonthly } };
}

export function calcNRR(beginningRev: number, expansionRev: number, contractionRev: number, churnRev: number): QuantResult {
  const val = beginningRev > 0 ? (beginningRev + expansionRev - contractionRev - churnRev) / beginningRev : 0;
  return { label: "NRR", value: val, unit: "%", formula: "(start + exp - contr - churn) / start", inputs: { beginningRev, expansionRev, contractionRev, churnRev } };
}

export function calcBurnMultiple(netBurn: number, netNewArr: number): QuantResult {
  const val = netNewArr > 0 ? netBurn / netNewArr : 0;
  return { label: "Burn Multiple", value: val, unit: "x", formula: "net burn / net new ARR", inputs: { netBurn, netNewArr } };
}

export function calcMagicNumber(netNewArr: number, priorSMSpend: number): QuantResult {
  const val = priorSMSpend > 0 ? netNewArr / priorSMSpend : 0;
  return { label: "Magic Number", value: val, unit: "x", formula: "net new ARR / prior S&M", inputs: { netNewArr, priorSMSpend } };
}

export function calcRuleOf40(growthPct: number, marginPct: number): QuantResult {
  const val = growthPct + marginPct;
  return { label: "Rule of 40", value: val, unit: "%", formula: "growth% + profit margin%", inputs: { growthPct, marginPct } };
}

export function calcRunway(cash: number, monthlyBurn: number): QuantResult {
  const val = monthlyBurn > 0 ? cash / monthlyBurn : 0;
  return { label: "Runway", value: val, unit: "mo", formula: "cash / monthly burn", inputs: { cash, monthlyBurn } };
}

// ── 8.2.1 Advanced Valuation ─────────────────────────────────────────

export function calcWACC(equityPct: number, costEquity: number, debtPct: number, costDebt: number, taxRate: number): QuantResult {
  const val = (equityPct * costEquity) + (debtPct * costDebt * (1 - taxRate));
  return { label: "WACC", value: val, unit: "%", formula: "(E/V * Re) + (D/V * Rd * (1-T))", inputs: { equityPct, costEquity, debtPct, costDebt, taxRate } };
}

export function calcCAPM(riskFree: number, beta: number, marketPremium: number): QuantResult {
  const val = riskFree + (beta * marketPremium);
  return { label: "Cost of Equity", value: val, unit: "%", formula: "Rf + β(Rm - Rf)", inputs: { riskFree, beta, marketPremium } };
}

export function calcVCMethedPreMoney(exitValue: number, targetIrr: number, yearsToExit: number, dilutionPct: number): QuantResult {
  const pvExit = exitValue / Math.pow(1 + targetIrr, yearsToExit);
  const val = pvExit * (1 - dilutionPct);
  return { label: "VC Pre-money", value: val, unit: "$", formula: "(Exit / (1+IRR)^n) * (1-dilution)", inputs: { exitValue, targetIrr, yearsToExit, dilutionPct } };
}

// ── 8.12.1 Energy & Signals ──────────────────────────────────────────

export function calcLCOE(lifecycleCost: number, totalEnergy: number): QuantResult {
  const val = totalEnergy > 0 ? lifecycleCost / totalEnergy : 0;
  return { label: "LCOE", value: val, unit: "$/MWh", formula: "lifecycle cost / energy generated", inputs: { lifecycleCost, totalEnergy } };
}

export function calcSharpe(returns: number[], riskFree: number): QuantResult {
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  const val = std > 0 ? (avg - riskFree) / std : 0;
  return { label: "Sharpe Ratio", value: val, formula: "(Rp - Rf) / σp", inputs: { returns: returns.length, riskFree } };
}

export function calcKelly(winProb: number, winLossRatio: number): QuantResult {
  const val = winProb - ((1 - winProb) / winLossRatio);
  return { label: "Kelly Criterion", value: val, unit: "%", formula: "p - (q/b)", inputs: { winProb, winLossRatio } };
}
