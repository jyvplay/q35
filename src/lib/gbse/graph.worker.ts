import * as Comlink from "comlink";
import { RelevanceGraph } from "./graph";
import { type GraphConfig } from "./types";

// Worker-side implementation of the Graph relevance calculation.
// Keeps the UI thread responsive during O(N^2) PageRank iterations.
const workerApi = {
  calculateRelevance(
    nodes: Array<{ nid: string; label: string; confidence: number }>,
    edges: Array<{ src: string; dst: string; signedWeight: number }>,
    cfg: GraphConfig,
    queryNid: string
  ) {
    const g = new RelevanceGraph(cfg);
    for (const n of nodes) g.addNode(n.nid, n.label, n.confidence);
    for (const e of edges) g.addEdge(e.src, e.dst, e.signedWeight);
    return g.personalizedPageRank(queryNid);
  },
};

Comlink.expose(workerApi);
