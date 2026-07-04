import { useState } from "react";
import { newSessionSeed, type WilliamsPersona } from "../lib/williams-style";

interface Props {
  persona: WilliamsPersona;
  onReseed: (seed: number) => void;
  /** Legacy/optional callback so existing callers can react to persona changes. */
  onPersonaChange?: (p: WilliamsPersona) => void;
}

export function StylePersonaPanel({ persona, onReseed }: Props) {
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [seedInput, setSeedInput] = useState(persona.seed);

  function reroll() {
    if (pinned) return;
    const seed = newSessionSeed();
    setSeedInput(seed);
    onReseed(seed);
  }

  function applyManualSeed(s: number) {
    setSeedInput(s);
    onReseed(s);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 text-lg">✍️</div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold text-zinc-900">Style Persona: <span className="text-indigo-700">{persona.archetype.name}</span></div>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                persona.rarityTier === "Legendary" ? "bg-amber-100 text-amber-800" :
                persona.rarityTier === "Epic" ? "bg-fuchsia-100 text-fuchsia-800" :
                persona.rarityTier === "Rare" ? "bg-sky-100 text-sky-800" :
                persona.rarityTier === "Uncommon" ? "bg-emerald-100 text-emerald-800" :
                "bg-zinc-100 text-zinc-600"
              }`}>{persona.rarityTier} ({persona.rarityPercent}%)</span>
            </div>
            <div className="text-xs text-zinc-500">{persona.archetype.desc}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-600">seed {persona.seed}</span>
          <span className="text-zinc-400">{expanded ? "−" : "+"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={reroll}
              disabled={pinned}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Reroll persona
            </button>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin seed
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              Custom seed:
              <input
                type="number"
                value={seedInput}
                onChange={(e) => applyManualSeed(Number(e.target.value) >>> 0)}
                className="w-28 rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
              />
            </label>
            <button
              onClick={() => navigator.clipboard.writeText(String(persona.seed))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              title="Export this persona by copying its seed"
            >
              Export
            </button>
          </div>

          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">19 stylistic dimensions</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {persona.dimensionLabels.map((dim) => (
              <div key={dim.name} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-zinc-900">{dim.name}</div>
                  <div className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[9px] text-indigo-700">{dim.lesson}</div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-16 text-right text-[9px] text-zinc-500 leading-tight">{dim.lowLabel}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500"
                      style={{ width: `${dim.value * 100}%` }}
                    />
                    <div
                      className="absolute top-[-2px] h-3 w-1 rounded-full bg-zinc-900"
                      style={{ left: `calc(${dim.value * 100}% - 2px)` }}
                    />
                  </div>
                  <span className="w-16 text-[9px] text-zinc-500 leading-tight">{dim.highLabel}</span>
                </div>
                <div className="mt-1 text-right font-mono text-[10px] text-zinc-400">{dim.value.toFixed(2)}</div>
              </div>
            ))}
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold text-zinc-600 hover:text-zinc-900">View generated style instructions</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-4 font-mono text-xs leading-relaxed text-zinc-800">
              {persona.systemPromptFragment}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
