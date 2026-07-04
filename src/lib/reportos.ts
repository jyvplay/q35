/**
 * ReportOS v3 — calculation engines + quality gates.
 * Real, runnable math (not prose). Every engine returns numeric outputs
 * plus the formula used, so reports are reproducible and auditable.
 */

export interface CalcResult {
  label: string;
  value: number;
  unit?: string;
  formula: string;
  inputs: Record<string, number>;
}

// ── 8.1 Market sizing ───────────────────────────────────────────────
export function calcMarketSizing(i: { customers: number; spendPerCustomer: number; servedShare: number; captureRate: number; }): CalcResult[] {
  const tam = i.customers * i.spendPerCustomer;
  const sam = tam * i.servedShare;
  const som = sam * i.captureRate;
  return [
    { label: "TAM", value: tam, unit: "$", formula: "customers × spend/customer", inputs: i },
    { label: "SAM", value: sam, unit: "$", formula: "TAM × served share", inputs: i },
    { label: "SOM", value: som, unit: "$", formula: "SAM × capture rate", inputs: i },
  ];
}
export function calcCAGR(begin: number, end: number, years: number): CalcResult {
  const v = years > 0 && begin > 0 ? Math.pow(end / begin, 1 / years) - 1 : 0;
  return { label: "CAGR", value: v, unit: "%", formula: "(end/begin)^(1/years) - 1", inputs: { begin, end, years } };
}

// ── 8.2 Valuation ───────────────────────────────────────────────────
export function calcNPV(cashflows: number[], rate: number, initial = 0): CalcResult {
  const npv = cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t + 1), 0) - initial;
  return { label: "NPV", value: npv, unit: "$", formula: "Σ FCF_t/(1+r)^t − initial", inputs: { rate, initial, periods: cashflows.length } };
}
export function calcIRR(cashflows: number[], initial: number): CalcResult {
  // bisection on rate in [-0.9, 1.0]
  const npvAt = (r: number) => cashflows.reduce((a, cf, t) => a + cf / Math.pow(1 + r, t + 1), 0) - initial;
  let lo = -0.9, hi = 1.0, mid = 0;
  for (let k = 0; k < 100; k++) {
    mid = (lo + hi) / 2;
    const v = npvAt(mid);
    if (Math.abs(v) < 1e-6) break;
    if (v > 0) lo = mid; else hi = mid;
  }
  return { label: "IRR", value: mid, unit: "%", formula: "rate where NPV = 0 (bisection)", inputs: { initial, periods: cashflows.length } };
}
export function calcMOIC(exitEquity: number, investedEquity: number): CalcResult {
  return { label: "MOIC", value: investedEquity > 0 ? exitEquity / investedEquity : 0, unit: "x", formula: "exit equity / invested equity", inputs: { exitEquity, investedEquity } };
}
export function calcAdjEBITDA(i: { reportedEBITDA: number; nonRecurringExp: number; nonRecurringInc: number; runRateAdj: number; }): CalcResult {
  const v = i.reportedEBITDA + i.nonRecurringExp - i.nonRecurringInc + i.runRateAdj;
  return { label: "Adjusted EBITDA", value: v, unit: "$", formula: "reported + non-recurring exp − non-recurring inc + run-rate", inputs: i };
}

// ── 8.3 Scenario / sensitivity ──────────────────────────────────────
export function calcExpectedValue(scenarios: { p: number; value: number }[]): CalcResult {
  const ev = scenarios.reduce((a, s) => a + s.p * s.value, 0);
  return { label: "Expected Value", value: ev, unit: "$", formula: "Σ p × value", inputs: { scenarios: scenarios.length } };
}

// ── 8.4 Risk scoring ────────────────────────────────────────────────
export function calcRisk(probability: number, impact: number): CalcResult {
  return { label: "Risk Score", value: probability * impact, formula: "P × I", inputs: { probability, impact } };
}
export function calcResidualRisk(inherent: number, controlEffectiveness: number): CalcResult {
  return { label: "Residual Risk", value: inherent * (1 - controlEffectiveness), formula: "inherent × (1 − control effectiveness)", inputs: { inherent, controlEffectiveness } };
}
export function calcRPN(severity: number, occurrence: number, detectability: number): CalcResult {
  return { label: "RPN", value: severity * occurrence * detectability, formula: "severity × occurrence × detectability", inputs: { severity, occurrence, detectability } };
}

// ── 8.5 Evidence confidence ─────────────────────────────────────────
export function calcConfidence(evidenceStrength: number, methodValidity: number, assumptionStability: number): CalcResult {
  // claim confidence cannot exceed weakest link
  const v = Math.min(evidenceStrength, methodValidity, assumptionStability);
  return { label: "Claim Confidence", value: v, unit: "/100", formula: "min(evidence, method, assumption)", inputs: { evidenceStrength, methodValidity, assumptionStability } };
}

