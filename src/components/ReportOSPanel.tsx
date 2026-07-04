import { useState } from "react";
import {
  calcMarketSizing, calcCAGR, calcNPV, calcIRR, calcMOIC, calcAdjEBITDA,
  calcExpectedValue, calcRisk, calcResidualRisk, calcGHG, calcCarbonIntensity,
  calcAIReadiness, calcLCOE, calcConfidence,
  QUALITY_GATES, routeArchetype, findArchetype,
  type QuantResult as CalcResult,
} from "../lib/reportos";
import * as Quant from "../lib/quant-lib";
import { useAppState } from "../lib/app-state";

type Engine = "market" | "valuation" | "risk" | "esg" | "ai" | "energy" | "confidence" | "unit_economics";

function ResultRow({ r }: { r: CalcResult }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <div>
        <div className="text-xs font-bold text-zinc-900">{r.label}</div>
        <div className="font-mono text-[10px] text-zinc-500">{r.formula}</div>
      </div>
      <div className="font-mono text-sm font-bold text-indigo-700">
        {r.unit === "$" ? "$" : ""}{Number.isFinite(r.value) ? (Math.abs(r.value) >= 1000 ? r.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : (r.unit === "%" ? (r.value * 100).toFixed(1) : r.value.toFixed(2))) : "—"}{r.unit && r.unit !== "$" ? ` ${r.unit}` : ""}
      </div>
    </div>
  );
}

