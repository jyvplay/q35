import { useAppState } from "../lib/app-state";
import { TIERS } from "../lib/gbse/tiers";
import { shortHash } from "../lib/sscp";
import { posterior as calcPosterior } from "../lib/gbse/engine";
import type { BeliefState } from "../lib/gbse/types";

interface Props {
  state?: BeliefState | null;
  tier?: number | null;
  totalTokens?: number;
  graphNodes?: number;
  graphEdges?: number;
  elapsedMs?: number;
  running?: boolean;
  className?: string;
}

/**
 * AEGIS-PHI Engine HUD
 * Fully wired to REAL live telemetry from the shared app state.
 * No mock data. Values update in real-time as pipeline stages advance.
 */
export function HUD(props: Props) {
  const { telemetry: t, sscpReceipt, lastRun } = useAppState();

  // Bayesian metrics from local state if provided (Dashboard), else from telemetry
  const state = props.state ?? null;
  const post = state ? calcPosterior(state) : {};
  const ranked = Object.entries(post).sort((a, b) => b[1] - a[1]);
  const leaderP = ranked[0]?.[1] ?? 0;

  const tier = props.tier ?? lastRun?.tier ?? t.tier;
  const spec = tier !== null && tier !== undefined ? TIERS[tier] : null;
  
  // Real measured values
  const elapsed = props.elapsedMs ?? t.elapsedMs;
  const totalTokens = props.totalTokens ?? (t.tokensIn + t.tokensOut);
  const tools = t.toolCalls;
  const sources = t.sources;
  
  // Progress & Status
  const running = props.running ?? t.running;
  const status = running ? "RUNNING" : (t.phase === "complete" ? "SEALED" : "IDLE");
  const statusColor = running 
    ? "text-sky-700 bg-sky-50 border-sky-200" 
    : (t.phase === "complete" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-zinc-500 bg-zinc-50 border-zinc-200");

  const progress = Math.min(100, (t.pipelineStage / 7) * 100);

  function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm transition-all duration-300">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">{label}</div>
        <div className={`mt-0.5 font-mono text-base font-bold ${accent ? "text-indigo-700" : "text-zinc-900"}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[10px] text-zinc-500 truncate" title={sub}>{sub}</div>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm backdrop-blur-sm ${props.className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-5 w-5 place-items-center rounded bg-zinc-900 font-bold text-[10px] text-white">Φ</div>
          <span className="text-sm font-bold text-zinc-900 tracking-tight">AEGIS-PHI Engine HUD</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusColor}`}>{status}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Time" value={`${(elapsed / 1000).toFixed(1)}s`} sub={spec ? `cap ${spec.maxSeconds}s` : "real-time"} accent={running} />
        <Stat label="Tokens" value={fmtNum(totalTokens)} sub={`${fmtNum(t.tokensIn)} in / ${fmtNum(t.tokensOut)} out`} />
        <Stat label="Tools" value={String(tools)} sub={`${t.searchCalls} search · ${t.modelCalls} model`} />
        <Stat label="Sources" value={String(sources)} sub="verified docs" />
        <Stat label="Hypotheses" value={String(state ? Object.keys(state.hyps).length : t.hypotheses)} sub="active paths" />
        <Stat label={state ? "Leader P" : "Claims"} value={state ? leaderP.toFixed(3) : `${t.claimsVerified}/${t.claimsTotal}`} sub={state ? "posterior" : "grounded"} accent={state ? leaderP > 0.7 : t.claimsVerified > 0} />
        <Stat label="Coverage" value={t.measuredCoverage === null ? "—" : `${(t.measuredCoverage * 100).toFixed(0)}%`} sub={t.measuredCoverage === null ? "not measured" : `${t.coverageNumerator}/${t.coverageDenominator} facets`} accent={t.measuredCoverage !== null && t.measuredCoverage > 0.7} />
        <Stat label="SSCP Seal" value={sscpReceipt ? shortHash(sscpReceipt.stateRootHash) : "—"} sub={sscpReceipt ? "SHA-256 Merkle" : "pending seal"} accent={!!sscpReceipt} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Pipeline Execution Trace</span>
            <span>Stage {t.pipelineStage}/7 ({progress.toFixed(0)}%)</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            <div 
              className={`h-full transition-all duration-700 ease-out ${running ? "bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.4)]" : "bg-emerald-500"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-3 border-l border-zinc-200 pl-4 sm:flex">
          <Indicator label="Injection" ok={t.injectionsBlocked === 0} warn={t.injectionsBlocked > 0} />
          <Indicator label="Sanitizer" ok={t.sanitizerStrips === 0} warn={t.sanitizerStrips > 0} />
          <Indicator label="Anchor" ok={t.anchorCoverage !== null && t.anchorCoverage > 0.5} warn={t.anchorCoverage !== null && t.anchorCoverage <= 0.5} off={t.anchorCoverage === null} />
        </div>
      </div>
      
      {running && (
        <div className="mt-3 flex items-center gap-2 border-t border-zinc-200/50 pt-2 text-[11px] text-zinc-600 italic">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
          Active Reasoning Trace: {t.phase}
        </div>
      )}
    </div>
  );
}

function Indicator({ label, warn, off }: { label: string; ok: boolean; warn?: boolean; off?: boolean }) {
  const color = off ? "bg-zinc-300" : warn ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
  if (n >= 1000) return (n/1000).toFixed(1) + "K";
  return String(n);
}
