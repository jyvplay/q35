// Signed Personalized PageRank relevance pre-ranker.
// O(N^2) per iteration; converges for restart_prob > 0.
import type { GraphConfig } from "./types";

export interface GraphNode {
  nid: string;
  label: string;
  confidence: number;
}
export interface GraphEdge {
  src: string;
  dst: string;
  signedWeight: number;
}

export class RelevanceGraph {
  cfg: GraphConfig;
  nodes: Map<string, GraphNode> = new Map();
  edges: GraphEdge[] = [];
  private idx: Map<string, number> = new Map();
  private dirty = true;

  constructor(cfg: GraphConfig) {
    this.cfg = cfg;
  }

  addNode(nid: string, label: string, confidence = 0.5): void {
    if (!this.nodes.has(nid)) {
      if (this.nodes.size >= this.cfg.maxNodes) throw new Error("node budget exceeded");
      this.nodes.set(nid, { nid, label, confidence });
      this.dirty = true;
    } else {
      const n = this.nodes.get(nid)!;
      n.confidence = Math.max(n.confidence, confidence);
    }
  }

  addEdge(src: string, dst: string, signedWeight: number): void {
    if (this.nodes.has(src) && this.nodes.has(dst) && src !== dst) {
      this.edges.push({ src, dst, signedWeight });
      this.dirty = true;
    }
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.idx.clear();
    this.dirty = true;
  }

  private reindex(): void {
    if (!this.dirty) return;
    this.idx = new Map();
    let i = 0;
    for (const nid of this.nodes.keys()) this.idx.set(nid, i++);
    this.dirty = false;
  }

  /** Returns flat NxN matrix in row-major order: m[j*N + i] = mass src(i) -> dst(j). */
  private transitionMatrix(): { m: Float64Array; n: number } {
    this.reindex();
    const n = this.nodes.size;
    const m = new Float64Array(n * n);
    for (const e of this.edges) {
      const i = this.idx.get(e.src)!;
      const j = this.idx.get(e.dst)!;
      m[j * n + i] += e.signedWeight;
    }
    // Column-normalize by absolute sum to keep operator bounded.
    const colAbs = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) colAbs[i] += Math.abs(m[j * n + i]);
    }
    for (let i = 0; i < n; i++) if (colAbs[i] === 0) colAbs[i] = 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) m[j * n + i] /= colAbs[i];
    }
    return { m, n };
  }

  /** Returns [{nid,label,score}] sorted desc. Score is a relevance ranking in [0,1] */
  personalizedPageRank(queryNid: string): Array<{ nid: string; label: string; score: number }> {
    this.reindex();
    if (!this.idx.has(queryNid) || this.nodes.size === 0) return [];
    const { m, n } = this.transitionMatrix();
    const restart = new Float64Array(n);
    restart[this.idx.get(queryNid)!] = 1.0;
    let r = new Float64Array(restart);
    const a = this.cfg.restartProb;
    for (let it = 0; it < this.cfg.maxIters; it++) {
      const next = new Float64Array(n);
      // next = (1-a) * (m @ r) + a * restart
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += m[j * n + i] * r[i];
        next[j] = (1 - a) * s + a * restart[j];
      }
      // L1 diff
      let d = 0;
      for (let i = 0; i < n; i++) d += Math.abs(next[i] - r[i]);
      r = next;
      if (d < this.cfg.tolerance) break;
    }
    let maxAbs = 0;
    for (let i = 0; i < n; i++) if (Math.abs(r[i]) > maxAbs) maxAbs = Math.abs(r[i]);
    if (maxAbs === 0) maxAbs = 1;
    const inv: string[] = new Array(n);
    for (const [nid, i] of this.idx.entries()) inv[i] = nid;
    const out = inv.map((nid, i) => ({
      nid,
      label: this.nodes.get(nid)!.label,
      score: Math.abs(r[i]) / maxAbs,
    }));
    out.sort((a, b) => b.score - a.score);
    return out;
  }
}
