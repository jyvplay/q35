import { useMemo, useState, type ReactNode } from "react";
import { AnchorBaselinePanel } from "./AnchorBaselinePanel";
import { useAppState } from "../lib/app-state";
import { extractConstraints, summarizeConstraints } from "../lib/constraints";
import { StylePersonaPanel } from "./StylePersonaPanel";
import { MemoryStressPanel } from "./MemoryStressPanel";
import { PrismaFetchTracePanel } from "./PrismaFetchTracePanel";

type Section = "depth" | "tools" | "verification" | "output" | "runtime" | "governance";

export function ControlPlanePage() {
  const { input, lastRun, persona, reseedPersona, keys, model, settings, setSetting, debugEvents } = useAppState();
  const constraints = input.trim() ? extractConstraints(input) : null;

  const [config, setConfig] = useState({
    research_tier: "AUTO",
    reasoning_budget: "AUTO",
    council_width: 5,
    worker_depth: 9,
    web_access: "on",
    anchor_mode: "preferred",
    verifier_alpha: 25,
    entailment_threshold: 80,
    require_verbatim: true,
    falsification_gate: true,
    output_format: "report",
    citation_density: "every-claim",
    driver_model: model,
    token_ceiling: 300000,
    time_ceiling: 1200,
    audit_receipt: true,
    cors_proxy: "",
  });
  const [active, setActive] = useState<Section>("depth");
  const serialized = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const set = (key: keyof typeof config, value: string | number | boolean) =>
    setConfig(p => ({ ...p, [key]: value }));

  const keysConfigured = Object.entries(keys).filter(([, v]) => !!v).map(([k]) => k);

  return (
    <div className="bg-zinc-50 pb-10">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {/* Header */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">ATLAS-DR Control Plane</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Power-user dials for tiered research</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            These controls map to the chat and GBSE strategy. All values here are advisory — enable them then run a query.
          </p>
        </section>

        {/* Live shared state mirror — proves cross-page state */}
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Live shared state mirror (proves all pages share the same context)</div>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="font-bold text-emerald-700">Current input:</span><div className="mt-0.5 font-mono text-zinc-800 truncate">{input || "(empty)"}</div></div>
            <div><span className="font-bold text-emerald-700">Constraints:</span><div className="mt-0.5 font-mono text-zinc-800">{constraints ? summarizeConstraints(constraints) : "none"}</div></div>
            <div><span className="font-bold text-emerald-700">Persona:</span><div className="mt-0.5 font-mono text-zinc-800">{persona.archetype.name} (seed {persona.seed})</div></div>
            <div><span className="font-bold text-emerald-700">Keys configured:</span><div className="mt-0.5 font-mono text-zinc-800">{keysConfigured.join(", ") || "none"}</div></div>
            {lastRun && (
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="font-bold text-emerald-700">Last run:</span>
                <div className="mt-0.5 font-mono text-zinc-800">
                  "{lastRun.query.slice(0, 80)}…" → {lastRun.totalClaims} claims · {lastRun.sources} sources · {(lastRun.elapsedMs / 1000).toFixed(1)}s
                </div>
              </div>
            )}
          </div>
        </section>

        {/* App-level settings */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-zinc-900">App-level toggles</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Toggle label="4-Stage pipeline" sub="Logic Engine + Copywriter pass" checked={settings.deepResearch} onChange={v => setSetting("deepResearch", v)} accent />
            <Toggle label="Show debug trace" sub="Debug events appear on all pages" checked={settings.showDebugTrace} onChange={v => setSetting("showDebugTrace", v)} />
            <Toggle label="Auto-audit connectors" sub="Ping keys on page load" checked={settings.autoAuditConnectors} onChange={v => setSetting("autoAuditConnectors", v)} />
          </div>
        </section>

        {/* Main config panels */}
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm h-fit">
            {(["depth", "tools", "verification", "output", "runtime", "governance"] as Section[]).map(s => (
              <button key={s} onClick={() => setActive(s)}
                className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold capitalize transition-colors ${active === s ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}>
                {s}
              </button>
            ))}
          </aside>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            {active === "depth" && <Panel title="Depth">
              <Select label="Research tier" value={config.research_tier} options={["AUTO","0","1","2","3","4","5"]} onChange={v => set("research_tier", v)} />
              <Select label="Reasoning budget" value={config.reasoning_budget} options={["AUTO","low","medium","high","exhaustive"]} onChange={v => set("reasoning_budget", v)} />
              <NumberInput label="Council width" value={config.council_width} min={1} max={32} onChange={v => set("council_width", v)} />
              <NumberInput label="Worker depth" value={config.worker_depth} min={1} max={32} onChange={v => set("worker_depth", v)} />
            </Panel>}
            {active === "tools" && <Panel title="Tool scope">
              <Select label="Web access" value={config.web_access} options={["on","trusted","off"]} onChange={v => set("web_access", v)} />
              <Select label="Anchor mode" value={config.anchor_mode} options={["required","preferred","off"]} onChange={v => set("anchor_mode", v)} />
              <label className="block text-xs font-semibold text-zinc-600 mt-2">
                Custom CORS Proxy
                <input 
                  value={(config as any).cors_proxy ?? ""} 
                  placeholder="https://cors-anywhere.herokuapp.com/" 
                  onChange={e => set("cors_proxy", e.target.value)} 
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" 
                />
              </label>
              <Hint text="If direct browser fetch fails due to CORS, the app will rotate through public proxies. Use a custom one for higher reliability." />
            </Panel>}
            {active === "verification" && <Panel title="Verification">
              <RangeInput label="Verifier alpha" value={config.verifier_alpha} min={10} max={40} suffix="%" onChange={v => set("verifier_alpha", v)} />
              <RangeInput label="Entailment threshold" value={config.entailment_threshold} min={60} max={95} suffix="%" onChange={v => set("entailment_threshold", v)} />
              <Toggle label="Require verbatim quote spans" checked={config.require_verbatim} onChange={v => set("require_verbatim", v)} />
              <Toggle label="Falsification gate (construct ¬H)" checked={config.falsification_gate} onChange={v => set("falsification_gate", v)} />
            </Panel>}
            {active === "output" && <Panel title="Output">
              <Select label="Format" value={config.output_format} options={["report","compact","json","slides","docs"]} onChange={v => set("output_format", v)} />
              <Select label="Citation density" value={config.citation_density} options={["every-claim","load-bearing-only"]} onChange={v => set("citation_density", v)} />
            </Panel>}
            {active === "runtime" && <Panel title="Runtime">
              <Select label="Driver model" value={config.driver_model} options={["frontier","gemma4-31b","qwen3.6","gemma4-e4b","apple-ondevice","bonsai-8b"]} onChange={v => set("driver_model", v)} />
              <NumberInput label="Token ceiling" value={config.token_ceiling} min={2000} max={3000000} onChange={v => set("token_ceiling", v)} />
              <NumberInput label="Time ceiling (seconds)" value={config.time_ceiling} min={15} max={5400} onChange={v => set("time_ceiling", v)} />
              <div className="col-span-2 pt-2">
                <MemoryStressPanel />
                <div className="mt-3"><PrismaFetchTracePanel /></div>
              </div>
            </Panel>}
            {active === "governance" && <Panel title="Governance">
              <Toggle label="Audit receipt (SSCP/Merkle ledger)" checked={config.audit_receipt} onChange={v => set("audit_receipt", v)} />
              <Hint text="Safety kernel, data-only context rule, injection defenses, and the 126 failure-mode guards remain active regardless of these settings." />
            </Panel>}

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-950 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">atlas.config.json (portable)</div>
              <pre className="max-h-64 overflow-auto text-xs leading-relaxed text-emerald-100">{serialized}</pre>
            </div>
          </section>
        </div>

        {/* Williams style persona panel */}
        <StylePersonaPanel persona={persona} onReseed={seed => reseedPersona(seed)} />

        {/* Anchor baseline panel */}
        <AnchorBaselinePanel />

        {/* Debug events (cross-page) */}
        {settings.showDebugTrace && (
          <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 shadow-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-400">Cross-page debug events (all pages)</div>
            <div className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-0.5">
              {debugEvents.length === 0
                ? <div className="text-zinc-500 py-2">No events yet. Run a query in Chat or Dashboard.</div>
                : debugEvents.slice(-60).map((e, i) => <div key={i} className="text-emerald-200">{e}</div>)
              }
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-zinc-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return <label className="block text-xs font-semibold text-zinc-600">{label}<select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>;
}
function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return <label className="block text-xs font-semibold text-zinc-600">{label}<input type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" /></label>;
}
function RangeInput({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return <label className="block text-xs font-semibold text-zinc-600">{label} {value}{suffix}<input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-2 w-full" /></label>;
}
function Toggle({ label, sub, checked, onChange, accent }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; accent?: boolean }) {
  return (
    <label className={`flex items-start justify-between rounded-xl border px-3 py-2.5 cursor-pointer ${accent && checked ? "border-indigo-300 bg-indigo-50" : "border-zinc-200"}`}>
      <div><div className="text-sm font-semibold text-zinc-700">{label}</div>{sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}</div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded mt-0.5 shrink-0" />
    </label>
  );
}
function Hint({ text }: { text: string }) {
  return <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900">{text}</div>;
}
