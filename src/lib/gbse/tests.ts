// Lightweight in-browser correctness suite. Returns pass/fail per test so the UI
// can render a green/red panel proving the math properties live.

import { Verdict, type EngineConfig, type Evidence } from "./types";
import { defaultConfig } from "./config";
import {
  applyEvidence,
  countSupportingSources,
  newState,
  posterior,
  sprtDecision,
} from "./engine";
import { RelevanceGraph } from "./graph";

export interface TestResult { name: string; pass: boolean; detail?: string; }

function ev(src: string, v: Verdict, rel = 0.8, strength = 0.7, cost = 100): Evidence {
  return { sourceId: src, text: "e", verdict: v, reliability: rel, strength, tokenCost: cost, ts: Date.now() };
}

export function runTests(): TestResult[] {
  const results: TestResult[] = [];
  const cfg: EngineConfig = defaultConfig();

  // 1) log-odds additivity is order-independent
  try {
    const a = newState(["X", "Y"], null, cfg);
    const b = newState(["X", "Y"], null, cfg);
    const ha = Object.keys(a.hyps)[0], hb = Object.keys(b.hyps)[0];
    const e1 = ev("s1", Verdict.SUPPORT);
    const e2 = ev("s2", Verdict.SUPPORT, 0.6);
    applyEvidence(a, ha, e1, cfg); applyEvidence(a, ha, e2, cfg);
    applyEvidence(b, hb, e2, cfg); applyEvidence(b, hb, e1, cfg);
    const ok = Math.abs(a.hyps[ha].logw - b.hyps[hb].logw) < 1e-12;
    results.push({ name: "log-odds additivity is order-independent", pass: ok, detail: `Δlogw=${(a.hyps[ha].logw - b.hyps[hb].logw).toExponential(2)}` });
  } catch (e) { results.push({ name: "log-odds additivity", pass: false, detail: String(e) }); }

  // 2) silent evidence moves nothing
  try {
    const st = newState(["X", "Y"], null, cfg);
    const h = Object.keys(st.hyps)[0];
    const before = st.hyps[h].logw;
    applyEvidence(st, h, ev("s", Verdict.SILENT), cfg);
    results.push({ name: "SILENT evidence does not move logw", pass: st.hyps[h].logw === before });
  } catch (e) { results.push({ name: "SILENT evidence", pass: false, detail: String(e) }); }

  // 3) posterior normalized
  try {
    const st = newState(["A", "B", "C"], null, cfg);
    const s = Object.values(posterior(st)).reduce((a, b) => a + b, 0);
    results.push({ name: "posterior sums to 1", pass: Math.abs(s - 1) < 1e-12, detail: `sum=${s}` });
  } catch (e) { results.push({ name: "posterior sum", pass: false, detail: String(e) }); }

  // 4) SPRT requires min sources
  try {
    const cfg2 = defaultConfig({ sprt: { alpha: 0.05, beta: 0.1, minSupportingSources: 2 } });
    const st = newState(["A", "B"], null, cfg2);
    const h = Object.keys(st.hyps)[0];
    for (let i = 0; i < 10; i++) applyEvidence(st, h, ev("only_one", Verdict.SUPPORT, 1.0, 1.0), cfg2);
    results.push({ name: "single source cannot commit (min_sources guard)", pass: st.committed === null });
  } catch (e) { results.push({ name: "min sources", pass: false, detail: String(e) }); }

  // 5) SPRT commits with enough independent support
  try {
    const st = newState(["A", "B", "C"], null, cfg);
    const h = Object.keys(st.hyps)[0];
    applyEvidence(st, h, ev("s1", Verdict.SUPPORT, 0.9, 0.9), cfg);
    applyEvidence(st, h, ev("s2", Verdict.SUPPORT, 0.9, 0.9), cfg);
    applyEvidence(st, h, ev("s3", Verdict.SUPPORT, 0.9, 0.9), cfg);
    results.push({
      name: "SPRT commits with ≥min independent support",
      pass: st.committed === h && st.commitReason === "sprt_accept",
      detail: `committed=${st.committed} reason=${st.commitReason}`,
    });
  } catch (e) { results.push({ name: "SPRT accept", pass: false, detail: String(e) }); }

  // 6) signed PPR: contradiction cancels
  try {
    const g = new RelevanceGraph(cfg.graph);
    for (const n of ["q", "support_only", "contested", "neg"]) g.addNode(n, n);
    g.addEdge("q", "support_only", +1);
    g.addEdge("q", "contested", +1);
    g.addEdge("neg", "contested", -1);
    g.addEdge("q", "neg", +1);
    const ranked = g.personalizedPageRank("q");
    const s = (id: string) => ranked.find((r) => r.nid === id)?.score ?? 0;
    results.push({
      name: "signed PPR: support-only ranks ≥ contested",
      pass: s("support_only") >= s("contested"),
      detail: `support=${s("support_only").toFixed(3)} contested=${s("contested").toFixed(3)}`,
    });
  } catch (e) { results.push({ name: "PPR contradiction", pass: false, detail: String(e) }); }

  // 7) SPRT boundary semantics
  try {
    const d1 = sprtDecision(5, 0, cfg.sprt);
    const d2 = sprtDecision(0, 5, cfg.sprt);
    const d3 = sprtDecision(0.1, 0, cfg.sprt);
    results.push({
      name: "SPRT boundaries: ACCEPT/REJECT/CONTINUE",
      pass: d1 === "accept" && d2 === "reject" && d3 === "continue",
      detail: `${d1}/${d2}/${d3}`,
    });
  } catch (e) { results.push({ name: "SPRT boundaries", pass: false, detail: String(e) }); }

  // 8) supporting source counting
  try {
    const st = newState(["A"], null, cfg);
    const h = Object.keys(st.hyps)[0];
    applyEvidence(st, h, ev("s1", Verdict.SUPPORT), cfg);
    applyEvidence(st, h, ev("s1", Verdict.SUPPORT), cfg); // duplicate source
    applyEvidence(st, h, ev("s2", Verdict.SUPPORT), cfg);
    results.push({ name: "supporting-source counter dedups", pass: countSupportingSources(st.hyps[h]) === 2 });
  } catch (e) { results.push({ name: "source dedup", pass: false, detail: String(e) }); }

  return results;
}
