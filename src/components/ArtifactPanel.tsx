import type { ArtifactResponse } from "../lib/artifacts";

export function ArtifactInline({ artifact }: { artifact: ArtifactResponse }) {
  if (!artifact || (artifact.resolved.length === 0 && artifact.unresolved.length === 0)) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-xs font-semibold text-violet-700 hover:text-violet-900">
        Deterministic artifact receipt ({artifact.resolved.length} resolved, {artifact.unresolved.length} unresolved)
      </summary>
      <div className="mt-2 overflow-hidden rounded-xl border border-violet-100 bg-violet-50/60">
        <table className="w-full text-[11px]">
          <thead className="bg-violet-100/80">
            <tr>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Ticker</th>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Name</th>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Price</th>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Mkt cap</th>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Earnings</th>
              <th className="px-2 py-1.5 text-left font-bold text-violet-900">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-100">
            {artifact.resolved.map((s) => (
              <tr key={s.ticker} className="hover:bg-violet-50">
                <td className="px-2 py-1.5 font-mono font-bold text-violet-900">{s.ticker}</td>
                <td className="px-2 py-1.5 text-zinc-900">{s.name}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-700">{s.price === null ? "null" : `$${s.price.toFixed(2)}`}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-700">{s.mktCap || "null"}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-700">{s.nextEarnings || "null"}</td>
                <td className={`px-2 py-1.5 font-mono text-[10px] ${s.hasLiveData ? "text-emerald-700" : "text-amber-700"}`}>{s.source}{s.hasLiveData ? "" : " (name-only)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {artifact.unresolved.length > 0 && (
          <div className="border-t border-violet-100 px-3 py-1.5 text-[10px] text-rose-800">
            Unresolved and blocked from synthesis: {artifact.unresolved.join(", ")}
          </div>
        )}
      </div>
    </details>
  );
}