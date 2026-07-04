import { useEffect, useRef, useState } from "react";
import { ConfigPanel } from "./ConfigPanel";
import { HypothesisPanel } from "./HypothesisPanel";
import { TraceLog } from "./TraceLog";
import { HUD } from "./HUD";
import { GraphView } from "./GraphView";
import { AnswerPanel } from "./AnswerPanel";
import { TestPanel } from "./TestPanel";
import { FailureModesPanel } from "./FailureModesPanel";
import { ReportOSPanel } from "./ReportOSPanel";
import { LiveResourceHUD } from "./LiveResourceHUD";
import type { GeminiModel } from "../lib/connectors/gemini";
import { runResearch, type ApiKeys as OrchKeys, type SearchProvider, type TraceEvt } from "../lib/orchestrator";
import type { BeliefState } from "../lib/gbse/types";
import type { RelevanceGraph } from "../lib/gbse/graph";
import { useAppState } from "../lib/app-state";
import { extractConstraints, summarizeConstraints } from "../lib/constraints";
import { TIERS } from "../lib/gbse/tiers";

const EXAMPLES = [
  "Is a heat pump lower-carbon than a gas furnace in a cold climate?",
  "Does intermittent fasting cause meaningful weight loss in healthy adults?",
  "Is Rust faster than Go for I/O-bound network services?",
  "What are the key failure modes of lithium-ion battery packs at scale?",
];

