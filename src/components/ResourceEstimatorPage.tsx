import { useEffect, useMemo, useState } from "react";
import { aegisPanel, estimateResources, zeroActuals, type Actuals, type DriverId, type EstimateInput } from "../lib/resource-estimator";
import { TIERS } from "../lib/gbse/tiers";
import { useAppState } from "../lib/app-state";
import { HUD } from "./HUD";
import { extractConstraints, summarizeConstraints } from "../lib/constraints";

const DRIVER_OPTIONS: { id: DriverId; label: string; notes: string }[] = [
  { id: "frontier",      label: "Frontier cloud",       notes: "GPT-4o / Claude 3.7 class" },
  { id: "gemma4-31b",    label: "Gemma 4 31B",           notes: "Full orchestrator via Gemini API" },
  { id: "qwen3.6",       label: "Qwen 3.6 class",        notes: "Reasoning toggle, large context" },
  { id: "gemma4-e4b",    label: "Gemma 4 E4B class",     notes: "Laptop / browser / WebGPU" },
  { id: "apple-ondevice",label: "Apple on-device",       notes: "Privacy-first, anchor-required" },
  { id: "bonsai-8b",     label: "Bonsai 8B class",       notes: "~1.15 GB, phone-class, anchor-required" },
];

function Calib({ label, est, actual, suffix }: { label: string; est: number; actual: number; suffix?: string }) {
  const delta = actual - est;
  const pct = est > 0 ? (delta / est) * 100 : 0;
  const tone = Math.abs(pct) < 15 ? "text-emerald-700" : Math.abs(pct) < 35 ? "text-amber-700" : "text-rose-700";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-500">est {est.toLocaleString()}{suffix ?? ""}</div>
      <div className="font-mono text-sm font-bold text-zinc-900">act {actual.toLocaleString()}{suffix ?? ""}</div>
      <div className={`mt-1 font-mono text-[11px] ${tone}`}>{delta >= 0 ? "+" : ""}{delta.toLocaleString()}{suffix ?? ""} ({pct >= 0 ? "+" : ""}{pct.toFixed(0)}%)</div>
    </div>
  );
}

