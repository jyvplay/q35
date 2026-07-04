import { ADAPTERS } from "../lib/small-model-adapters";

const colors: Record<string, string> = {
  optional: "bg-slate-100 text-slate-700 border-slate-200",
  preferred: "bg-sky-50 text-sky-800 border-sky-200",
  required: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export function AdaptersPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Small-model adapters</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Make smaller drivers useful by externalizing truth</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
            These adapters describe how each driver is allowed to operate. The smaller the model, the stricter the anchor requirement and the more verification moves to external services.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADAPTERS.map((a) => (
            <article key={a.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">{a.label}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{a.role}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${colors[a.anchorRequirement]}`}>
                  anchor {a.anchorRequirement}
                </span>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Context" value={a.context} />
                <Row label="Tool mode" value={a.toolMode} />
                <Row label="Best for" value={a.bestFor} />
                <Row label="Caveat" value={a.caveat} />
              </dl>
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Degrade path</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.degradePath.map((step) => <span key={step} className="rounded bg-white px-2 py-1 text-xs font-mono text-zinc-700 shadow-sm">{step}</span>)}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900">Integration rule</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Adapters do not grant capabilities by assertion. At runtime the app probes keys, model availability, and tool responses. If the driver cannot maintain a reliable tool loop, the run degrades to anchor-only retrieval or abstains.
          </p>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">{label}</dt>
      <dd className="mt-1 leading-relaxed text-zinc-700">{value}</dd>
    </div>
  );
}