/**
 * V15 Overlay — floating, additive UI mounted OVER the original app.
 * Provides the V15 Pipeline toggle + Calibration button without modifying
 * a single line of the npm package's ChatApp / GBSDashboard / etc.
 *
 * Placement: minimized by default as a tiny left-center rail. This avoids
 * covering the original ChatApp input bar (bottom) or global header (top).
 * The engineer can expand it only when needed.
 * Aesthetic matches the original app (zinc / indigo palette, rounded-xl).
 */
import { useState } from "react";
import { V15Toggle } from "./V15Toggle";
import { V15CalibrationDialog } from "./V15CalibrationDialog";

export function V15Overlay() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [minimized, setMinimized] = useState(true);

  return (
    <>
      <div
        className="fixed left-2 top-1/2 z-[9998] flex -translate-y-1/2 flex-col items-start gap-2"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur px-3 py-2 shadow-xl"
          style={{ pointerEvents: "auto" }}
        >
          {minimized ? (
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-900"
              title="Expand V15 controls"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-indigo-600 text-[10px] font-bold text-white">V15</span>
              <span>▲</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-600 to-emerald-500 text-[10px] font-bold text-white">V15</div>
              <V15Toggle />
              <button
                onClick={() => setDialogOpen(true)}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100"
                title="Open live V15 vs Baseline calibration harness"
              >
                📊 Calibrate
              </button>
              <button
                onClick={() => setMinimized(true)}
                className="rounded-lg border border-zinc-200 px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100"
                title="Minimize"
              >▼</button>
            </div>
          )}
          {!minimized && (
            <div className="mt-1 text-[9px] leading-tight text-zinc-400">
              Additive · original app unchanged when OFF · A/B testable
            </div>
          )}
        </div>
      </div>

      <V15CalibrationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