// ── 8.6 Research statistics ─────────────────────────────────────────
export function calcEffectSize(meanDiff: number, pooledSD: number): CalcResult {
  return { label: "Effect Size (d)", value: pooledSD > 0 ? meanDiff / pooledSD : 0, formula: "mean diff / pooled SD", inputs: { meanDiff, pooledSD } };
}
export function calcRelativeRisk(treatmentRisk: number, controlRisk: number): CalcResult {
  return { label: "Relative Risk", value: controlRisk > 0 ? treatmentRisk / controlRisk : 0, formula: "treatment risk / control risk", inputs: { treatmentRisk, controlRisk } };
}

// ── 8.7 Policy cost-benefit ─────────────────────────────────────────
export function calcCostBenefit(pvBenefits: number, pvCosts: number): CalcResult[] {
  return [
    { label: "Benefit-Cost Ratio", value: pvCosts > 0 ? pvBenefits / pvCosts : 0, formula: "PV(benefits) / PV(costs)", inputs: { pvBenefits, pvCosts } },
    { label: "Net Social Benefit", value: pvBenefits - pvCosts, unit: "$", formula: "PV(benefits) − PV(costs)", inputs: { pvBenefits, pvCosts } },
  ];
}

// ── 8.8 ESG / climate ───────────────────────────────────────────────
export function calcGHG(scope1: number, scope2: number, scope3: number): CalcResult {
  return { label: "Total GHG", value: scope1 + scope2 + scope3, unit: "tCO₂e", formula: "Scope 1 + 2 + 3", inputs: { scope1, scope2, scope3 } };
}
export function calcCarbonIntensity(tco2e: number, revenue: number): CalcResult {
  return { label: "Carbon Intensity", value: revenue > 0 ? tco2e / revenue : 0, unit: "tCO₂e/$", formula: "tCO₂e / revenue", inputs: { tco2e, revenue } };
}

// ── 8.9 Digital / AI readiness ──────────────────────────────────────
export function calcAIReadiness(i: { dataQuality: number; infra: number; talent: number; governance: number; process: number; change: number; }): CalcResult {
  const v = 0.25 * i.dataQuality + 0.20 * i.infra + 0.20 * i.talent + 0.15 * i.governance + 0.10 * i.process + 0.10 * i.change;
  return { label: "AI Readiness", value: v, unit: "/100", formula: "0.25·data + 0.20·infra + 0.20·talent + 0.15·gov + 0.10·process + 0.10·change", inputs: i };
}

// ── 8.11 Pricing ────────────────────────────────────────────────────
export function calcPocketPrice(list: number, discounts: number, rebates: number, promos: number, leakage: number): CalcResult {
  return { label: "Pocket Price", value: list - discounts - rebates - promos - leakage, unit: "$", formula: "list − discounts − rebates − promos − leakage", inputs: { list, discounts, rebates, promos, leakage } };
}

// ── 8.12 Energy LCOE ────────────────────────────────────────────────
export function calcLCOE(pvLifecycleCosts: number, pvEnergyMWh: number): CalcResult {
  return { label: "LCOE", value: pvEnergyMWh > 0 ? pvLifecycleCosts / pvEnergyMWh : 0, unit: "$/MWh", formula: "PV(lifecycle costs) / PV(energy)", inputs: { pvLifecycleCosts, pvEnergyMWh } };
}

// ── Quality gates (Section 9) ───────────────────────────────────────
export interface QuantResult { label: string; value: number; unit?: string; formula: string; inputs: Record<string, number>; }
export interface QualityGate { id: string; name: string; check: string; }
export const QUALITY_GATES: QualityGate[] = [
  { id: "G1", name: "Objective fit", check: "Every section supports the stated decision/question/objective" },
  { id: "G2", name: "Evidence binding", check: "Every factual claim links to source, data, calculation, or explicit assumption" },
  { id: "G3", name: "Status labeling", check: "Facts ≠ assumptions ≠ forecasts ≠ recommendations" },
  { id: "G4", name: "MECE structure", check: "Categories non-overlapping, no gaps, same logical level" },
  { id: "G5", name: "Calculation reproducibility", check: "Numbers show formula, inputs, assumptions, sensitivity" },
  { id: "G6", name: "Falsification / red-team", check: "What would make the recommendation wrong; what data reverses it" },
  { id: "G7", name: "Compliance", check: "Satisfies applicable standard (NIH/NSF/GAO/PRISMA/SEC/CSRD/NIST AI RMF)" },
  { id: "G8", name: "Audience density", check: "Exec decides from summary; analyst reproduces from appendix" },
];

// ── Archetype routing (Section 4 + Step 2) ──────────────────────────
export type ArchetypeId =
  | "decision-strategy" | "investment-financial" | "implementation-tech"
  | "audit-assurance" | "scientific-academic" | "policy-public" | "market-commercial";

