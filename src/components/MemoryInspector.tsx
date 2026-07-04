import { useAppState } from "../lib/app-state";

/**
 * Unified Memory Inspector — Surfaces the persistent context
 * shared between all pages and pipeline runs.
 */
export function MemoryInspector() {
  const { memory, debugEvents } = useAppState();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between bg-zinc-50">
        <span className="text-sm font-bold text-zinc-900">Unified Memory Inspector</span>
        <span className="text-[10px] font-mono text-zinc-400">persistent store</span>
      </div>
      
      <div className="grid md:grid-cols-2 divide-x divide-zinc-100">
        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">KV Store (State)</div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs text-emerald-400 leading-relaxed shadow-inner">
            {JSON.stringify(memory, null, 2)}
          </pre>
        </div>
        
        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Execution Events (Ephemeral)</div>
          <div className="max-h-64 overflow-auto rounded-xl bg-zinc-900 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
            {debugEvents.length === 0 ? (
              <div className="text-zinc-600 italic">No events recorded in this session.</div>
            ) : (
              debugEvents.map((e, i) => <div key={i} className="mb-0.5 border-b border-zinc-800 pb-0.5 last:border-0">{e}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
