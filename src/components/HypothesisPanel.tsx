import type { BeliefState } from "../lib/gbse/types";
import { entropy, posterior, countSupportingSources } from "../lib/gbse/engine";

export function HypothesisPanel({ state }: { state: BeliefState | null }) {
  if (!state) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-center text-sm text-zinc-400">
        No belief state yet. Run a Bayesian search to see hypothesis tracking.
      </div>
    );
  }
  const post = posterior(state);
  const sorted = Object.entries(post).sort((a, b) => b[1] - a[1]);
  const ent = entropy(state);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
        <span className="text-sm font-bold text-zinc-900">Hypotheses (posterior)</span>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span>entropy <span className="font-mono font-bold text-zinc-800">{ent.toFixed(3)}</span></span>
          <span>{sorted.length} living</span>
        </div>
      </div>
      <div className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
        {sorted.map(([hid, p]) => {
          const h = state.hyps[hid];
          const isWinner = state.committed === hid;
          const supportCount = countSupportingSources(h);
          const refuteCount = h.evidence.filter(e => e.verdict === "refute").length;
          const silentCount = h.evidence.filter(e => e.verdict === "silent").length;
          return (
            <div key={hid} className={`p-3 ${isWinner ? "bg-emerald-50/70" : ""}`}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {isWinner && <span className="text-emerald-600 font-bold">✓</span>}
                  <span className="font-mono text-[10px] text-zinc-400">{hid}</span>
                  {!h.alive && !isWinner && <span className="rounded bg-zinc-100 px-1 text-[9px] text-zinc-500">PRUNED</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-700">{(p * 100).toFixed(1)}%</span>
                  <span className="font-mono text-[10px] text-zinc-400">logw={h.logw.toFixed(2)}</span>
                </div>
              </div>
              <div className={`text-sm mb-2 ${h.alive ? "text-zinc-900" : "text-zinc-400 line-through"}`}>{h.text}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isWinner ? "bg-emerald-500" : "bg-sky-500"}`}
                  style={{ width: `${Math.max(2, p * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                <span title="distinct supporting sources" className="text-emerald-700 font-semibold">↑ {supportCount} support</span>
                <span className="text-rose-700">↓ {refuteCount} refute</span>
                {silentCount > 0 && <span>· {silentCount} silent</span>}
                <span className="font-mono">{h.spentTokens.toLocaleString()} tok</span>
                <span className={`font-mono ${h.anchorVerdict === "support" ? "text-emerald-600" : h.anchorVerdict === "refute" ? "text-rose-600" : "text-zinc-400"}`}>
                  anchor:{h.anchorVerdict}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
