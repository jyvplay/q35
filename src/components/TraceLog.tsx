import { useEffect, useRef, useState } from "react";
import type { TraceEvt } from "../lib/orchestrator";
import { useAppState } from "../lib/app-state";

const COLORS: Record<TraceEvt["level"], string> = {
  info: "text-zinc-700",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-rose-700",
};

const PHASE_ICONS: Record<string, string> = {
  tier: "🎯", hypotheses: "🧠", state: "📦", search: "🔍",
  rerank: "🎚", evidence: "📊", score: "⚖", commit: "🔒",
  synthesis: "✍", tier0: "⚡", error: "🔴",
};

interface Props {
  events: TraceEvt[];
  title?: string;
}

export function TraceLog({ events, title = "Reasoning trace" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TraceEvt["level"] | "all">("all");
  const { debugEvents, settings } = useAppState();

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length, debugEvents.length]);

  const shown = filter === "all" ? events : events.filter(e => e.level === filter);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
        <div className="flex items-center gap-1">
          {(["all", "ok", "warn", "error"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${filter === f ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {shown.length === 0 && debugEvents.length === 0 ? (
          <div className="py-6 text-center text-zinc-400">
            No trace events yet. Run a query in the GBSE dashboard to see the Bayesian engine trace here.
          </div>
        ) : (
          <>
            {shown.map((e, i) => (
              <div key={i} className="mb-0.5 flex gap-2 border-b border-zinc-50 pb-0.5">
                <span className="shrink-0 text-zinc-400">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className="shrink-0">{PHASE_ICONS[e.phase] ?? "•"}</span>
                <span className="shrink-0 text-zinc-500">[{e.phase}]</span>
                <span className={`${COLORS[e.level]} break-words min-w-0`}>{e.message}</span>
              </div>
            ))}
            {/* If debug mode on, also show chat debug events */}
            {settings.showDebugTrace && debugEvents.length > 0 && (
              <>
                <div className="mt-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border-t border-zinc-100 pt-2">Chat pipeline debug</div>
                {debugEvents.map((e, i) => (
                  <div key={`d${i}`} className="mb-0.5 text-emerald-700">{e}</div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Live count */}
      <div className="border-t border-zinc-100 px-4 py-1.5 text-[10px] text-zinc-400 flex items-center justify-between">
        <span>{shown.length} events{filter !== "all" ? ` (${filter} only)` : ""}</span>
        {events.length > 0 && (
          <span>
            {events.filter(e => e.level === "ok").length} ok ·{" "}
            {events.filter(e => e.level === "warn").length} warn ·{" "}
            {events.filter(e => e.level === "error").length} err
          </span>
        )}
      </div>
    </div>
  );
}
