/**
 * V15 Pipeline toggle — reads/writes localStorage via v15-state (isolated from npm state).
 * Default OFF. When OFF, the original app runs unchanged.
 */
import { useEffect, useState } from "react";
import { getV15Enabled, setV15Enabled, subscribeV15 } from "../lib/v15-state";

export function V15Toggle({ compact }: { compact?: boolean }) {
  const [on, setOn] = useState<boolean>(() => getV15Enabled());

  useEffect(() => subscribeV15(setOn), []);

  return (
    <label
      title="V15 Rigor Guard Pipeline — additive verification (default OFF). Original app runs unchanged when unchecked."
      className={`flex items-center gap-1.5 cursor-pointer select-none rounded-lg border px-2 py-1 transition-colors ${
        on ? "border-indigo-300 bg-indigo-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
      }`}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setV15Enabled(e.target.checked)}
        className="h-3.5 w-3.5 accent-indigo-600"
      />
      <span className={`text-[11px] font-bold ${on ? "text-indigo-800" : "text-zinc-600"}`}>
        {compact ? "V15" : "V15 Pipeline"}
      </span>
      {on && !compact && (
        <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">ON</span>
      )}
    </label>
  );
}
