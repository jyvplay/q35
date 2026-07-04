import { useAppState } from "../lib/app-state";

/**
 * Deep Reasoning Trace — Hierarchical ledger of the cognitive process.
 * Surfaced in the advanced workspace to debug silent pipeline failures.
 */
export function DeepReasoningTrace() {
  const { reasoningTrace } = useAppState();

  if (reasoningTrace.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center text-sm text-zinc-400">
        No reasoning trace captured. Run a 4-stage pipeline to populate the cognitive ledger.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Cognitive Ledger — Reasoning Trace</h3>
        <span className="font-mono text-[10px] text-zinc-400">{reasoningTrace.length} entries</span>
      </div>
      
      <div className="space-y-2">
        {reasoningTrace.map((entry, i) => (
          <div key={i} className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[10px] text-zinc-400">[{new Date(entry.ts).toLocaleTimeString()}]</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                entry.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}>
                {entry.phase || "trace"}
              </span>
              <span className="text-xs font-bold text-zinc-800">{entry.label}</span>
            </div>
            {entry.detail && <p className="text-xs text-zinc-600 leading-relaxed pl-1">{entry.detail}</p>}
            {entry.data && (
              <pre className="mt-2 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-[10px] text-emerald-400 max-h-40">
                {JSON.stringify(entry.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