export function GBSDashboard() {
  const app = useAppState();
  const keys = app.keys;

  const [hypothesisModel, setHypothesisModel] = useState<GeminiModel>("gemini-2.5-flash");
  const [scoringModel, setScoringModel] = useState<GeminiModel>("gemini-2.5-flash-lite");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("jina");
  const [useJinaRerank, setUseJinaRerank] = useState(true);
  const [tier, setTier] = useState<number | "auto">("auto");

  const orchKeys: OrchKeys = {
    gemini: keys.gemini,
    jina: keys.jina,
    serpapi: keys.serpapi,
    serpapiProxy: keys.serpapiProxy,
  };

  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<TraceEvt[]>([]);
  const [state, setState] = useState<BeliefState | null>(null);
  const [graph, setGraph] = useState<RelevanceGraph | null>(null);
  const [answer, setAnswer] = useState("");
  const [totalTokens, setTotalTokens] = useState(0);
  const [actualTier, setActualTier] = useState<number | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startMs), 200);
    return () => window.clearInterval(id);
  }, [running, startMs]);

  const constraints = app.input.trim() ? extractConstraints(app.input) : null;
  const tierSpec = actualTier !== null ? TIERS[actualTier] : null;

  // Prefer this page's own run; otherwise show the shared belief state/graph
  // produced by the legacy Bayesian engine on the LAST chat input (real data).
  const liveState = state ?? app.beliefState;
  const liveGraph = graph ?? app.relevanceGraph;

  async function handleRun() {
    if (!keys.gemini) { setError("Gemini API key required (set in Chat → Keys)."); return; }
    if (!app.input.trim()) { setError("Enter a query in the shared input above."); return; }
    setError(null); setEvents([]); setState(null); setGraph(null);
    setAnswer(""); setTotalTokens(0); setActualTier(null);
    setRunning(true); setStartMs(Date.now()); setElapsedMs(0);
    app.pushDebugEvent("GBSE dashboard run started");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runResearch({
        query: app.input, keys: orchKeys, hypothesisModel, scoringModel,
        searchProvider, useJinaRerank,
        tierOverride: tier === "auto" ? undefined : tier,
        signal: controller.signal,
        onEvent: (e) => {
          setEvents(prev => [...prev, e]);
          app.pushDebugEvent(`[GBSE] [${e.phase}] ${e.message}`);
          if (e.phase === "tier" && e.data && typeof e.data === "object" && "tier" in e.data) {
            setActualTier((e.data as { tier: number }).tier);
          }
        },
        onState: (s, g, toks) => {
          setState({ ...s, hyps: { ...s.hyps } });
          setGraph(g);
          setTotalTokens(toks);
        },
      });
      setState(result.state); setGraph(result.graph);
      setAnswer(result.finalAnswer); setTotalTokens(result.totalTokens);
      setActualTier(result.tier);
      app.setLastRun({
        query: app.input, model: hypothesisModel as unknown as import("../lib/models").ModelId,
        finalAnswer: result.finalAnswer, totalTokens: result.totalTokens,
        elapsedMs: Date.now() - startMs, sources: result.graph?.nodes.size ?? 0,
        verifiedClaims: 0, totalClaims: Object.keys(result.state.hyps).length,
        constraints: constraints ?? undefined, startedAt: startMs, finishedAt: Date.now(),
      });
      app.pushDebugEvent(`GBSE run complete — ${Object.keys(result.state.hyps).length} hypotheses`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setEvents(prev => [...prev, { ts: Date.now(), phase: "error", level: "error", message: msg }]);
    } finally { setRunning(false); }
  }

  return (
    <div className="bg-zinc-50 pb-10">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {/* Header */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Advanced Dashboard</div>
              <h1 className="mt-0.5 text-xl font-bold text-zinc-900">GBSE — Bayesian Belief Search Engine</h1>
              <p className="mt-1 text-sm text-zinc-500">Log-odds · Wald SPRT · Signed Personalized PageRank · Hypothesis pruning</p>
            </div>
            {tierSpec && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Active tier</div>
                <div className="font-mono text-lg font-bold text-indigo-900">{tierSpec.name}</div>
                <div className="text-[10px] text-indigo-600">{(tierSpec.forecastCoverage * 100).toFixed(0)}% coverage · {(tierSpec.maxTokens / 1000).toFixed(0)}K tokens</div>
              </div>
            )}
          </div>
        </div>

        <ConfigPanel
          hypothesisModel={hypothesisModel} setHypothesisModel={setHypothesisModel}
          scoringModel={scoringModel} setScoringModel={setScoringModel}
          searchProvider={searchProvider} setSearchProvider={setSearchProvider}
          useJinaRerank={useJinaRerank} setUseJinaRerank={setUseJinaRerank}
          tier={tier} setTier={setTier}
        />

        {/* Shared query input */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Research query (shared across all pages)</label>
            {constraints && (
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] text-indigo-800">
                constraints: {summarizeConstraints(constraints)}
              </span>
            )}
          </div>
          <textarea
            value={app.input}
            onChange={e => app.setInput(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-indigo-500"
            placeholder="Query is shared with Chat tab. Edits here appear there and vice versa."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={handleRun} disabled={running || !app.input.trim()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {running ? "Running…" : "Run Bayesian Search"}
            </button>
            {running && (
              <button onClick={() => { abortRef.current?.abort(); setRunning(false); }}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100">
                Stop
              </button>
            )}
            <div className="flex flex-wrap gap-1">
              {EXAMPLES.map(q => (
                <button key={q} onClick={() => app.setInput(q)} disabled={running}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">
                  {q.slice(0, 38)}…
                </button>
              ))}
            </div>
          </div>
          {error && <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        </div>

        {/* Live Resource HUD */}
        <LiveResourceHUD />

        {/* AEGIS-PHI HUD */}
        <div className="grid md:grid-cols-2 gap-4">
          <HUD state={liveState} tier={actualTier} totalTokens={totalTokens}
            graphNodes={liveGraph?.nodes.size ?? 0} graphEdges={liveGraph?.edges.length ?? 0}
            elapsedMs={elapsedMs} running={running} />
          <LiveResourceHUD />
        </div>

        {/* Coverage bar */}
        {tierSpec && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-zinc-900">Forecast coverage</span>
              <span className="font-mono text-sm font-bold text-indigo-700">{(tierSpec.forecastCoverage * 100).toFixed(0)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-1000"
                style={{ width: `${tierSpec.forecastCoverage * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              <span>0% (no coverage)</span>
              <span>Residual: ~{(100 - tierSpec.forecastCoverage * 100).toFixed(0)}% (paywalled/post-cutoff)</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* Hypotheses + Trace */}
        <div className="grid gap-4 lg:grid-cols-2">
          <HypothesisPanel state={liveState} />
          <div className="flex flex-col" style={{ minHeight: 420 }}>
            <TraceLog events={events} title="GBSE reasoning trace" />
          </div>
        </div>

        {/* Graph */}
        <GraphView graph={liveGraph} />

        {/* ReportOS v3 calculation engines + verification gates */}
        <ReportOSPanel />

        {/* Answer + Tests */}
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <AnswerPanel answer={answer || (app.beliefState ? app.lastRun?.finalAnswer ?? "" : "")} state={liveState} />
          <TestPanel />
        </div>

        <FailureModesPanel />
      </div>
    </div>
  );
}
