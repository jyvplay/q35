import { useMemo, useState } from "react";
import { useAppState } from "../lib/app-state";
import { readMemoryReport, safeClusterWidth, safeNDeepPasses, safeSloopPages, settleHeap } from "../lib/memory-governor";
import { runStressTestAdvanced, type StressTestReport } from "../lib/memory-stress-tests";
import { estimateRuntime, runtimeEstimatorSmoke } from "../lib/runtime-estimator";
import { intelligenceOf, MODEL_INTELLIGENCE } from "../lib/model-intelligence";

// User's reported failing config — exposed as a one-click diagnostic button.
const REQUESTED_CONFIG = { sloopPages: 8, clusterWidth: 8, nDeepPasses: 4 };

export function MemoryStressPanel() {
  const { settings, setSetting, pushDebugEvent, model } = useAppState();
  const [report, setReport] = useState<StressTestReport | null>(null);
  const [running, setRunning] = useState(false);

  const [testConfig, setTestConfig] = useState({
    sloopPages: settings.sloopPages,
    nDeepPasses: settings.nDeepMaxPasses,
    clusterWidth: settings.clusterSize,
  });

  const coreIntel = intelligenceOf(model);
  const topModel = (Object.entries(MODEL_INTELLIGENCE) as [string, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const memReport = readMemoryReport(0);

  const estimate = useMemo(() => estimateRuntime({
    sources: 18,
    hypotheses: 4,
    deepResearch: true,
    forceSloop: true,
    sloopPages: testConfig.sloopPages,
    clusterWidth: testConfig.clusterWidth,
    nDeepPasses: testConfig.nDeepPasses,
    modelFamily: coreIntel >= 85 ? "gemini-fast" : coreIntel >= 75 ? "gemma-31b" : "other",
  }), [testConfig, coreIntel]);

  const requestedEstimate = useMemo(() => estimateRuntime({
    sources: 18, hypotheses: 4, deepResearch: true, forceSloop: true,
    sloopPages: REQUESTED_CONFIG.sloopPages,
    clusterWidth: REQUESTED_CONFIG.clusterWidth,
    nDeepPasses: REQUESTED_CONFIG.nDeepPasses,
    modelFamily: "gemma-31b",
  }), []);

  const smoke = useMemo(() => {
    try { return runtimeEstimatorSmoke(); } catch (e) { return null; }
  }, []);

  async function runWith(cfg: { sloopPages: number; clusterWidth: number; nDeepPasses: number; label?: string }) {
    setRunning(true);
    setReport(null);
    pushDebugEvent(`[MemStress] starting ${cfg.label ?? "custom"} test (pages=${cfg.sloopPages} cluster=${cfg.clusterWidth} nDeep=${cfg.nDeepPasses})`);
    try {
      const r = await runStressTestAdvanced(cfg);
      setReport(r);
      pushDebugEvent(`[MemStress] complete: ${r.passed ? "PASS" : "FAIL"} peak=${r.peakMB}MB duration=${r.durationMs}ms`);
      await settleHeap(20);
    } finally {
      setRunning(false);
    }
  }

  const safeCluster = safeClusterWidth(testConfig.clusterWidth);
  const safePages = safeSloopPages(testConfig.sloopPages);
  const safePasses = safeNDeepPasses(testConfig.nDeepPasses);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600">Memory Stress Test</div>
        <div className="mt-1 text-sm font-bold">Find your real max research configuration</div>
        <div className="text-xs text-zinc-500">Runs deterministic in-browser workloads that mimic SLOOP / N-Deep / Cluster memory patterns. Test passes only if heap stays below 92% pressure throughout.</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-zinc-600">SLOOP pages</span>
          <input type="number" min={1} max={16} className="rounded border px-2 py-1 font-mono" value={testConfig.sloopPages}
            onChange={e => setTestConfig(p => ({ ...p, sloopPages: Math.max(1, Math.min(16, parseInt(e.target.value) || 8)) }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-zinc-600">N-Deep passes</span>
          <input type="number" min={1} max={12} className="rounded border px-2 py-1 font-mono" value={testConfig.nDeepPasses}
            onChange={e => setTestConfig(p => ({ ...p, nDeepPasses: Math.max(1, Math.min(12, parseInt(e.target.value) || 4)) }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-zinc-600">Cluster width</span>
          <input type="number" min={1} max={20} className="rounded border px-2 py-1 font-mono" value={testConfig.clusterWidth}
            onChange={e => setTestConfig(p => ({ ...p, clusterWidth: Math.max(1, Math.min(20, parseInt(e.target.value) || 8)) }))} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => runWith({ ...testConfig, label: "custom" })}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {running ? "Running..." : "Run Custom Test"}
        </button>
        <button
          onClick={() => runWith({ ...REQUESTED_CONFIG, label: "requested" })}
          disabled={running}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          title="SLOOP 8 · Cluster 8 · N-Deep 4 — the configuration that crashed in 5/6 field tests"
        >
          Run requested config (SLOOP 8 · Cluster 8 · N-Deep 4)
        </button>
        <button onClick={() => {
          setSetting("sloopPages", testConfig.sloopPages);
          setSetting("nDeepMaxPasses", testConfig.nDeepPasses);
          setSetting("clusterSize", testConfig.clusterWidth);
          pushDebugEvent("[MemStress] applied config to settings");
        }} className="rounded-lg border px-3 py-1.5 text-xs">Apply to Settings</button>
        <div className="ml-auto text-[10px] font-mono text-zinc-500">
          live: {memReport.usedMB}MB / ~{memReport.softLimitMB}MB · {memReport.level}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="font-semibold text-zinc-900">Estimated runtime — current config</div>
          <div className="mt-1 font-mono font-bold">~{estimate.estimatedSeconds}s · {estimate.llmCalls} LLM calls</div>
          {estimate.breakdown && (
            <div className="mt-2 space-y-0.5 font-mono text-[10px] text-zinc-600">
              {estimate.breakdown.map(s => <div key={s.step}>{s.step}: {s.seconds.toFixed(0)}s</div>)}
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-zinc-200 text-[10px]">
            Governor safe caps → Pages: {safePages} / Passes: {safePasses} / Cluster: {safeCluster}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="font-semibold text-zinc-900">Requested-config estimator</div>
          <div className="mt-1 font-mono font-bold">SLOOP 8 · Cluster 8 · N-Deep 4 → ~{requestedEstimate.estimatedSeconds}s</div>
          {smoke && <div className="mt-2 text-[10px] text-emerald-700">✓ Deterministic estimator smoke check passed</div>}
          <div className="mt-2 pt-2 border-t border-zinc-200 text-[10px]">
            <span className="font-bold">Intelligence:</span> {model} = {coreIntel}/100<br />
            Top: {topModel?.[0]} ({topModel?.[1]}/100)<br />
            <span className="text-zinc-500">N-Deep ties broken by Arena rank.</span>
          </div>
        </div>
      </div>

      {report && (
        <div className="space-y-3">
          <div className={`rounded-xl border p-3 text-sm font-semibold ${report.passed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            {report.passed ? "PASS — configuration stayed under the 92% pressure ceiling." : "FAIL — the requested configuration risks OOM on this device."}
            <span className="ml-2 font-mono text-xs">peak {report.peakMB}MB · {report.durationMs}ms</span>
            {report.recommendedConfig && (
              <div className="mt-1 text-xs">
                Suggested safe config: SLOOP {report.recommendedConfig.sloopPages} · Cluster {report.recommendedConfig.clusterWidth} · N-Deep {report.recommendedConfig.nDeepPasses}
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.steps.map(step => (
              <div key={step.name} className={`rounded-lg border p-3 text-xs ${step.ok ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
                <div className="font-semibold text-zinc-900">{step.name}</div>
                <div className="mt-1 font-mono text-zinc-700">{step.details}</div>
                <div className="mt-1 font-mono text-zinc-500">
                  pressure {(step.pressureBefore * 100).toFixed(0)}% → {(step.pressureAfter * 100).toFixed(0)}% · {step.ms.toFixed(0)}ms
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] font-mono text-zinc-600">
            start {report.startReport.usedMB}MB / {report.startReport.limitMB}MB → end {report.endReport.usedMB}MB / {report.endReport.limitMB}MB ({(report.endReport.pressure * 100).toFixed(0)}% pressure)
          </div>
        </div>
      )}
    </div>
  );
}
