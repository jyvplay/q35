import { useMemo, useState, useEffect } from "react";
import * as Comlink from "comlink";
import type { RelevanceGraph } from "../lib/gbse/graph";

interface Pos { x: number; y: number; }

export function GraphView({ graph, queryNid = "__query__" }: { graph: RelevanceGraph | null; queryNid?: string }) {
  const [ranked, setRanked] = useState<Array<{ nid: string; label: string; score: number }>>([]);

  useEffect(() => {
    if (!graph || graph.nodes.size === 0) return;
    const worker = new Worker(new URL("../lib/gbse/graph.worker.ts", import.meta.url));
    const api = Comlink.wrap<any>(worker);
    
    const nodes = Array.from(graph.nodes.values());
    const edges = graph.edges;
    
    api.calculateRelevance(nodes, edges, graph.cfg, queryNid).then((r: any) => {
      setRanked(r);
      worker.terminate();
    });
  }, [graph, queryNid]);

  const layout = useMemo(() => {
    if (!ranked || ranked.length === 0) return null;
    const scoreMap = new Map(ranked.map((r) => [r.nid, r.score]));
    const W = 720, H = 360, cx = W / 2, cy = H / 2;
    const positions = new Map<string, Pos>();
    positions.set(queryNid, { x: cx, y: cy });
    
    const others = ranked.filter((r) => r.nid !== queryNid);
    const hyps = others.filter((r) => r.nid.startsWith("H"));
    const entities = others.filter((r) => r.nid.startsWith("E:"));
    const sources = others.filter((r) => r.nid.startsWith("S:"));
    const misc = others.filter(r => !r.nid.startsWith("H") && !r.nid.startsWith("E:") && !r.nid.startsWith("S:") && r.nid !== queryNid);

    function ring(items: typeof ranked, radius: number, phase = 0) {
      items.forEach((it, i) => {
        const a = phase + (2 * Math.PI * i) / Math.max(items.length, 1);
        positions.set(it.nid, { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
      });
    }
    ring(hyps, 95);
    ring(entities, 138, Math.PI / 7);
    ring(sources, 168, Math.PI / 4);
    ring(misc, 178, Math.PI / 3);
    return { positions, scoreMap, W, H };
  }, [ranked, queryNid]);

  if (!graph || !layout) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-400 shadow-sm">
        Signed Personalized PageRank graph appears once hypotheses are seeded.
      </div>
    );
  }

  const { positions, scoreMap, W, H } = layout;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-900">Signed PPR — relevance graph</span>
        <span className="text-[11px] text-zinc-500">{graph.nodes.size} nodes · {graph.edges.length} edges</span>
      </div>
      <div className="overflow-x-auto bg-zinc-50/50 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full">
          <defs>
            <marker id="ap" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#10b981" />
            </marker>
            <marker id="an" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#f43f5e" />
            </marker>
          </defs>
          {graph.edges.map((e, i) => {
            const a = positions.get(e.src);
            const b = positions.get(e.dst);
            if (!a || !b) return null;
            const pos = e.signedWeight >= 0;
            const w = Math.max(0.5, Math.min(3, Math.abs(e.signedWeight) * 2.5));
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={pos ? "#10b981" : "#f43f5e"} strokeOpacity={0.45} strokeWidth={w}
                markerEnd={pos ? "url(#ap)" : "url(#an)"} />
            );
          })}
          {[...positions.entries()].map(([nid, p]) => {
            const score = scoreMap.get(nid) ?? 0;
            const node = graph.nodes.get(nid);
            const isQ = nid === queryNid;
            const isH = nid.startsWith("H");
            const isE = nid.startsWith("E:");
            const r = isQ ? 20 : 7 + 11 * score;
            const fill = isQ ? "#6366f1" : isH ? "#0ea5e9" : isE ? "#a78bfa" : "#94a3b8";
            return (
              <g key={nid}>
                <circle cx={p.x} cy={p.y} r={r} fill={fill} fillOpacity={0.88} stroke="#fff" strokeWidth={1.5} />
                <text x={p.x} y={p.y + r + 10} textAnchor="middle" fill="#374151" fontSize={9} fontFamily="ui-monospace,monospace">
                  {(node?.label ?? nid).slice(0, 24)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500">
        <span><span className="inline-block h-2 w-2 rounded-full bg-indigo-500 mr-1" />query</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-sky-500 mr-1" />hypothesis</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-violet-400 mr-1" />entity</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-slate-400 mr-1" />source</span>
        <span><span className="inline-block h-0.5 w-4 bg-emerald-400 align-middle mr-1" />support</span>
        <span><span className="inline-block h-0.5 w-4 bg-rose-400 align-middle mr-1" />refute</span>
      </div>
    </div>
  );
}
