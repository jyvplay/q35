import { useState } from "react";
import { GEMINI_MODELS, type GeminiModel } from "../lib/connectors/gemini";
import type { SearchProvider } from "../lib/orchestrator";
import { useAppState } from "../lib/app-state";

interface Props {
  hypothesisModel: GeminiModel;
  setHypothesisModel: (m: GeminiModel) => void;
  scoringModel: GeminiModel;
  setScoringModel: (m: GeminiModel) => void;
  searchProvider: SearchProvider;
  setSearchProvider: (p: SearchProvider) => void;
  useJinaRerank: boolean;
  setUseJinaRerank: (b: boolean) => void;
  tier: number | "auto";
  setTier: (t: number | "auto") => void;
}

export function ConfigPanel(props: Props) {
  const [open, setOpen] = useState(false);
  const { keys, setKeys } = useAppState();
  const [show, setShow] = useState<Record<string, boolean>>({});

  function updateKey(k: "gemini" | "jina" | "serpapi" | "serpapiProxy" | "marketData", v: string) {
    setKeys(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-zinc-900">Dashboard configuration</span>
        <span className="text-zinc-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-zinc-200 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { k: "gemini", label: "Gemini / Gemma API key", ph: "AIza…" },
              { k: "jina", label: "Jina API key", ph: "jina_…" },
              { k: "serpapi", label: "SerpAPI key (optional)", ph: "(optional)" },
              { k: "serpapiProxy", label: "SerpAPI CORS proxy", ph: "https://proxy/?url=" },
              { k: "marketData", label: "Market data key (Alpha Vantage)", ph: "optional" },
            ] as { k: "gemini" | "jina" | "serpapi" | "serpapiProxy" | "marketData"; label: string; ph: string }[]).map(({ k, label, ph }) => (
              <div key={k} className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">{label}</label>
                <div className="relative">
                  <input
                    type={show[k] ? "text" : "password"}
                    value={(keys[k] as string) ?? ""}
                    onChange={e => updateKey(k, e.target.value)}
                    placeholder={ph}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-700">{show[k] ? "hide" : "show"}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Hypothesis generator</label>
              <select value={props.hypothesisModel} onChange={e => props.setHypothesisModel(e.target.value as GeminiModel)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Judge / synthesizer</label>
              <select value={props.scoringModel} onChange={e => props.setScoringModel(e.target.value as GeminiModel)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Search provider</label>
              <select value={props.searchProvider} onChange={e => props.setSearchProvider(e.target.value as SearchProvider)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                <option value="jina">Jina Search (s.jina.ai)</option>
                <option value="serpapi">SerpAPI</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Tier</label>
              <select value={props.tier} onChange={e => props.setTier(e.target.value === "auto" ? "auto" : Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                <option value="auto">Auto (adaptive)</option>
                {[0,1,2,3,4,5].map(n => <option key={n} value={n}>T{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col pt-5">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" checked={props.useJinaRerank} onChange={e => props.setUseJinaRerank(e.target.checked)} className="h-4 w-4 rounded" />
                Jina rerank
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
            Keys here are shared with the Chat tab (same localStorage). SerpAPI typically blocks browser CORS — use Jina or supply a proxy.
          </div>
        </div>
      )}
    </div>
  );
}
