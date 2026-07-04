import { useMemo, useState } from "react";
import { COMPUTE_REGISTRY, runComputeCall, type ComputeRecord } from "../lib/compute-sandbox";

// Interactive front-end for the SAME deterministic sandbox the reasoning
// pipeline calls. Whatever you run here is byte-for-byte what the AI invokes
// during Stage 2.5 — no separate code path, no simulation.
export function ComputeSandboxPanel() {
  const groups = useMemo(() => {
    const m = new Map<string, typeof COMPUTE_REGISTRY>();
    for (const s of COMPUTE_REGISTRY) { const g = m.get(s.group) ?? []; g.push(s); m.set(s.group, g); }
    return [...m.entries()];
  }, []);

  const [activeId, setActiveId] = useState(COMPUTE_REGISTRY[0].id);
  const spec = COMPUTE_REGISTRY.find((s) => s.id === activeId)!;
  const [args, setArgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.params.map((p) => [p.name, String(p.default)]))
  );
  const [record, setRecord] = useState<ComputeRecord | null>(null);

  function selectFn(id: string) {
    setActiveId(id);
    const s = COMPUTE_REGISTRY.find((x) => x.id === id)!;
    setArgs(Object.fromEntries(s.params.map((p) => [p.name, String(p.default)])));
    setRecord(null);
  }

  function run() {
    const parsed: Record<string, number | number[]> = {};
    for (const p of spec.params) {
      const raw = args[p.name] ?? "";
      parsed[p.name] = p.kind === "number[]"
        ? raw.split(/[,\s]+/).map(Number).filter((x) => isFinite(x))
        : Number(raw);
    }
    setRecord(runComputeCall({ id: spec.id, args: parsed }));
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-zinc-900">Deterministic Compute Sandbox</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{COMPUTE_REGISTRY.length} whitelisted functions</span>
        </div>
        <span className="text-[10px] text-zinc-400">same path the reasoning chain calls · no eval · pure functions</span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
        {/* Function list */}
        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {groups.map(([group, specs]) => (
            <div key={group}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">{group}</div>
              <div className="space-y-0.5">
                {specs.map((s) => (
                  <button key={s.id} onClick={() => selectFn(s.id)}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs ${activeId === s.id ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}>
                    {s.label}
                    <span className={`ml-1 font-mono text-[10px] ${activeId === s.id ? "text-zinc-400" : "text-zinc-400"}`}>{s.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Inputs + run + output */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <div className="text-xs font-bold text-zinc-900">{spec.label}</div>
            <div className="font-mono text-[11px] text-zinc-500">{spec.id} — {spec.formula}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {spec.params.map((p) => (
              <label key={p.name} className="block text-[11px] font-semibold text-zinc-600">
                {p.name} <span className="font-mono text-zinc-400">{p.kind}</span>
                <input value={args[p.name] ?? ""} onChange={(e) => setArgs({ ...args, [p.name]: e.target.value })}
                  placeholder={p.kind === "number[]" ? "comma-separated" : "number"}
                  className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs font-mono" />
              </label>
            ))}
          </div>
          <button onClick={run} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">Run calculation</button>

          {record && (
            <div className={`rounded-xl border p-3 ${record.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${record.ok ? "text-emerald-800" : "text-rose-800"}`}>{record.ok ? "Verified output" : "Compute failed"}</span>
                <span className="font-mono text-[10px] text-zinc-500">{record.ms.toFixed(2)} ms</span>
              </div>
              {record.result ? (
                <div className="mt-2 space-y-1">
                  {Object.entries(record.result).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-zinc-600">{k}</span>
                      <span className={`font-bold ${isFinite(v) ? "text-zinc-900" : "text-rose-700"}`}>{isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "NaN — check inputs"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-xs text-rose-700">{record.error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact read-only renderer for compute records attached to a chat answer. */
export function ComputeRecordsInline({ records }: { records: ComputeRecord[] }) {
  if (!records.length) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-900">
        Deterministic calculations ({records.filter((r) => r.ok).length}/{records.length} verified)
      </summary>
      <div className="mt-2 space-y-1 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 font-mono text-[11px]">
        {records.map((r, i) => (
          <div key={i} className={r.ok ? "text-emerald-800" : "text-rose-700"}>
            {r.label}: {r.result ? Object.entries(r.result).map(([k, v]) => `${k}=${isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "NaN"}`).join(", ") : (r.error ?? "failed")}
            <span className="ml-1 text-zinc-400">[{r.formula}]</span>
          </div>
        ))}
      </div>
    </details>
  );
}
