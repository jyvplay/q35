import axios from "axios";
import {
  prismaFetchRead,
  prismaFetchSearch,
  resolvePrismaFetchAvailability,
  type GroundingBackend,
} from "./connectors/prismafetch";
import { browserScraperRead, browserScraperSearch } from "./browser-search-scraper";

export type { GroundingBackend } from "./connectors/prismafetch";

export interface JinaSearchResult {
  title: string;
  url: string;
  description: string;
  content: string;
}

export interface JinaSearchResponse {
  code: number;
  data: JinaSearchResult[];
}

async function runJinaSearch(
  query: string,
  apiKey: string,
  depth: number = 5,
  retries = 2,
): Promise<JinaSearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://s.jina.ai/${encoded}?num=${depth}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get<JinaSearchResponse>(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Retain-Images": "none",
        },
        timeout: 45000,
      });
      if (response.data && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      return [];
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (attempt < retries && (!status || status === 429 || status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Jina search failed");
}

async function runJinaRead(targetUrl: string, apiKey: string, retries = 1): Promise<string> {
  const url = `https://r.jina.ai/${targetUrl}`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          Accept: "text/plain",
          Authorization: `Bearer ${apiKey}`,
          "X-Retain-Images": "none",
        },
        timeout: 15000,
      });
      return typeof response.data === "string" ? response.data : "";
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (attempt < retries && (!status || status === 429 || status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Jina read failed for ${targetUrl}`);
}

/**
 * PrismaFetch/browser is PRIMARY, OG browser scraper is SECONDARY, Jina is BACKUP.
 *
 * Token-conservation policy: we only call Jina if PrismaFetch and the OG scraper
 * are unavailable/empty. If either local layer succeeds, Jina is never invoked.
 */
export async function searchWithGroundingFallback(
  query: string,
  apiKey: string,
  depth: number = 5,
  opts?: {
    retries?: number;
    prismafetchUrl?: string;
    /** If false, PrismaFetch is skipped entirely (no localhost probe). */
    prismaEnabled?: boolean;
    /** Allow falling back to Jina if both local layers fail (default true). */
    allowJinaFallback?: boolean;
    /** Force Jina path (skip PrismaFetch entirely). Used by the "Test Jina" button. */
    forceJina?: boolean;
    /** Legacy alias retained for compatibility (no longer used as primary switch). */
    allowPrismaFetchFallback?: boolean;
    onDebug?: (msg: string) => void;
  },
): Promise<{ provider: GroundingBackend; results: JinaSearchResult[] }> {
  const hasJinaKey = !!apiKey.trim();
  const allowJina = (opts?.allowJinaFallback ?? true) && hasJinaKey;
  const forceJina = !!opts?.forceJina;
  const prismaEnabled = opts?.prismaEnabled ?? true;

  // ── PRIMARY: PrismaFetch local service (skipped entirely if disabled) ──
  if (!forceJina && prismaEnabled) {
    const availability = await resolvePrismaFetchAvailability(opts?.prismafetchUrl);
    if (availability.ok) {
      try {
        const local = await prismaFetchSearch(query, {
          baseUrl: availability.baseUrl,
          count: depth,
        });
        if (local.results.length > 0) {
          opts?.onDebug?.(`Primary backend: PrismaFetch (${local.backend}) @ ${availability.baseUrl} → ${local.results.length} sources`);
          return { provider: "prismafetch-local", results: local.results };
        }
        opts?.onDebug?.(`PrismaFetch returned 0 results — escalating to OG browser scraper`);
      } catch (err) {
        opts?.onDebug?.(`PrismaFetch search failed (${String((err as Error)?.message ?? err)}) — escalating to OG browser scraper`);
      }
    } else {
      opts?.onDebug?.(`PrismaFetch unavailable (${availability.reason ?? "PrismaFetch offline"}) — escalating to OG browser scraper`);
    }
  } else if (forceJina) {
    opts?.onDebug?.(`Forcing Jina path (PrismaFetch primary bypassed by caller).`);
  } else {
    opts?.onDebug?.(`PrismaFetch disabled — going straight to OG browser scraper (workhorse).`);
  }

  // ── SECONDARY: OG browser scraper + academic APIs in parallel ───────
  if (!forceJina) {
    try {
      // browserScraperSearch now internally runs OG web engines + academic APIs
      // concurrently, then merges and relevance-filters them. Do not call the
      // academic APIs a second time here or we double network/memory cost.
      const scraperResults = await browserScraperSearch(query, { count: depth, onDebug: (msg) => opts?.onDebug?.(msg) }).catch(() => []);
      // Dedup and relevance-filter against query keywords so off-topic hits
      // ("Please Please Me", dictionary entries) are dropped.
      const qWords = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4);
      const isRelevant = (r: { title: string; content?: string; description?: string; url: string }) => {
        const hay = `${r.title} ${r.description ?? ""} ${r.content ?? ""}`.toLowerCase();
        if (/please please me|dictionary|merriam|collins dictionary|cambridge dictionary|\bgrammar\b|definition (?:of|and meaning)/i.test(hay)) return false;
        if (qWords.length === 0) return true;
        const hitCount = qWords.filter(w => hay.includes(w)).length;
        return hitCount >= Math.min(2, qWords.length); // need ≥2 query keywords (or all if <2)
      };
      const seen = new Set<string>();
      const merged: JinaSearchResult[] = [];
      let dropped = 0;
      for (const r of scraperResults) {
        if (!r.url || seen.has(r.url)) continue;
        if (!isRelevant(r)) { dropped++; continue; }
        seen.add(r.url);
        merged.push({ title: r.title, url: r.url, description: r.description, content: r.content || r.description || "" });
      }
      if (merged.length > 0) {
        opts?.onDebug?.(`Secondary backend: OG scraper+academic → ${merged.length} relevant (${dropped} off-topic dropped)`);
        return { provider: "browser-scraper", results: merged.slice(0, depth * 2) };
      }
      if (dropped > 0) opts?.onDebug?.(`Secondary backend: all ${dropped} results filtered as off-topic — escalating`);
      opts?.onDebug?.(`OG browser scraper + academic APIs returned 0 combined results — escalating to Jina backup`);
    } catch (err) {
      opts?.onDebug?.(`Secondary search failed (${String((err as Error)?.message ?? err)}) — escalating to Jina backup`);
    }
  }

  // ── BACKUP: Jina cloud (only reached when primary failed/empty) ─────
  if (allowJina) {
    opts?.onDebug?.(`Backup backend: Jina cloud (s.jina.ai) — consuming Jina tokens`);
    const results = await runJinaSearch(query, apiKey, depth, opts?.retries ?? 2);
    return { provider: "jina", results };
  }

  if (!hasJinaKey) {
    opts?.onDebug?.("All local grounding layers failed and no Jina key is configured; continuing with zero retrieved sources.");
    return { provider: "browser-scraper", results: [] };
  }
  opts?.onDebug?.("All local grounding layers failed and Jina backup is disabled; continuing with zero retrieved sources.");
  return { provider: "browser-scraper", results: [] };
}

/**
 * PrismaFetch read is PRIMARY, OG browser scraper read is SECONDARY, Jina Reader is BACKUP.
 *
 * `skipUrls` is an explicit dedup gate: if the URL is already in the set, this
 * function returns an empty string immediately so neither backend is invoked.
 */
export async function readWithGroundingFallback(
  targetUrl: string,
  apiKey: string,
  opts?: {
    retries?: number;
    prismafetchUrl?: string;
    allowJinaFallback?: boolean;
    forceJina?: boolean;
    /** Already-fetched URLs — short-circuit to avoid duplicate work. */
    skipUrls?: Set<string>;
    onDebug?: (msg: string) => void;
  },
): Promise<{ provider: GroundingBackend | "skipped"; text: string }> {
  if (opts?.skipUrls?.has(targetUrl)) {
    opts.onDebug?.(`Dedup short-circuit: ${targetUrl} already fetched in a prior pass`);
    return { provider: "skipped", text: "" };
  }

  const hasJinaKey = !!apiKey.trim();
  const allowJina = (opts?.allowJinaFallback ?? true) && hasJinaKey;
  const forceJina = !!opts?.forceJina;

  if (!forceJina) {
    const availability = await resolvePrismaFetchAvailability(opts?.prismafetchUrl);
    if (availability.ok) {
      try {
        const local = await prismaFetchRead(targetUrl, { baseUrl: availability.baseUrl });
        if (local.markdown && local.markdown.trim().length > 0) {
          opts?.onDebug?.(`Primary read: PrismaFetch (${local.tier ?? "extract"}) → ${local.markdown.length} chars`);
          opts?.skipUrls?.add(targetUrl);
          return { provider: "prismafetch-local", text: local.markdown };
        }
        opts?.onDebug?.(`PrismaFetch read returned empty markdown — escalating to OG browser scraper`);
      } catch (err) {
        opts?.onDebug?.(`PrismaFetch read failed (${String((err as Error)?.message ?? err)}) — escalating to OG browser scraper`);
      }
    } else {
      opts?.onDebug?.(`PrismaFetch read unavailable (${availability.reason ?? "PrismaFetch offline"}) — escalating to OG browser scraper`);
    }
  }

  if (!forceJina) {
    try {
      const text = await browserScraperRead(targetUrl, { onDebug: (msg) => opts?.onDebug?.(msg) });
      if (text.trim().length > 0) {
        opts?.skipUrls?.add(targetUrl);
        return { provider: "browser-scraper", text };
      }
      opts?.onDebug?.("OG browser scraper read returned empty text — escalating to Jina backup");
    } catch (err) {
      opts?.onDebug?.(`OG browser scraper read failed (${String((err as Error)?.message ?? err)}) — escalating to Jina backup`);
    }
  }

  if (allowJina) {
    opts?.onDebug?.(`Backup read: Jina Reader (r.jina.ai) — consuming Jina tokens`);
    const text = await runJinaRead(targetUrl, apiKey, opts?.retries ?? 1);
    opts?.skipUrls?.add(targetUrl);
    return { provider: "jina", text };
  }

  if (!hasJinaKey) return { provider: "browser-scraper", text: "" };
  return { provider: "browser-scraper", text: "" };
}

export async function jinaSearch(
  query: string,
  apiKey: string,
  depth: number = 5,
  retries = 2,
): Promise<JinaSearchResult[]> {
  try {
    const result = await searchWithGroundingFallback(query, apiKey, depth, { retries });
    return result.results;
  } catch (err: any) {
    console.warn(`Grounding search failed for "${query}":`, err?.message);
    return [];
  }
}

export async function jinaRead(
  targetUrl: string,
  apiKey: string,
  retries = 1,
): Promise<string> {
  try {
    const result = await readWithGroundingFallback(targetUrl, apiKey, { retries });
    return result.text;
  } catch (err: any) {
    console.warn(`Grounding read failed for ${targetUrl}:`, err?.message);
    return "";
  }
}