export function ReportOSPanel() {
  const { input } = useAppState();
  const [engine, setEngine] = useState<Engine>("valuation");
  const archId = routeArchetype(input || "strategy");
  const arch = findArchetype(archId);

  // Engine inputs (real, editable)
  const [m, setM] = useState({ customers: 50000, spendPerCustomer: 1200, servedShare: 0.4, captureRate: 0.15, begin: 100, end: 180, years: 5 });
  const [v, setV] = useState({ initial: 1000000, cf: "300000,350000,400000,450000,500000", rate: 0.12, exit: 4500000, invested: 1000000, reported: 800000, nrExp: 50000, nrInc: 20000, runRate: 30000 });
  const [r, setR] = useState({ p: 0.4, impact: 8, inherent: 16, control: 0.6 });
  const [e, setE] = useState({ s1: 1200, s2: 3400, s3: 18000, revenue: 5000000 });
  const [a, setA] = useState({ dataQuality: 70, infra: 60, talent: 55, governance: 50, process: 65, change: 45 });
  const [en, setEn] = useState({ pvCost: 120000000, pvEnergy: 2000000 });
  const [c, setC] = useState({ evidence: 82, method: 75, assumption: 68 });
  const [ue, setUe] = useState({ smSpend: 500000, newCust: 200, arpu: 50, margin: 0.7, churn: 0.05 });

  const cf = v.cf.split(",").map(Number).filter(n => Number.isFinite(n));

  let results: CalcResult[] = [];
  if (engine === "market") results = [...calcMarketSizing(m), calcCAGR(m.begin, m.end, m.years)];
  else if (engine === "valuation") results = [calcNPV(cf, v.rate, v.initial), calcIRR(cf, v.initial), calcMOIC(v.exit, v.invested), calcAdjEBITDA({ reportedEBITDA: v.reported, nonRecurringExp: v.nrExp, nonRecurringInc: v.nrInc, runRateAdj: v.runRate }), calcExpectedValue([{ p: 0.3, value: cf[0] ?? 0 }, { p: 0.5, value: cf[cf.length - 1] ?? 0 }, { p: 0.2, value: 0 }])];
  else if (engine === "risk") results = [calcRisk(r.p, r.impact), calcResidualRisk(r.inherent, r.control)];
  else if (engine === "esg") results = [calcGHG(e.s1, e.s2, e.s3), calcCarbonIntensity(e.s1 + e.s2 + e.s3, e.revenue)];
  else if (engine === "ai") results = [calcAIReadiness(a)];
  else if (engine === "energy") results = [calcLCOE(en.pvCost, en.pvEnergy)];
  else if (engine === "confidence") results = [calcConfidence(c.evidence, c.method, c.assumption)];
  else if (engine === "unit_economics") results = [
    Quant.calcCAC(ue.smSpend, ue.newCust),
    Quant.calcLTV(ue.arpu, ue.margin, ue.churn),
    Quant.calcRuleOf40(40, 15),
    Quant.calcRunway(1500000, 200000)
  ];

  function num(val: number, set: (n: number) => void, label: string) {
    return (
      <label className="block text-[11px] font-semibold text-zinc-600">
        {label}
        <input type="number" value={val} onChange={ev => set(Number(ev.target.value))} className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
      </label>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5">
        <span className="text-sm font-bold text-zinc-900">ReportOS v3 — calculation engines</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">routed archetype: {arch.name}</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-3 py-2">
        {(["valuation", "market", "risk", "esg", "ai", "energy", "confidence", "unit_economics"] as Engine[]).map(id => (
          <button key={id} onClick={() => setEngine(id)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${engine === id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{id.replace("_", " ")}</button>
        ))}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Inputs (editable)</div>
          <div className="grid grid-cols-2 gap-2">
            {engine === "market" && <>
              {num(m.customers, x => setM({ ...m, customers: x }), "Customers")}
              {num(m.spendPerCustomer, x => setM({ ...m, spendPerCustomer: x }), "Spend/customer $")}
              {num(m.servedShare, x => setM({ ...m, servedShare: x }), "Served share (0-1)")}
              {num(m.captureRate, x => setM({ ...m, captureRate: x }), "Capture rate (0-1)")}
              {num(m.begin, x => setM({ ...m, begin: x }), "CAGR begin")}
              {num(m.end, x => setM({ ...m, end: x }), "CAGR end")}
            </>}
            {engine === "valuation" && <>
              {num(v.initial, x => setV({ ...v, initial: x }), "Initial $")}
              {num(v.rate, x => setV({ ...v, rate: x }), "Discount rate")}
              {num(v.exit, x => setV({ ...v, exit: x }), "Exit equity $")}
              {num(v.invested, x => setV({ ...v, invested: x }), "Invested equity $")}
              <label className="col-span-2 block text-[11px] font-semibold text-zinc-600">Cash flows (comma)
                <input value={v.cf} onChange={ev => setV({ ...v, cf: ev.target.value })} className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs font-mono" />
              </label>
            </>}
            {engine === "risk" && <>
              {num(r.p, x => setR({ ...r, p: x }), "Probability (0-1)")}
              {num(r.impact, x => setR({ ...r, impact: x }), "Impact (1-10)")}
              {num(r.inherent, x => setR({ ...r, inherent: x }), "Inherent risk")}
              {num(r.control, x => setR({ ...r, control: x }), "Control effectiveness (0-1)")}
            </>}
            {engine === "esg" && <>
              {num(e.s1, x => setE({ ...e, s1: x }), "Scope 1 tCO₂e")}
              {num(e.s2, x => setE({ ...e, s2: x }), "Scope 2 tCO₂e")}
              {num(e.s3, x => setE({ ...e, s3: x }), "Scope 3 tCO₂e")}
              {num(e.revenue, x => setE({ ...e, revenue: x }), "Revenue $")}
            </>}
            {engine === "ai" && <>
              {num(a.dataQuality, x => setA({ ...a, dataQuality: x }), "Data quality")}
              {num(a.infra, x => setA({ ...a, infra: x }), "Infrastructure")}
              {num(a.talent, x => setA({ ...a, talent: x }), "Talent")}
              {num(a.governance, x => setA({ ...a, governance: x }), "Governance")}
              {num(a.process, x => setA({ ...a, process: x }), "Process")}
              {num(a.change, x => setA({ ...a, change: x }), "Change readiness")}
            </>}
            {engine === "energy" && <>
              {num(en.pvCost, x => setEn({ ...en, pvCost: x }), "PV lifecycle cost $")}
              {num(en.pvEnergy, x => setEn({ ...en, pvEnergy: x }), "PV energy MWh")}
            </>}
            {engine === "confidence" && <>
              {num(c.evidence, x => setC({ ...c, evidence: x }), "Evidence strength")}
              {num(c.method, x => setC({ ...c, method: x }), "Method validity")}
              {num(c.assumption, x => setC({ ...c, assumption: x }), "Assumption stability")}
            </>}
            {engine === "unit_economics" && <>
              {num(ue.smSpend, x => setUe({...ue, smSpend: x}), "S&M Spend")}
              {num(ue.newCust, x => setUe({...ue, newCust: x}), "New Customers")}
              {num(ue.arpu, x => setUe({...ue, arpu: x}), "ARPU")}
              {num(ue.margin, x => setUe({...ue, margin: x}), "Margin (0-1)")}
              {num(ue.churn, x => setUe({...ue, churn: x}), "Churn (0-1)")}
            </>}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Live results</div>
          {results.map((res, i) => <ResultRow key={i} r={res} />)}
        </div>
      </div>

      {/* Quality gates */}
      <div className="border-t border-zinc-100 px-4 py-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Verification gates (run on every report)</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {QUALITY_GATES.map(g => (
            <div key={g.id} className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-1.5">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">{g.id}</span>
              <div>
                <div className="text-xs font-semibold text-zinc-800">{g.name}</div>
                <div className="text-[10px] text-zinc-500">{g.check}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
