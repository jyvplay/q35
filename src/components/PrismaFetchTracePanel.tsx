import { useState } from "react";
import { useAppState } from "../lib/app-state";
import { prismaFetchHealth, prismaFetchSearch, prismaFetchRead, getPrismaFetchReadOptionsFromSettings, type PrismaFetchReadMode } from "../lib/connectors/prismafetch";

export function PrismaFetchTracePanel() {
  const { settings, setSetting, pushDebugEvent } = useAppState();
  const [health, setHealth] = useState<string>("unknown");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [readResult, setReadResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const mode = (settings.prismafetchReadMode || "auto") as PrismaFetchReadMode;

  async function checkHealth() {
    setBusy(true);
    const ok = await prismaFetchHealth();
    setHealth(ok ? "ok" : "down");
    setBusy(false);
    pushDebugEvent(`[PrismaFetch] health = ${ok ? "ok" : "down"}`);
  }

  async function runSearch() {
    setBusy(true);
    try {
      const { results } = await prismaFetchSearch("NIH social determinants funding 2024");
      setSearchResults(results.slice(0, 5));
      pushDebugEvent(`[PrismaFetch] search returned ${results.length} results`);
    } catch (e: any) {
      pushDebugEvent(`[PrismaFetch] search error: ${e.message}`);
    }
    setBusy(false);
  }

  async function runRead() {
    setBusy(true);
    try {
      const opts = getPrismaFetchReadOptionsFromSettings({
        prismafetchReadMode: settings.prismafetchReadMode,
        prismafetchOcr: settings.prismafetchOcr,
      });
      const r = await prismaFetchRead("https://grants.nih.gov", opts);
      setReadResult(r);
      pushDebugEvent(`[PrismaFetch] read ${r.markdown.length} chars (mode=${opts.mode})`);
    } catch (e: any) {
      pushDebugEvent(`[PrismaFetch] read error: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
      <div className="text-sm font-bold">PrismaFetch RC10 Tester — health, search, read</div>

      <div className="flex gap-2 text-xs">
        <button onClick={checkHealth} disabled={busy} className="rounded bg-zinc-900 px-3 py-1 text-white">Health</button>
        <button onClick={runSearch} disabled={busy} className="rounded border px-3 py-1">Search test</button>
        <button onClick={runRead} disabled={busy} className="rounded border px-3 py-1">Read test</button>
      </div>

      <div className="text-xs font-mono">Server: {settings.prismafetchUrl} — status: {health}</div>

      <div className="text-xs">
        Read mode:
        <select className="ml-2 border px-2 py-0.5" value={mode}
          onChange={e => setSetting("prismafetchReadMode", e.target.value as PrismaFetchReadMode)}>
          {["auto", "fast_static", "render_headless", "visual_only"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="ml-3 inline-flex items-center gap-1">
          <input type="checkbox" checked={!!settings.prismafetchOcr} onChange={e => setSetting("prismafetchOcr", e.target.checked)} />
          OCR
        </label>
      </div>

      {searchResults.length > 0 && (
        <div className="text-xs bg-zinc-50 p-2 border rounded">
          {searchResults.map((r, i) => <div key={i}>• {r.title} — {r.url}</div>)}
        </div>
      )}

      {readResult && (
        <div className="text-xs bg-zinc-50 p-2 border rounded font-mono max-h-40 overflow-auto">
          {readResult.markdown.slice(0, 800)}
        </div>
      )}
    </div>
  );
}
