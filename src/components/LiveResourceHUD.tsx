import { useAppState } from "../lib/app-state";
import { TIERS } from "../lib/gbse/tiers";

/**
 * Live Resource HUD — StarCraft style real-time resource monitor.
 * Shows est vs act for Time, Tokens, Tools, Paths, States.
 */
export function LiveResourceHUD() {
  const { telemetry, lastRun } = useAppState();
  
  const tier = lastRun?.tier ?? telemetry.tier;
  const spec = tier !== null && tier !== undefined ? TIERS[tier] : null;
  
  // Pre-flight estimates
  const estTime = spec?.maxSeconds ?? 0;
  const estTokens = spec?.maxTokens ?? 0;
  const estTools = spec?.evidenceProbes ?? 0;
  const estPaths = spec?.hypothesisCount ?? 0;
  
  // Live actuals
  const actTime = telemetry.elapsedMs / 1000;
  const actTokens = telemetry.tokensIn + telemetry.tokensOut;
  const actTools = telemetry.toolCalls;
  const actPaths = telemetry.hypotheses;
  
  const isRunning = telemetry.running;
  
  function Diff({ act, est, unit = "", lowerIsBetter = true }: { act: number; est: number; unit?: string; lowerIsBetter?: boolean }) {
    const delta = act - est;
    if (est === 0) return <span className="text-zinc-400">0{unit}</span>;
    const isWarn = lowerIsBetter ? delta > 0 : delta < 0;
    return (
      <span className={isWarn ? "text-amber-600" : "text-emerald-600"}>
        {delta > 0 ? "+" : ""}{delta.toFixed(0)}{unit}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] leading-tight text-emerald-400 shadow-2xl">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-bold uppercase tracking-widest">AEGIS-PHI ::</span>
          <span className="text-white font-bold">{spec?.name ?? "IDLE"}</span>
          <span className="text-zinc-500 font-bold">::</span>
          <span className={isRunning ? "text-sky-400 animate-pulse" : "text-zinc-600"}>
            {isRunning ? "LIVE" : "IDLE"}
          </span>
        </div>
        <div className="text-zinc-500">{actTime.toFixed(1)}s</div>
      </div>

      <div className="grid gap-x-6 gap-y-1">
        <div className="grid grid-cols-[80px_1fr_1fr_1fr] border-b border-zinc-900 pb-1">
          <span className="text-zinc-500 font-bold">METRIC</span>
          <span className="text-zinc-500 text-right uppercase">EST</span>
          <span className="text-zinc-500 text-right uppercase">ACT</span>
          <span className="text-zinc-500 text-right uppercase">Δ</span>
        </div>
        
        <div className="grid grid-cols-[80px_1fr_1fr_1fr]">
          <span className="text-emerald-300">TIME</span>
          <span className="text-right">{estTime}s</span>
          <span className="text-right text-white">{actTime.toFixed(1)}s</span>
          <span className="text-right"><Diff act={actTime} est={estTime} unit="s" /></span>
        </div>

        <div className="grid grid-cols-[80px_1fr_1fr_1fr]">
          <span className="text-emerald-300">TOKENS</span>
          <span className="text-right">{(estTokens/1000).toFixed(0)}K</span>
          <span className="text-right text-white">{(actTokens/1000).toFixed(1)}K</span>
          <span className="text-right"><Diff act={actTokens} est={estTokens} /></span>
        </div>

        <div className="grid grid-cols-[80px_1fr_1fr_1fr]">
          <span className="text-emerald-300">TOOLS</span>
          <span className="text-right">{estTools}</span>
          <span className="text-right text-white">{actTools}</span>
          <span className="text-right"><Diff act={actTools} est={estTools} /></span>
        </div>

        <div className="grid grid-cols-[80px_1fr_1fr_1fr]">
          <span className="text-emerald-300">PATHS</span>
          <span className="text-right">{estPaths}</span>
          <span className="text-right text-white">{actPaths}</span>
          <span className="text-right"><Diff act={actPaths} est={estPaths} lowerIsBetter={false} /></span>
        </div>

        <div className="grid grid-cols-[80px_1fr_1fr_1fr]">
          <span className="text-emerald-300">STATES</span>
          <span className="text-right">{estPaths * 3}</span>
          <span className="text-right text-white">{telemetry.claimsTotal}</span>
          <span className="text-right"><Diff act={telemetry.claimsTotal} est={estPaths * 3} lowerIsBetter={false} /></span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-900 pt-2 text-zinc-500">
        <div className="flex gap-4">
          <span>SOURCES <span className="text-white">{telemetry.sources}</span></span>
          <span>CLAIMS <span className="text-white">{telemetry.claimsVerified}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span>VERDICT</span>
          <span className={lastRun ? "text-emerald-500" : "text-zinc-700"}>{lastRun ? "SEALED" : "PENDING"}</span>
        </div>
      </div>
    </div>
  );
}
