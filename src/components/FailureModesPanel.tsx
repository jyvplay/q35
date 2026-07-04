import { useState } from "react";
import { FAILURE_MODES, SUPERCLASS_SUMMARY } from "../lib/failure-modes";
import { KERNEL_DEFENSES, TOTAL_DEFENSES } from "../lib/defense-registry";

export function FailureModesPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"modes" | "kernel">("modes");
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredModes = FAILURE_MODES.filter(fm =>
    (filter ? fm.superclass === filter : true) &&
    (search ? (fm.name + fm.solution + fm.id).toLowerCase().includes(search.toLowerCase()) : true)
  );
  const filteredKernel = KERNEL_DEFENSES.filter(k =>
    search ? (k.name + k.group + k.id + k.wiredIn).toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-zinc-900">{TOTAL_DEFENSES} Anti-Hallucination Defenses</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">{FAILURE_MODES.length} modes + {KERNEL_DEFENSES.length} kernel</span>
        </div>
        <span className="text-zinc-400 text-sm">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 p-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button onClick={() => setTab("modes")} className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === "modes" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>Failure modes ({FAILURE_MODES.length})</button>
              <button onClick={() => setTab("kernel")} className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === "kernel" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>Kernel defenses ({KERNEL_DEFENSES.length})</button>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="ml-auto rounded-lg border border-zinc-300 px-3 py-1 text-xs outline-none focus:border-indigo-500 w-40" />
          </div>

          {tab === "modes" && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button onClick={() => setFilter(null)} className={`rounded px-2 py-1 text-xs font-medium ${!filter ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>All ({FAILURE_MODES.length})</button>
                {Object.entries(SUPERCLASS_SUMMARY).map(([k, v]) => (
                  <button key={k} onClick={() => setFilter(filter === k ? null : k)}
                    className={`rounded px-2 py-1 text-xs font-medium ${filter === k ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
                    {k}: {v.name}
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr className="border-b border-zinc-200">
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500 w-12">ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">Mode</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">Solution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredModes.map(fm => (
                      <tr key={fm.id} className="hover:bg-zinc-50">
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-indigo-700">{fm.id}</td>
                        <td className="px-3 py-2 font-medium text-zinc-900">{fm.name}</td>
                        <td className="px-3 py-2 text-zinc-600">{fm.solution}</td>
                      </tr>
                    ))}
                    {filteredModes.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-zinc-400">No matches</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">Showing {filteredModes.length}/{FAILURE_MODES.length} failure modes</div>
            </>
          )}

          {tab === "kernel" && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr className="border-b border-zinc-200">
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500 w-12">ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Kernel defense</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Group</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Wired in (real code)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredKernel.map(k => (
                    <tr key={k.id} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-emerald-700">{k.id}</td>
                      <td className="px-3 py-2 font-medium text-zinc-900">{k.name}</td>
                      <td className="px-3 py-2"><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700">{k.group}</span></td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">{k.wiredIn}</td>
                    </tr>
                  ))}
                  {filteredKernel.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-zinc-400">No matches</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
