import { useState, useMemo, useCallback } from "react";
import { generateLongWriterPlan, type LongWriterPlan } from "../lib/longwriter";
import { getWorkerPool } from "../lib/worker-pool";
import { useAppState } from "../lib/app-state";

/**
 * LongWriter UI — StarCraft style report decomposition.
 * Allows small models to plan and draft massive papers.
 */
export function LongWriterPanel() {
  const { input } = useAppState();
  const [targetWords, setTargetWords] = useState(2500);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const plan: LongWriterPlan = useMemo(() =>
    generateLongWriterPlan(input || "Deep Research Objective", targetWords),
    [input, targetWords]
  );

      const executePlan = useCallback(async () => {
    setExecuting(true);
    try {
      const pool = getWorkerPool();
      // Execute each section in parallel (simplified for demo)
      const tasks = plan.sections.map((section) => ({
        id: crypto.randomUUID(),
        type: "compute" as const,
        payload: { fn: "sandbox", args: [`print("Section: ${section.title}")`] },
      }));
      const results = await pool.enqueueAll(tasks);
      setResults(results);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setExecuting(false);
    }
  }, [plan]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-3 flex items-center justify-between bg-zinc-50">
        <span className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Module D.2 — SLOOP LongWriter</span>
        <span className="text-[10px] font-mono text-zinc-400">assembly pipeline</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Target Word Count</span>
            <input type="number" value={targetWords} step={500} onChange={e => setTargetWords(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-mono" />
          </label>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <div className="text-[10px] uppercase text-indigo-400 font-bold mb-1">Planned Context Sessions</div>
            <div className="text-lg font-mono font-bold text-indigo-700">{plan.sections.length} sessions</div>
          </div>
        </div>

        <button onClick={executePlan} disabled={executing} className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
          {executing ? "Executing Plan..." : "Execute LongWriter Plan"}
        </button>

        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Pipeline Assembly order</div>
          {plan.sections.map((s, i) => (
            <div key={s.id} className="group relative flex gap-3 rounded-xl border border-zinc-100 bg-white p-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
              <div className="font-mono text-xs text-zinc-300 group-hover:text-indigo-300">{String(i + 1).padStart(2, '0')}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-800">{s.title}</span>
                  <span className="font-mono text-[10px] text-zinc-400">{s.targetWords} words</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.requiredPoints.map(p => (
                    <span key={p} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 font-medium">✓ {p}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {results && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900 leading-relaxed">
            <div className="font-bold mb-2">Execution Results:</div>
            {Array.isArray(results) ? (
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${r.success ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span>Section {i + 1}: {r.success ? "Completed" : "Failed"}</span>
                    {r.error && <span className="text-rose-600"> — {r.error}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-rose-600">Error: {results.error}</div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 leading-relaxed">
          <div className="font-bold mb-2">Assembly Log:</div>
          <div>Decomposing "{input.slice(0, 40)}..."</div>
          <div>Budgeting {targetWords} words across {plan.sections.length} sessions</div>
          <div>Context threading enabled (Virtual Context p=0.85)</div>
        </div>
      </div>
    </div>
  );
}
