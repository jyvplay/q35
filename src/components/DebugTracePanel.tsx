/**
 * Debug/Reasoning Trace Panel
 * Shows detailed pipeline execution trace for debugging.
 */

import { useMemo } from "react";
import type { PipelineTrace } from "../lib/pipeline";
import { getCacheStats } from "../lib/precache";

interface Props {
  trace: PipelineTrace[];
  telemetry?: {
    tokensIn: number;
    tokensOut: number;
    toolCalls: number;
    hypotheses: number;
    sources: number;
    claimsTotal: number;
    claimsVerified: number;
    elapsedMs: number;
  };
}

export function DebugTracePanel({ trace, telemetry }: Props) {
  const cacheStats = useMemo(() => getCacheStats(), []);

  const phaseIcons: Record<string, string> = {
    "1": "🎯",
    "1.5": "📦",
    "2": "🧠",
    "2.5": "🔢",
    "3": "✍️",
    "4": "🧹",
    "5": "🔒",
    "6": "📜",
    "7": "🔐",
  };

  const phaseColors: Record<string, string> = {
    "1": "text-indigo-600",
    "1.5": "text-sky-600",
    "2": "text-indigo-700",
    "2.5": "text-violet-700",
    "3": "text-emerald-700",
    "4": "text-amber-700",
    "5": "text-indigo-800",
    "6": "text-violet-800",
    "7": "text-emerald-800",
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-zinc-900">Debug / Reasoning Trace</span>
          <span className="text-xs font-mono text-zinc-500">{trace.length} steps</span>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          Cache: {Object.entries(cacheStats).map(([k, v]) => `${k}:${v.size}/${v.totalHits}`).join(" ")}
        </div>
      </div>

      <div className="p-4">
        {/* Pipeline Progress */}
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Pipeline Execution Trace</div>
          <div className="flex items-center gap-1">
            {Array.from({ length: 7 }).map((_, i) => {
              const stageNum = (i + 1).toString();
              const stageTrace = trace.find(t => t.stage.toString().startsWith(stageNum));
              return (
                <div key={i} className="flex-1">
                  <div className={`h-2 rounded-full ${stageTrace ? "bg-emerald-500" : "bg-zinc-200"}`} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-zinc-400 mt-1">
            <span>Stage 1</span>
            <span>Stage 7</span>
          </div>
        </div>

        {/* Detailed Trace */}
        <div className="space-y-2">
          {trace.length === 0 ? (
            <div className="text-center text-zinc-400 py-8">
              No trace available. Run a query to see pipeline execution.
            </div>
          ) : (
            trace.map((t, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${t.ok ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{phaseIcons[t.stage.toString()] || "•"}</span>
                  <span className={`text-xs font-bold ${phaseColors[t.stage.toString()] || "text-zinc-600"}`}>
                    Stage {t.stage}
                  </span>
                  <span className={`text-xs font-mono ${t.ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-auto">
                    {new Date(t.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm text-zinc-800">{t.label}</div>
                {(() => {
                  if (!t.data) return null;
                  const content = typeof t.data === "string" ? t.data : JSON.stringify(t.data);
                  return <pre className="mt-1 text-[10px] font-mono text-zinc-500 overflow-x-auto whitespace-pre-wrap">{content.slice(0, 200)}</pre>;
                })()}
              </div>
            ))
          )}
        </div>

        {/* Telemetry Summary */}
        {telemetry && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Telemetry Summary</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-zinc-500">Tokens In:</span> <span className="font-mono font-bold">{telemetry.tokensIn.toLocaleString()}</span></div>
              <div><span className="text-zinc-500">Tokens Out:</span> <span className="font-mono font-bold">{telemetry.tokensOut.toLocaleString()}</span></div>
              <div><span className="text-zinc-500">Tool Calls:</span> <span className="font-mono font-bold">{telemetry.toolCalls}</span></div>
              <div><span className="text-zinc-500">Hypotheses:</span> <span className="font-mono font-bold">{telemetry.hypotheses}</span></div>
              <div><span className="text-zinc-500">Sources:</span> <span className="font-mono font-bold">{telemetry.sources}</span></div>
              <div><span className="text-zinc-500">Claims:</span> <span className="font-mono font-bold">{telemetry.claimsVerified}/{telemetry.claimsTotal}</span></div>
              <div><span className="text-zinc-500">Elapsed:</span> <span className="font-mono font-bold">{(telemetry.elapsedMs / 1000).toFixed(1)}s</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
