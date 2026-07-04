import { useState } from "react";
import { runTests, type TestResult } from "../lib/gbse/tests";

export function TestPanel() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const passed = results?.filter(r => r.pass).length ?? 0;
  const total = results?.length ?? 0;

  async function run() {
    setRunning(true);
    await new Promise(r => setTimeout(r, 0));
    setResults(runTests());
    setRunning(false);
  }

  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
        <span className="text-sm font-bold text-zinc-900">Engine self-tests</span>
        <button onClick={run} disabled={running}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-bold text-white hover:bg-zinc-700 disabled:opacity-40">
          {running ? "Running…" : "Run all"}
        </button>
      </div>
      {results === null ? (
        <div className="p-4 text-sm text-zinc-400">
          Click <em>Run all</em> to verify log-odds additivity, SPRT semantics, posterior normalization, signed PPR cancellation, and the min-sources guard.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2">
            <div className={`text-xs font-mono font-bold ${passed === total ? "text-emerald-700" : "text-amber-700"}`}>
              {passed}/{total} passed
            </div>
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full rounded-full ${passed === total ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${score}%` }} />
            </div>
            <div className="text-xs text-zinc-400">{score}%</div>
          </div>
          <ul className="divide-y divide-zinc-50 max-h-64 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <span className={`text-sm font-bold shrink-0 ${r.pass ? "text-emerald-600" : "text-rose-600"}`}>
                    {r.pass ? "✓" : "✗"}
                  </span>
                  <div>
                    <div className="text-sm text-zinc-900">{r.name}</div>
                    {r.detail && <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{r.detail}</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
