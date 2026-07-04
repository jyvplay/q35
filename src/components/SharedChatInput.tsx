// A single chat input rendered at the app shell level. Same input text
// everywhere; submitting it routes the user to the chat tab and runs the
// pipeline. All pages share this state via AppStateContext.

import { useEffect, useRef } from "react";
import { useAppState } from "../lib/app-state";
import { extractConstraints, summarizeConstraints } from "../lib/constraints";

interface Props {
  onSubmit: () => void;
  /** Optional: hide the run button (e.g., on non-chat pages where submit is the global one). */
  hideRunHint?: boolean;
}

export function SharedChatInput({ onSubmit, hideRunHint }: Props) {
  const { input, setInput, busyState, model } = useAppState();
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Live preview of detected hard constraints — the user can SEE what the
  // model will be forced to respect before they submit.
  const constraints = input.trim() ? extractConstraints(input) : null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busyState) onSubmit();
        }}
        className="flex gap-2.5"
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (input.trim() && !busyState) onSubmit();
            }
          }}
          placeholder="Ask a question. Time horizons, tickers, and format hints become deterministic constraints..."
          rows={1}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!input.trim() || busyState !== null}
          className="self-end whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busyState ? "Working..." : "Ground & Answer"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        {!hideRunHint && <span>⌘↩ to send · model: <span className="font-mono text-zinc-700">{model}</span></span>}
        {constraints && (
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] text-indigo-800">
            constraints → {summarizeConstraints(constraints)}
          </span>
        )}
        {busyState && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            {busyState}
          </span>
        )}
      </div>
    </div>
  );
}
