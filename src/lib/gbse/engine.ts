// BeliefSearch — TypeScript port of the Python orchestrator.
// Log-odds evidence accumulation + Wald SPRT stopping + bounded coupling.

import {
  Verdict,
  SPRTDecision,
  type Evidence,
  type Hypothesis,
  type BeliefState,
  type EngineConfig,
  type EvidenceConfig,
  type SPRTConfig,
} from "./types";
import { sprtUpper, sprtLower } from "./config";

// --- pure helpers -----------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function hashStr(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function llr(ev: Evidence, cfg: EvidenceConfig): number {
  const mag = cfg.llrCap * ev.reliability * ev.strength;
  if (ev.verdict === Verdict.SUPPORT) return +mag;
  if (ev.verdict === Verdict.REFUTE) return -mag;
  return 0;
}

export function sprtDecision(leaderLogw: number, runnerUpLogw: number, cfg: SPRTConfig): SPRTDecision {
  const v = leaderLogw - runnerUpLogw;
  if (v >= sprtUpper(cfg)) return SPRTDecision.ACCEPT;
  if (v <= sprtLower(cfg)) return SPRTDecision.REJECT;
  return SPRTDecision.CONTINUE;
}

export function posterior(st: BeliefState): Record<string, number> {
  const live = Object.values(st.hyps).filter((h) => h.alive);
  if (live.length === 0) return {};
  const m = Math.max(...live.map((h) => h.logw));
  const exps: Record<string, number> = {};
  let z = 0;
  for (const h of live) {
    const e = Math.exp(h.logw - m);
    exps[h.hid] = e;
    z += e;
  }
  if (z === 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(exps)) out[k] = v / z;
  return out;
}

export function entropy(st: BeliefState): number {
  const p = posterior(st);
  const vals = Object.values(p);
  if (vals.length <= 1) return 0;
  let h = 0;
  for (const v of vals) if (v > 0) h += -v * Math.log2(v);
  return h / Math.log2(vals.length);
}

export function ranked(st: BeliefState): Array<[string, number]> {
  return Object.entries(posterior(st)).sort((a, b) => b[1] - a[1]);
}

export function countSupportingSources(h: Hypothesis): number {
  const s = new Set<string>();
  for (const e of h.evidence) if (e.verdict === Verdict.SUPPORT) s.add(e.sourceId);
  return s.size;
}

// --- state construction -----------------------------------------------------

export function newState(texts: string[], priors: number[] | null, cfg: EngineConfig): BeliefState {
  if (texts.length === 0) throw new Error("need at least one hypothesis");
  const ps = priors ?? texts.map(() => 0.5);
  if (ps.length !== texts.length) throw new Error("priors length must match texts length");
  const cap = cfg.evidence.maxPriorLogOdds;
  const sid = hashStr(texts.join("|")).slice(0, 16);
  const hyps: Record<string, Hypothesis> = {};
  texts.forEach((t, i) => {
    const pr = clamp(ps[i], 1e-3, 1 - 1e-3);
    const logw = clamp(Math.log(pr / (1 - pr)), -cap, cap);
    const hid = `H${String(i).padStart(2, "0")}_${hashStr(t).slice(0, 6)}`;
    hyps[hid] = {
      hid,
      text: t,
      logw,
      alive: true,
      evidence: [],
      coupled: {},
      anchorVerdict: Verdict.SILENT,
      anchorConfidence: 0,
      spentTokens: 0,
    };
  });
  return {
    sid,
    hyps,
    committed: null,
    commitReason: "",
    spentTokens: 0,
    createdAt: Date.now() / 1000,
  };
}

export function couple(st: BeliefState, a: string, b: string, strength: number, cfg: EngineConfig): void {
  if (!(a in st.hyps) || !(b in st.hyps)) throw new Error("both hypotheses must exist");
  const s = clamp(strength, 0, cfg.evidence.couplingCap);
  st.hyps[a].coupled[b] = s;
  st.hyps[b].coupled[a] = s;
}

// --- evidence application ---------------------------------------------------

export function applyEvidence(st: BeliefState, hid: string, ev: Evidence, cfg: EngineConfig): BeliefState {
  if (st.committed) return st;
  const h = st.hyps[hid];
  if (!h || !h.alive) return st;

  const delta = llr(ev, cfg.evidence);
  h.logw += delta;
  h.evidence.push(ev);
  h.spentTokens += ev.tokenCost;
  st.spentTokens += ev.tokenCost;

  for (const [otherId, c] of Object.entries(h.coupled)) {
    const o = st.hyps[otherId];
    if (o && o.alive) o.logw += c * delta;
  }

  prune(st, cfg);
  maybeCommit(st, cfg);
  enforceBudget(st, cfg);
  return st;
}

export function setAnchor(st: BeliefState, hid: string, verdict: Verdict, confidence: number, cfg: EngineConfig): void {
  const h = st.hyps[hid];
  if (!h) return;
  h.anchorVerdict = verdict;
  h.anchorConfidence = confidence;
  if (verdict === Verdict.SUPPORT || verdict === Verdict.REFUTE) {
    applyEvidence(
      st,
      hid,
      {
        sourceId: "anchor",
        text: "verified-knowledge anchor",
        verdict,
        reliability: confidence,
        strength: 0.6,
        tokenCost: 0,
        ts: Date.now(),
      },
      cfg,
    );
  }
}

function prune(st: BeliefState, cfg: EngineConfig): void {
  const post = posterior(st);
  const liveCount = () => Object.values(st.hyps).filter((h) => h.alive).length;
  for (const [hid, p] of Object.entries(post)) {
    if (p < cfg.pruneFloor && liveCount() > 1) {
      st.hyps[hid].alive = false;
    }
  }
}

function maybeCommit(st: BeliefState, cfg: EngineConfig): void {
  if (st.committed) return;
  const r = ranked(st);
  if (r.length < 1) return;
  const [leaderHid] = r[0];
  const leader = st.hyps[leaderHid];
  const runnerLogw = r.length > 1 ? st.hyps[r[1][0]].logw : leader.logw - 1e9;
  const decision = sprtDecision(leader.logw, runnerLogw, cfg.sprt);
  const marginOk = (r[0][1] - (r[1]?.[1] ?? 0)) >= cfg.collapseMargin;
  const sourcesOk = countSupportingSources(leader) >= cfg.sprt.minSupportingSources;

  if (decision === SPRTDecision.ACCEPT && marginOk && sourcesOk) {
    commit(st, leaderHid, "sprt_accept");
  } else if (decision === SPRTDecision.REJECT) {
    leader.alive = false;
  }
}

function enforceBudget(st: BeliefState, cfg: EngineConfig): void {
  if (st.committed) return;
  if (st.spentTokens >= cfg.maxTokens) {
    const r = ranked(st);
    if (r.length > 0) commit(st, r[0][0], "budget_exhausted");
  } else if (Date.now() / 1000 - st.createdAt >= cfg.maxSeconds) {
    const r = ranked(st);
    if (r.length > 0) commit(st, r[0][0], "time_exhausted");
  }
}

function commit(st: BeliefState, hid: string, reason: string): void {
  st.committed = hid;
  st.commitReason = reason;
  for (const k of Object.keys(st.hyps)) if (k !== hid) st.hyps[k].alive = false;
}

export function forceCommit(st: BeliefState): string | null {
  if (!st.committed) {
    const r = ranked(st);
    if (r.length === 0) return null;
    commit(st, r[0][0], "forced");
  }
  return st.committed;
}

export function isContested(st: BeliefState): boolean {
  return ["budget_exhausted", "time_exhausted", "forced"].includes(st.commitReason);
}
