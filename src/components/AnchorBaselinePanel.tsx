import { useState } from "react";
import { anchorProbe, type AnchorProbeResult } from "../lib/connectors/wikidata";
import { useAppState } from "../lib/app-state";

export function AnchorBaselinePanel() {
  const { input, patchTelemetry, pushDebugEvent } = useAppState();
  const [query, setQuery] = useState(input || "heat pump carbon intensity cold climate");
  const [result, setResult] = useState<AnchorProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runProbe() {
    setBusy(true);
    setError(null);
    try {
      const r = await anchorProbe(query);
      setResult(r);
      // Feed real anchor coverage into the live telemetry / AEGIS HUD
      patchTelemetry({ anchorCoverage: r.coverage });
      pushDebugEvent(`Anchor probe: ${(r.coverage * 100).toFixed(0)}% coverage, ${r.entities.length} Wikidata entities`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Tier A anchor baseline</div>
          <h2 className="mt-1 text-lg font-bold text-zinc-900">Wikidata probe and gap ledger</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            This additive anchor check establishes a cheap baseline before web spend. It returns entity coverage and gap notes, not final truth.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        <button onClick={runProbe} disabled={busy || !query.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Probing..." : "Probe anchor"}
        </button>
      </div>
      {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {result && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Anchor coverage</div>
            <div className="mt-2 font-mono text-3xl font-bold text-zinc-900">{(result.coverage * 100).toFixed(0)}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full bg-emerald-600" style={{ width: `${result.coverage * 100}%` }} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {result.entities.map((e) => (
                <a key={e.id} href={e.concepturi} target="_blank" rel="noreferrer" className="rounded-xl border border-zinc-200 p-3 text-sm hover:border-emerald-300 hover:bg-emerald-50">
                  <div className="font-mono text-xs font-bold text-emerald-700">{e.id}</div>
                  <div className="font-semibold text-zinc-900">{e.label}</div>
                  <div className="mt-1 text-xs text-zinc-600">{e.description || "No description returned."}</div>
                </a>
              ))}
            </div>
            {result.gapNotes.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {result.gapNotes.map((g) => <div key={g}>- {g}</div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}