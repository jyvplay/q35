import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../lib/app-state";
import { readMemoryReport, safeNDeepPasses, type MemoryReport } from "../lib/memory-governor";

export function MemoryMonitor() {
  const [report, setReport] = useState<MemoryReport>(() => readMemoryReport(0));
  const { messages, debugEvents, reasoningTrace } = useAppState();

  // Cheap retained-state estimate. Do not JSON.stringify the full state here;
  // long SLOOP/N-Deep runs make that allocation the browser-freeze trigger.
  const approxStateMB = useMemo(() => {
    let bytes = 0;
    for (const m of messages) {
      bytes += (m.content?.length ?? 0) * 2;
      for (const tr of m.toolResults ?? []) bytes += ((tr.content?.length ?? 0) + (tr.title?.length ?? 0) + (tr.url?.length ?? 0)) * 2;
      bytes += (m.claims?.length ?? 0) * 64;
      bytes += (m.pipelineTrace?.length ?? 0) * 32;
    }
    for (const e of debugEvents) bytes += e.length * 2;
    bytes += reasoningTrace.length * 128;
    return Math.round((bytes / 1048576) * 10) / 10;
  }, [messages, debugEvents, reasoningTrace]);

  useEffect(() => {
    const id = setInterval(() => setReport(readMemoryReport(approxStateMB)), 2000);
    return () => clearInterval(id);
  }, [approxStateMB]);

  const effectivePct = Math.round(report.pressure * 100);
  const tone = report.level === "critical" ? "text-rose-600" : report.level === "warn" ? "text-amber-600" : report.level === "elevated" ? "text-amber-500" : "text-emerald-600";
  const barColor = report.level === "critical" ? "bg-rose-500" : report.level === "warn" ? "bg-amber-500" : report.level === "elevated" ? "bg-amber-400" : "bg-emerald-500";
  const label = report.heapAvailable ? `${report.usedMB}MB / ~${report.softLimitMB}MB safe` : `state~${approxStateMB}MB / ~${report.softLimitMB}MB safe`;

  return (
    <div
      className="inline-flex items-center gap-1.5 text-[10px] font-mono"
      title={`Heap ${report.usedMB}MB / ${report.softLimitMB}MB safe; raw ${report.limitMB}MB; state ~${approxStateMB}MB; pressure ${report.level}`}
      suppressHydrationWarning
    >
      <span className={`font-bold ${tone}`}>{label}</span>
      <div className="h-1.5 w-16 rounded-full bg-zinc-200 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, effectivePct)}%` }} />
      </div>
      {report.level === "critical" && <span className="text-rose-500 font-bold animate-pulse">OOM risk</span>}
      {report.level === "warn" && <span className="text-amber-500 font-bold animate-pulse">high mem</span>}
    </div>
  );
}

export function getSafeNDeepCap(requested: number, sourceChars = 0): number {
  return safeNDeepPasses(requested, sourceChars, readMemoryReport(0));
}
