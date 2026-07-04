import { useState } from "react";
import { useAppState } from "../lib/app-state";
import {
  OMEGA_TEMPLATES,
  STYLE_OVERRIDES,
  SELECTION_MATRIX,
  unifiedHeaderBlock,
  buildTemplatePrompt,
  type OmegaTemplate,
  type OmegaSection,
} from "../lib/omega-templates";

function uid() { return "tpl-" + Math.random().toString(36).slice(2, 9); }

export function TemplatesPage() {
  const { settings, setSetting, templates, addTemplate, deleteTemplate, sscpReceipt } = useAppState();
  const [preview, setPreview] = useState<string>(settings.activeTemplateId);
  const [tab, setTab] = useState<"masters" | "overrides" | "matrix" | "custom">("masters");

  // Custom template builder
  const [draft, setDraft] = useState<OmegaTemplate>({
    id: uid(), name: "", tagline: "", replaces: "Custom", sections: [], styleHooks: [], custom: true,
  });
  const [secDraft, setSecDraft] = useState<OmegaSection>({ id: "§1", title: "", hint: "", pages: "" });

  const selected = templates.find(t => t.id === preview) ?? OMEGA_TEMPLATES[0];
  const customTemplates = templates.filter(t => t.custom);

  function addSection() {
    if (!secDraft.title.trim()) return;
    setDraft(d => ({ ...d, sections: [...d.sections, { ...secDraft }] }));
    setSecDraft({ id: `§${draft.sections.length + 2}`, title: "", hint: "", pages: "" });
  }
  function saveDraft() {
    if (!draft.name.trim() || draft.sections.length === 0) return;
    addTemplate({ ...draft, id: draft.id || uid(), custom: true });
    setDraft({ id: uid(), name: "", tagline: "", replaces: "Custom", sections: [], styleHooks: [], custom: true });
    setSecDraft({ id: "§1", title: "", hint: "", pages: "" });
    setTab("masters");
  }

  const headerPreview = unifiedHeaderBlock({
    title: "[REPORT TITLE — ACTION-ORIENTED]",
    audience: "[CLIENT/AUDIENCE]",
    date: new Date().toLocaleDateString("en-US"),
    classification: "INTERNAL",
    sscpHash: sscpReceipt ? sscpReceipt.stateRootHash.slice(0, 16) + "…" : "[computed at runtime]",
    evidenceTier: sscpReceipt ? sscpReceipt.evidenceTier : "TOOL",
    model: settings.activeTemplateId ? "Gemma 4 31B / Gemini" : "[model/version]",
    cutoff: "2026",
    styleMode: settings.styleMode,
  });

  return (
    <div className="bg-zinc-50 pb-10">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {/* Header */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">OMEGA Templates</div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">7 master templates · 40 legacy overrides · custom builder</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                Templates inject a section skeleton + style-modulation hooks into synthesis. The anti-hallucination stack
                (constraints, temporal anchor, sanitizer, SSCP receipt) still wraps every stage.
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
              <input type="checkbox" checked={settings.templateEnabled} onChange={e => setSetting("templateEnabled", e.target.checked)} className="h-4 w-4 rounded" />
              Apply template to outputs
            </label>
          </div>
          {/* Active template selector */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-600">
              Active template
              <select value={settings.activeTemplateId} onChange={e => { setSetting("activeTemplateId", e.target.value); setPreview(e.target.value); }}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.custom ? " (custom)" : ""} — {t.tagline}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-600">
              Style mode (override token)
              <select value={settings.styleMode} onChange={e => setSetting("styleMode", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                <option value="OMEGA-DEFAULT">OMEGA-DEFAULT</option>
                {STYLE_OVERRIDES.map(o => <option key={o.token} value={o.token}>{o.token} — {o.legacy}</option>)}
              </select>
            </label>
          </div>
        </section>

        {/* Unified header block preview */}
        <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 shadow-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-400">Unified header block (injected into every templated output)</div>
          <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] leading-snug text-emerald-200">{headerPreview}</pre>
        </section>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 w-fit">
          {([["masters", "7 Masters"], ["overrides", "40 Overrides"], ["matrix", "Decision Matrix"], ["custom", "Custom Builder"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>
          ))}
        </div>

        {/* Masters */}
        {tab === "masters" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-2">
              {OMEGA_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setPreview(t.id)}
                  className={`block w-full rounded-xl border p-3 text-left transition-colors ${preview === t.id ? "border-indigo-300 bg-indigo-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-900">{t.name}</span>
                    <span className="text-[10px] text-zinc-400">{t.sections.length} sections</span>
                  </div>
                  <div className="text-xs text-indigo-700">{t.tagline}</div>
                  <div className="mt-1 text-[11px] text-zinc-500 line-clamp-1">Replaces: {t.replaces}</div>
                </button>
              ))}
            </div>
            <TemplateDetail t={selected} styleMode={settings.styleMode} />
          </div>
        )}

        {/* Overrides */}
        {tab === "overrides" && (
          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-900">Style Override Registry — 40 legacy templates</div>
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr className="border-b border-zinc-200">
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Token</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Legacy template</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Maps to</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Preservation hooks</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {STYLE_OVERRIDES.map(o => (
                    <tr key={o.token} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-indigo-700">{o.token}</td>
                      <td className="px-3 py-2 text-zinc-900">{o.legacy}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-emerald-700">{o.mapsTo}</td>
                      <td className="px-3 py-2 text-zinc-600">{o.hooks}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => setSetting("styleMode", o.token)} className="rounded bg-zinc-900 px-2 py-1 text-[10px] font-bold text-white hover:bg-zinc-700">Use</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Matrix */}
        {tab === "matrix" && (
          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-900">Selection Decision Matrix</div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-2 text-left font-semibold text-zinc-500">If your task is…</th>
                  <th className="px-4 py-2 text-left font-semibold text-zinc-500">Default template</th>
                  <th className="px-4 py-2 text-left font-semibold text-zinc-500">Override if…</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {SELECTION_MATRIX.map(r => (
                  <tr key={r.task} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 text-zinc-800">"{r.task}"</td>
                    <td className="px-4 py-2.5"><span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">{r.def}</span></td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.override}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Custom builder */}
        {tab === "custom" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-zinc-900">Build a custom template</h2>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Template name (e.g. OMEGA-LEGAL-MEMO)"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
              <input value={draft.tagline} onChange={e => setDraft(d => ({ ...d, tagline: e.target.value }))} placeholder="Tagline (e.g. Litigation risk memo)"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
              <input value={draft.styleHooks.join(", ")} onChange={e => setDraft(d => ({ ...d, styleHooks: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                placeholder="Style hooks, comma-separated"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                <div className="text-xs font-bold text-zinc-700">Add section</div>
                <div className="grid grid-cols-[60px_1fr] gap-2">
                  <input value={secDraft.id} onChange={e => setSecDraft(s => ({ ...s, id: e.target.value }))} placeholder="§1" className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                  <input value={secDraft.title} onChange={e => setSecDraft(s => ({ ...s, title: e.target.value }))} placeholder="Section title" className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                </div>
                <input value={secDraft.hint} onChange={e => setSecDraft(s => ({ ...s, hint: e.target.value }))} placeholder="What goes here (hint)" className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                <input value={secDraft.pages} onChange={e => setSecDraft(s => ({ ...s, pages: e.target.value }))} placeholder="Pages (e.g. 1-2 pages)" className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                <button onClick={addSection} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">+ Add section</button>
              </div>

              {draft.sections.length > 0 && (
                <div className="rounded-xl border border-zinc-200 p-3 space-y-1">
                  <div className="text-xs font-bold text-zinc-700">{draft.sections.length} sections</div>
                  {draft.sections.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-700"><span className="font-mono text-indigo-700">{s.id}</span> {s.title}</span>
                      <button onClick={() => setDraft(d => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }))} className="text-rose-500 hover:text-rose-700">remove</button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={saveDraft} disabled={!draft.name.trim() || draft.sections.length === 0}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                Save custom template
              </button>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-zinc-900">Saved custom templates ({customTemplates.length})</h2>
              {customTemplates.length === 0 ? (
                <div className="text-sm text-zinc-400 py-8 text-center">No custom templates yet. Build one on the left — it persists in localStorage and appears in the active-template selector.</div>
              ) : (
                <div className="space-y-2">
                  {customTemplates.map(t => (
                    <div key={t.id} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-zinc-900">{t.name}</div>
                          <div className="text-xs text-indigo-700">{t.tagline} · {t.sections.length} sections</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setPreview(t.id); setTab("masters"); }} className="rounded bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-200">Preview</button>
                          <button onClick={() => deleteTemplate(t.id)} className="rounded bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateDetail({ t, styleMode }: { t: OmegaTemplate; styleMode: string }) {
  const [showPrompt, setShowPrompt] = useState(false);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">{t.name}</h2>
          <p className="text-sm text-indigo-700">{t.tagline}</p>
        </div>
        {t.custom && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">CUSTOM</span>}
      </div>
      <p className="mt-1 text-xs text-zinc-500">Replaces: {t.replaces}</p>

      <div className="mt-4 space-y-2">
        {t.sections.map(s => (
          <div key={s.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900"><span className="font-mono text-indigo-700">{s.id}</span> {s.title}</span>
              {s.pages && <span className="text-[10px] text-zinc-400">{s.pages}</span>}
            </div>
            <p className="mt-1 text-xs text-zinc-600">{s.hint}</p>
          </div>
        ))}
      </div>

      {t.styleHooks.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Style modulation hooks</div>
          <div className="flex flex-wrap gap-1">
            {t.styleHooks.map(h => <span key={h} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">{h}</span>)}
          </div>
        </div>
      )}

      <button onClick={() => setShowPrompt(!showPrompt)} className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800">
        {showPrompt ? "Hide" : "Show"} injected synthesis prompt
      </button>
      {showPrompt && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-100">
          {buildTemplatePrompt(t, styleMode)}
        </pre>
      )}
    </div>
  );
}
