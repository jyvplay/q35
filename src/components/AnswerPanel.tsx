import { useState } from "react";
import type { BeliefState } from "../lib/gbse/types";
import { useAppState } from "../lib/app-state";

interface Props { answer: string; state: BeliefState | null; }

export function AnswerPanel({ answer, state }: Props) {
  const [copied, setCopied] = useState(false);
  const { lastRun } = useAppState();

  function copyAnswer() {
    navigator.clipboard.writeText(answer).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  if (!answer) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-zinc-900 mb-2">Final synthesis</div>
        <div className="text-sm text-zinc-400">
          {lastRun ? `Last run: "${lastRun.query.slice(0, 80)}…" — ${lastRun.totalClaims} claims, ${lastRun.sources} sources` : "Run a query in the dashboard to see the synthesized answer here."}
        </div>
      </div>
    );
  }

  const committedH = state?.committed ? state.hyps[state.committed] : null;
  const isContested = state?.committed && !state.commitReason.startsWith("sprt");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
        <span className="text-sm font-bold text-zinc-900">Final synthesis</span>
        <div className="flex items-center gap-2">
          {state && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${isContested ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {state.commitReason}
            </span>
          )}
          <button onClick={copyAnswer} className="text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-700">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      {committedH && (
        <div className="border-b border-zinc-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          <span className="font-mono text-xs text-emerald-600">leading hypothesis: </span>
          {committedH.text}
        </div>
      )}
      <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-zinc-900">{answer}</div>
      {state && (
        <div className="border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400 flex gap-4 flex-wrap">
          <span>hypotheses: {Object.keys(state.hyps).length}</span>
          <span>living: {Object.values(state.hyps).filter(h => h.alive).length}</span>
          <span>evidence items: {Object.values(state.hyps).reduce((s, h) => s + h.evidence.length, 0)}</span>
        </div>
      )}
    </div>
  );
}
