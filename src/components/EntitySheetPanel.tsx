import type { EntitySheet } from "../lib/entity-resolver";

/** Compact inline display of the verified entity sheet attached to a chat answer. */
export function EntitySheetInline({ sheet }: { sheet: EntitySheet }) {
  if (!sheet || sheet.entities.length === 0) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-xs font-semibold text-sky-700 hover:text-sky-900">
        Verified entity sheet ({sheet.entities.length} resolved, {sheet.weakEntities.length} weak)
      </summary>
      <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/60 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-sky-100/80">
            <tr>
              <th className="px-2 py-1.5 text-left font-bold text-sky-800">Ticker</th>
              <th className="px-2 py-1.5 text-left font-bold text-sky-800">Company</th>
              <th className="px-2 py-1.5 text-left font-bold text-sky-800">Facts</th>
              <th className="px-2 py-1.5 text-left font-bold text-sky-800">Sources</th>
              <th className="px-2 py-1.5 text-left font-bold text-sky-800">Catalyst</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sky-100">
            {sheet.entities.map((e) => (
              <tr key={e.ticker} className="hover:bg-sky-50">
                <td className="px-2 py-1.5 font-mono font-bold text-sky-900">{e.ticker}</td>
                <td className="px-2 py-1.5 text-zinc-900">{e.name}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(e.facts).map(([k, v]) => (
                      <span key={k} className="inline-flex rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 shadow-sm">
                        {k}: <span className="ml-0.5 font-bold text-zinc-900">{v}</span>
                      </span>
                    ))}
                    {Object.keys(e.facts).length === 0 && <span className="text-zinc-400 italic">no metrics found</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-500">{e.sourceIndices.map((i) => `S${i}`).join(", ")}</td>
                <td className="px-2 py-1.5 text-[10px] text-zinc-600">{e.catalystRaw?.slice(0, 60) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.weakEntities.length > 0 && (
          <div className="border-t border-sky-100 px-3 py-1.5 text-[10px] text-amber-800">
            Weak / unresolved: {sheet.weakEntities.join(", ")} — insufficient grounding to recommend
          </div>
        )}
      </div>
    </details>
  );
}
