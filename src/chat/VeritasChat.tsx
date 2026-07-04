import { useMemo, useState } from "react";
import { ContextSynthesisEngine } from "./synthesis";
import type { OrchestrationResponse } from "./tier";

export function VeritasChatSystem() {
  const [query, setQuery] = useState("");
  const [contextData, setContextData] = useState("");
  const [executionPrompt, setExecutionPrompt] = useState("");
  const [telemetry, setTelemetry] = useState<OrchestrationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synthesisEngine = useMemo(() => new ContextSynthesisEngine(), []);

  async function handleExecuteOrchestration(e: React.FormEvent) {
    e.preventDefault();
    if (!query || !contextData) {
      setError("Both query and context data are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await synthesisEngine.synthesizeSecureContext(query, contextData);
      setExecutionPrompt(result.finalizedPrompt);
      setTelemetry(result.telemetry);
    } catch (err: any) {
      setError(err.message || "An orchestration error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 p-6 text-slate-100">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="font-mono text-xl font-bold tracking-wider text-cyan-400">PRISMAFETCH // MULTI-TIER CONTEXT ORCHESTRATOR v2.0</h1>
        <p className="mt-1 text-xs text-slate-400">High-fidelity context protection against leakage, drift, and injection payloads.</p>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        <form onSubmit={handleExecuteOrchestration} className="flex flex-col space-y-4 lg:col-span-5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Extraction instruction..." />
          <textarea value={contextData} onChange={(e) => setContextData(e.target.value)} className="h-64 flex-1 resize-none rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs" placeholder="Paste large source context..." />
          <button disabled={loading} className="rounded bg-cyan-600 py-2.5 text-sm font-bold uppercase tracking-wide text-white disabled:bg-slate-800 disabled:text-slate-500">{loading ? "Processing..." : "Execute Orchestrated Ingestion"}</button>
          {error && <div className="rounded border border-red-800 bg-red-950/50 p-3 font-mono text-xs text-red-400">[CRITICAL ERROR] {error}</div>}
        </form>
        <div className="flex flex-col space-y-4 overflow-y-auto lg:col-span-7">
          {telemetry && (
            <div className="space-y-3 rounded border border-slate-800 bg-slate-900 p-4">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">// Telemetry</h3>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <Metric label="Zero-width" value={telemetry.primary_safety.zero_width_cleared ? "PURGED" : "CLEAR"} />
                <Metric label="Obfuscation" value={telemetry.primary_safety.obfuscation_neutralized ? "NEUTRALIZED" : "NONE"} />
                <Metric label="Injection" value={telemetry.primary_safety.injection_heuristic_tripped ? "MUTED" : "CLEAR"} />
                <Metric label="FP16 Outliers" value={telemetry.hardware_telemetry.allocated_fp16_outliers} />
                <Metric label="INT4 Ambient" value={telemetry.hardware_telemetry.allocated_int4_ambient} />
                <Metric label="VRAM Saved" value={`${telemetry.hardware_telemetry.vram_savings_est_mb} MB`} />
              </div>
            </div>
          )}
          <pre className="min-h-64 flex-1 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-300">{executionPrompt || "No active verification context pipeline has been invoked yet."}</pre>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border border-slate-800 bg-slate-950 p-2.5"><div className="text-[10px] uppercase text-slate-400">{label}</div><div className="mt-1 font-bold text-cyan-400">{value}</div></div>;
}