export function ResourceEstimatorPage() {
  const { input: sharedInput, lastRun, busyState, settings, telemetry } = useAppState();

  const [mode, setMode] = useState<"preflight" | "live" | "postrun">(lastRun ? "postrun" : "preflight");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [input, setInput] = useState<EstimateInput>({
    query: sharedInput || "Is a heat pump lower-carbon than a gas furnace in a cold climate?",
    tier: 3, driver: "gemma4-31b", anchorMode: "preferred",
    webAccess: "on", verifierAlpha: 0.25, councilWidth: 5, workerDepth: 9,
  });

  // Keep estimator query in sync with shared input
  useEffect(() => {
    if (sharedInput !== input.query) {
      setInput(prev => ({ ...prev, query: sharedInput || "Is a heat pump lower-carbon than a gas furnace in a cold climate?" }));
    }
  }, [sharedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // When lastRun changes, switch to postrun
  useEffect(() => {
    if (lastRun) {
      setMode("postrun");
      setStartedAt(lastRun.startedAt);
    }
  }, [lastRun]);

  // Track live run from busyState
  useEffect(() => {
    if (busyState && mode !== "live") {
      setMode("live");
      if (!startedAt) setStartedAt(Date.now());
    }
    if (!busyState && mode === "live" && lastRun) {
      setMode("postrun");
    }
  }, [busyState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== "live" || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [mode, startedAt]);

  const detectedConstraints = useMemo(() => input.query.trim() ? extractConstraints(input.query) : null, [input.query]);
  const est = useMemo(() => estimateResources(input), [input]);
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const progress = mode === "postrun" ? 1 : startedAt ? Math.min(1, elapsed / Math.max(1, est.time_s)) : 0;
  // Prefer REAL measured telemetry; fall back to projection only with no run data.
  const hasReal = telemetry.phase !== "idle";
  const actual: Actuals = hasReal ? {
    actual_in: telemetry.tokensIn,
    actual_out: telemetry.tokensOut,
    actual_tools: telemetry.toolCalls,
    actual_paths: telemetry.hypotheses,
    actual_states: telemetry.claimsTotal,
    actual_ram: est.ram_bytes,
    entropy: telemetry.entropy,
    contradictions: telemetry.contradictions,
    token_saved: Math.max(0, (est.tokens_in + est.tokens_out) - (telemetry.tokensIn + telemetry.tokensOut)),
  } : (lastRun ? {
    actual_in: Math.round(lastRun.totalTokens * 0.7),
    actual_out: Math.round(lastRun.totalTokens * 0.3),
    actual_tools: lastRun.sources,
    actual_paths: lastRun.totalClaims,
    actual_states: lastRun.totalClaims * 1.5,
    actual_ram: est.ram_bytes,
    entropy: 0.12,
    contradictions: 0,
    token_saved: Math.round(lastRun.totalTokens * 0.25),
  } : zeroActuals());
  const panelElapsed = hasReal ? telemetry.elapsedMs / 1000 : (mode === "postrun" && lastRun ? lastRun.elapsedMs / 1000 : elapsed);
  const panel = aegisPanel(est, actual, panelElapsed);

  const realActual = lastRun ? {
    actual_time_s: lastRun.elapsedMs / 1000,
    actual_sources: lastRun.sources,
    actual_claims: lastRun.totalClaims,
    actual_verified: lastRun.verifiedClaims,
    actual_tokens: lastRun.totalTokens,
  } : null;

  function set<K extends keyof EstimateInput>(key: K, value: EstimateInput[K]) {
    setInput(prev => ({ ...prev, [key]: value }));
  }

  const isComplete = mode === "postrun" && lastRun !== null;
  const cards = [
    { icon: "⏱", label: "Time", value: isComplete ? `${(lastRun.elapsedMs / 1000).toFixed(1)}s` : `${est.time_s}s`, sub: isComplete ? "real-time" : "forecast wall time" },
    { icon: "🪙", label: "Tokens", value: isComplete ? `${(telemetry.tokensIn + telemetry.tokensOut).toLocaleString()}` : (est.tokens_in + est.tokens_out).toLocaleString(), sub: isComplete ? `${telemetry.tokensIn.toLocaleString()} in / ${telemetry.tokensOut.toLocaleString()} out` : `${est.tokens_in.toLocaleString()} in / ${est.tokens_out.toLocaleString()} out` },
    { icon: "🔧", label: "Tools", value: isComplete ? String(telemetry.toolCalls) : String(est.tools), sub: "web + anchor + verifier calls" },
    { icon: "🧭", label: "Paths", value: isComplete ? String(telemetry.hypotheses) : String(est.paths), sub: "council × worker branches" },
    { icon: "🎯", label: "Coverage", value: isComplete && lastRun?.measuredCoverage ? `${(lastRun.measuredCoverage * 100).toFixed(1)}%` : `${(est.coverage * 100).toFixed(1)}%`, sub: isComplete && lastRun ? `${lastRun.coverageNumerator}/${lastRun.coverageDenominator} facets` : "required facets" },
    { icon: "💾", label: "Sparse RAM", value: `${(est.ram_bytes / 1024).toFixed(1)} KB`, sub: "graph/state bookkeeping" },
  ];

  return (
    <div className="bg-zinc-50 pb-10">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {/* Header */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">AEGIS-PHI Resource Estimator</div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Pre-flight · live-run · post-run telemetry</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                Estimates auto-populate from the shared input and last run. Switch to <strong>Live</strong> during a GBSE run to see real-time deltas.
                Post-run calibrates forecast accuracy against measured actuals.
              </p>
            </div>
            <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 text-xs font-semibold">
              {(["preflight", "live", "postrun"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-2 ${mode === m ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-white"}`}>
                  {m === "preflight" ? "Pre-flight" : m === "live" ? "Live" : "Post-run"}
                  {m === "live" && busyState && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
                  {m === "postrun" && lastRun && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Live AEGIS-PHI HUD — real measured telemetry */}
        {hasReal && <HUD />}

        {/* Live activity indicator */}
        {mode === "live" && busyState && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase text-amber-700">Live run in progress</div>
              <div className="text-sm text-amber-900">{busyState}</div>
            </div>
            <div className="ml-auto font-mono text-sm text-amber-700">{elapsed.toFixed(1)}s elapsed</div>
          </div>
        )}

        {/* Post-run summary from real data */}
        {mode === "postrun" && lastRun && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">Real run data — {new Date(lastRun.finishedAt).toLocaleTimeString()}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div><div className="text-emerald-600 font-bold">Query</div><div className="text-zinc-800 truncate">{lastRun.query.slice(0, 60)}</div></div>
              <div><div className="text-emerald-600 font-bold">Elapsed</div><div className="font-mono font-bold text-zinc-900">{(lastRun.elapsedMs / 1000).toFixed(1)}s</div></div>
              <div><div className="text-emerald-600 font-bold">Sources</div><div className="font-mono font-bold text-zinc-900">{lastRun.sources}</div></div>
              <div><div className="text-emerald-600 font-bold">Claims</div><div className="font-mono font-bold text-zinc-900">{lastRun.verifiedClaims}/{lastRun.totalClaims} verified</div></div>
              {lastRun.constraints && (
                <div className="sm:col-span-4"><div className="text-emerald-600 font-bold">Constraints enforced</div><div className="font-mono text-zinc-800">{summarizeConstraints(lastRun.constraints)}</div></div>
              )}
            </div>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Controls */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-zinc-900">Pre-flight details</h2>
              {settings.deepResearch && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">4-Stage pipeline</span>}
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Target query (from shared input)</div>
                {input.query || "No query entered yet."}
              </div>
              {detectedConstraints && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-2 text-[11px] text-indigo-900">
                  Detected: {summarizeConstraints(detectedConstraints)}
                  {detectedConstraints.isShortHorizon && " · SHORT HORIZON — 1yr targets excluded"}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-zinc-600">
                  Tier
                  <select value={input.tier} onChange={e => set("tier", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                    {Object.values(TIERS).map(t => <option key={t.tier} value={t.tier}>T{t.tier} {t.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-zinc-600">
                  Driver
                  <select value={input.driver} onChange={e => set("driver", e.target.value as DriverId)} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                    {DRIVER_OPTIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
              </div>
              {input.driver && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2 text-[11px] text-zinc-600">
                  {DRIVER_OPTIONS.find(d => d.id === input.driver)?.notes}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-zinc-600">
                  Anchor mode
                  <select value={input.anchorMode} onChange={e => set("anchorMode", e.target.value as EstimateInput["anchorMode"])} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                    <option value="required">required</option>
                    <option value="preferred">preferred</option>
                    <option value="off">off</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-zinc-600">
                  Web access
                  <select value={input.webAccess} onChange={e => set("webAccess", e.target.value as EstimateInput["webAccess"])} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                    <option value="on">on</option>
                    <option value="trusted">trusted only</option>
                    <option value="off">off (anchor-only)</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-zinc-600">
                Verifier alpha {(input.verifierAlpha * 100).toFixed(0)}%
                <input type="range" min="0.1" max="0.4" step="0.01" value={input.verifierAlpha} onChange={e => set("verifierAlpha", Number(e.target.value))} className="mt-2 w-full" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-zinc-600">
                  Council width
                  <input type="number" min="1" max="32" value={input.councilWidth} onChange={e => set("councilWidth", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-zinc-600">
                  Worker depth
                  <input type="number" min="1" max="32" value={input.workerDepth} onChange={e => set("workerDepth", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Metric cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {cards.map(({ icon, label, value, sub }) => (
                <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                    <span>{icon}</span>{label}
                  </div>
                  <div className="mt-1.5 font-mono text-xl font-bold text-zinc-900">{value}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">{sub}</div>
                </div>
              ))}
            </div>

            {/* Coverage bar */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-700">Forecast coverage</span>
                <span className="font-mono text-sm font-bold text-indigo-700">{(est.coverage * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full" style={{ width: `${est.coverage * 100}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
                <span>Residual ~{(100 - est.coverage * 100).toFixed(0)}%: paywalled / post-cutoff / non-existent</span>
              </div>
            </div>

            {/* Calibration vs real run */}
            {mode === "postrun" && realActual && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-700">Calibration: forecast vs. real measured data</div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Calib label="Time" est={est.time_s} actual={realActual.actual_time_s} suffix="s" />
                  <Calib label="Sources" est={est.tools} actual={realActual.actual_sources} />
                  <Calib label="Claims" est={est.paths} actual={realActual.actual_claims} />
                  <Calib label="Verified" est={Math.round(est.paths * 0.6)} actual={realActual.actual_verified} />
                </div>
              </div>
            )}

            {/* AEGIS panel (ASCII) */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 shadow-sm overflow-x-auto">
              <pre className="whitespace-pre font-mono text-[11px] leading-snug text-emerald-200">{panel}</pre>
            </div>

            {/* Lifecycle phases */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-zinc-900">Run lifecycle phases</h2>
                <span className="font-mono text-xs text-zinc-500">progress {(progress * 100).toFixed(0)}%</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Pre-flight", desc: "Estimate before spending — edit tier, driver, anchor mode", active: mode === "preflight" },
                  { label: "Live", desc: "Estimate vs. actual deltas update in real time during run", active: mode === "live" },
                  { label: "Post-run", desc: "Calibration: measured actuals vs. forecast — Brier-style accuracy", active: mode === "postrun" },
                ].map(({ label, desc, active }) => (
                  <div key={label} className={`rounded-xl border p-3 ${active ? "border-indigo-300 bg-indigo-50" : "border-zinc-200 bg-zinc-50"}`}>
                    <div className="text-sm font-bold text-zinc-900">{label}</div>
                    <div className="mt-1 text-xs text-zinc-600">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
