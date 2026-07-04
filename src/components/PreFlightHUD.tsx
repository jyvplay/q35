import { useState } from "react";
import { useAppState } from "../lib/app-state";
import { TIERS } from "../lib/gbse/tiers";

/**
 * Pre-flight Resource HUD
 * Shows the estimated cost and coverage before the run begins.
 * Red-team requirement: "totally additive and not replace any items that are currently working."
 */
export function PreFlightHUD() {
  const { input, settings, model } = useAppState();
  const [tier, setTier] = useState(3);
  
  // Calculate estimate using logic from research doc
  const spec = TIERS[tier];
  
  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">Resource HUD · Pre-Flight</div>
          <h2 className="text-lg font-bold text-zinc-900">T{tier} {spec.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={tier} 
            onChange={(e) => setTier(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-semibold focus:outline-none focus:border-indigo-500"
          >
            {Object.values(TIERS).map(t => (
              <option key={t.tier} value={t.tier}>Tier {t.tier}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Time (Est)</div>
          <div className="text-lg font-mono font-bold text-zinc-900">{spec.maxSeconds}s</div>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Token Cap</div>
          <div className="text-lg font-mono font-bold text-zinc-900">{(spec.maxTokens / 1000).toFixed(0)}K</div>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Probes</div>
          <div className="text-lg font-mono font-bold text-zinc-900">{spec.evidenceProbes}</div>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Coverage</div>
          <div className="text-lg font-mono font-bold text-emerald-600">{(spec.forecastCoverage * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
        <div className="flex items-center gap-4">
          <span>Driver: <span className="font-mono text-zinc-700">{model}</span></span>
          <span>4-Stage: <span className={settings.deepResearch ? "text-indigo-600 font-bold" : ""}>{settings.deepResearch ? "ON" : "OFF"}</span></span>
        </div>
        <div className="font-mono italic truncate max-w-[200px]">
          {input.slice(0, 40)}{input.length > 40 ? "..." : ""}
        </div>
      </div>
    </div>
  );
}
