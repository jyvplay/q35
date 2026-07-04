/**
 * V15 Grounding shim — additive live web retrieval for the calibration pipeline.
 *
 * Reuses the ORIGINAL app's grounding stack (searchWithGroundingFallback, which
 * itself sequences PrismaFetch → OG browser scraper → Jina backup) so the
 * calibration draft is grounded with the SAME retrieval as the live app.
 *
 * Sub-backend selection lets the calibration UI test each layer independently:
 *  - ogScraper: OG browser scraper + academic APIs (secondary layer)
 *  - prismafetch: local PrismaFetch service (primary layer if reachable)
 *  - jina: Jina cloud (backup layer, needs key)
 *  - searxng: SearXNG metasearch (self-hosted, no API key, aggregates Google/Bing/DDG/Wikipedia)
 *
 * Returns a compact, prompt-ready evidence block plus structured sources so the
 * grounding can be threaded through EVERY subsequent N-Deep pass.
 */
import { searchWithGroundingFallback } from "@/lib/jina";
import { browserScraperSearch } from "@/lib/browser-search-scraper";
import {
  getPrismaFetchSettings,
  prismaFetchSearch,
  resolvePrismaFetchAvailability,
} from "@/lib/connectors/prismafetch";

export interface GroundingBackends { ogScraper?: boolean; prismafetch?: boolean; jina?: boolean; searxng?: boolean }

export interface GroundingResult {
  ok: boolean;
  provider: string;
  count: number;
  evidenceBlock: string;   // prompt-ready, capped
  sources: { title: string; url: string; content: string }[];
  error?: string;
}

const K_KEYS = "veritas.keys.v3";
function getKeys(): { jina?: string; prismafetchUrl?: string } {
  try {
    const raw = localStorage.getItem(K_KEYS);
    const prismafetchUrl = getPrismaFetchSettings().prismafetchUrl;
    if (!raw) return { prismafetchUrl };
    const p = JSON.parse(raw);
    return { jina: p?.jina, prismafetchUrl };
  } catch { return { prismafetchUrl: getPrismaFetchSettings().prismafetchUrl }; }
}

export async function groundQuestion(opts: {
  question: string;
  backends?: GroundingBackends;
  depth?: number;
  onDebug?: (m: string) => void;
}): Promise<GroundingResult> {
  const b = opts.backends ?? { ogScraper: true, prismafetch: false, jina: false };
  const keys = getKeys();
  const depth = opts.depth ?? 6;

  const selected = !!b.ogScraper || !!b.prismafetch || !!b.jina;
  if (!selected) {
    return { ok: false, provider: "disabled", count: 0, evidenceBlock: "", sources: [], error: "all web backends disabled" };
  }

  const normalize = (provider: string, results: any[]): GroundingResult => {
    const sources = (results ?? []).slice(0, depth * 2).map(r => ({
      title: String(r.title ?? "").slice(0, 200),
      url: String(r.url ?? ""),
      content: String((r.content ?? r.description ?? "")).slice(0, 700),
    })).filter(s => s.url);
    if (sources.length === 0) return { ok: false, provider, count: 0, evidenceBlock: "", sources: [], error: "no sources returned" };
    const evidenceBlock = `LIVE RETRIEVED EVIDENCE (${provider}, ${sources.length} sources — cite as [S#], never fabricate beyond this):\n` +
      sources.map((s, i) => `[S${i + 1}] ${s.title}\n${s.content}`).join("\n---\n");
    return { ok: true, provider, count: sources.length, evidenceBlock, sources };
  };

  try {
    // Exact backend routing: use ONLY selected backends in app order.
    if (b.prismafetch) {
      const availability = await resolvePrismaFetchAvailability(keys.prismafetchUrl);
      if (availability.ok) {
        try {
          const local = await prismaFetchSearch(opts.question, { baseUrl: availability.baseUrl, count: depth });
          const out = normalize(`prismafetch-local:${local.backend}`, local.results);
          if (out.ok) return out;
          opts.onDebug?.(`PrismaFetch returned 0 usable sources`);
        } catch (e: any) {
          opts.onDebug?.(`PrismaFetch failed (${e?.message ?? "error"})`);
        }
      } else {
        opts.onDebug?.(`PrismaFetch unavailable (${availability.reason ?? "offline"})`);
      }
    }

    if (b.ogScraper) {
      try {
        const results = await browserScraperSearch(opts.question, { count: depth, onDebug: opts.onDebug });
        const out = normalize("browser-scraper", results);
        if (out.ok) return out;
        opts.onDebug?.(`OG scraper returned 0 usable sources`);
      } catch (e: any) {
        opts.onDebug?.(`OG scraper failed (${e?.message ?? "error"})`);
      }
    }

    if (b.jina) {
      const run = await searchWithGroundingFallback(opts.question, keys.jina ?? "", depth, {
        forceJina: true,
        allowJinaFallback: true,
        prismaEnabled: false,
        onDebug: opts.onDebug,
      });
      const out = normalize("jina", run.results);
      if (out.ok) return out;
    }

    // SearXNG metasearch (self-hosted, no API key)
    if (b.searxng) {
      try {
        const searxngUrl = localStorage.getItem("veritas.v15.searxngUrl") || "http://localhost:8080";
        const res = await fetch(`${searxngUrl}/search?q=${encodeURIComponent(opts.question)}&format=json`, {
          headers: { "Accept": "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          const results = (json.results || []).slice(0, depth);
          const out = normalize("searxng", results);
          if (out.ok) return out;
        }
        opts.onDebug?.(`SearXNG returned ${res.status}`);
      } catch (e: any) {
        opts.onDebug?.(`SearXNG failed (${e?.message ?? "error"})`);
      }
    }

    return { ok: false, provider: "selected-backends", count: 0, evidenceBlock: "", sources: [], error: "selected backends exhausted" };
  } catch (err: any) {
    return { ok: false, provider: "none", count: 0, evidenceBlock: "", sources: [], error: err?.message ?? "grounding error" };
  }
}