export interface Archetype { id: ArchetypeId; name: string; covers: string; sections: string[]; }

export const ARCHETYPES: Archetype[] = [
  { id: "decision-strategy", name: "Decision / Strategy", covers: "McKinsey, BCG, Bain, Strategy&, EY-Parthenon strategy, Roland Berger, Innosight, market entry, growth strategy",
    sections: ["Decision Summary", "Situation / Context", "Core Question", "Evidence & Diagnosis", "Strategic Options", "Recommendation", "Business Case", "Implementation Roadmap", "Risk & Falsification", "Appendix"] },
  { id: "investment-financial", name: "Investment / Transaction / Financial", covers: "Bain PE diligence, EY-Parthenon CDD, Deloitte/PwC transaction services, QofE, AlixPartners restructuring, equity research, IC memos",
    sections: ["Investment / Transaction Thesis", "Target / Asset Overview", "Market & Competitive Assessment", "Commercial Diligence", "Financial Diligence", "Value Creation Plan", "Valuation", "Risks & Deal Protections", "Decision Package", "Appendix"] },
  { id: "implementation-tech", name: "Implementation / Technology / Transformation", covers: "Accenture, Deloitte Digital, IBM, Capgemini, digital/AI transformation, cloud migration, ERP, cyber modernization",
    sections: ["Transformation Summary", "Current-State Assessment", "Target-State Blueprint", "Use Case / Initiative Portfolio", "Operating Model", "Roadmap", "Business Case", "Risk, Security & Responsible AI", "Adoption & Change", "Appendix"] },
  { id: "audit-assurance", name: "Audit / Assurance / Risk / Compliance", covers: "KPMG risk advisory, Big 4 audit, internal audit, GAO/IG audit, cyber incident, FTI forensic, ERM",
    sections: ["Executive Assurance Summary", "Scope & Criteria", "Methodology", "Finding Register", "Risk Assessment", "Control / Compliance Matrix", "Recommendations & Remediation", "Governance & Tracking", "Appendix"] },
  { id: "scientific-academic", name: "Scientific / Academic / Evidence-Synthesis", covers: "IMRAD article, NIH R01/RPPR, NSF proposal, dissertation, PRISMA review, RAND research, policy research",
    sections: ["Research Summary", "Background & Gap", "Objectives / Aims", "Methods", "Results / Preliminary Data", "Interpretation / Discussion", "Impact / Broader Significance", "Compliance & Reporting", "References", "Supplementary"] },
  { id: "policy-public", name: "Policy / Public Sector / Multilateral", covers: "GAO program evaluation, CRS, OMB memo, World Bank, IMF, OECD, UNDP, EC impact assessment, think tanks",
    sections: ["Policy Summary", "Mandate / Context", "Diagnostic", "Evidence & Comparative Analysis", "Policy Options", "Impact Analysis", "Preferred Option / Recommendations", "Implementation & Governance", "Annexes"] },
  { id: "market-commercial", name: "Market / Sector / Commercial Intelligence", covers: "Market entry, industry outlook, ESG strategy, healthcare ops, real estate, pricing strategy, HR benchmarking, energy/climate",
    sections: ["Market / Sector Summary", "Market Definition", "Market Sizing & Growth", "Demand & Customer Analysis", "Competitive Landscape", "Economics", "Trends & Disruption", "Strategic Implications", "Appendix"] },
];

const ARCH_ROUTES: { re: RegExp; id: ArchetypeId }[] = [
  { re: /\b(invest|acquir|due diligence|valuation|ebitda|m&a|buyout|equity research|restructur|10-?k)\b/i, id: "investment-financial" },
  { re: /\b(audit|assurance|compliance|controls|finding|forensic|incident|erm|gagas|yellow book)\b/i, id: "audit-assurance" },
  { re: /\b(transform|modernize|architecture|migration|cloud|erp|implementation|devops|mlops)\b/i, id: "implementation-tech" },
  { re: /\b(grant|hypothesis|study|trial|systematic review|prisma|nih|nsf|imrad|dissertation|meta-analysis)\b/i, id: "scientific-academic" },
  { re: /\b(policy|public sector|world bank|imf|oecd|undp|legislation|regulation impact|cost-benefit|program evaluation)\b/i, id: "policy-public" },
  { re: /\b(market size|tam|sam|som|industry outlook|pricing|esg|sustainability|lcoe|sector|benchmark)\b/i, id: "market-commercial" },
  { re: /\b(strateg|recommend|should we|grow|options|board|decision)\b/i, id: "decision-strategy" },
];

export function routeArchetype(query: string): ArchetypeId {
  for (const r of ARCH_ROUTES) if (r.re.test(query)) return r.id;
  return "decision-strategy";
}

export function findArchetype(id: ArchetypeId): Archetype {
  return ARCHETYPES.find(a => a.id === id) ?? ARCHETYPES[0];
}
