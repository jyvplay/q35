// Jina AI connectors with PrismaFetch as PRIMARY, OG browser scraper as SECONDARY, and Jina as BACKUP.
// Token-conservation policy: Jina is only invoked when both local layers are unavailable or empty.

import {
  prismaFetchRead,
  prismaFetchSearch,
  resolvePrismaFetchAvailability,
} from "./prismafetch";
import { browserScraperRead, browserScraperSearch } from "../browser-search-scraper";

export interface JinaEmbedOptions {
  apiKey: string;
  model?: string;
  task?: "retrieval.query" | "retrieval.passage" | "classification" | "separation" | "text-matching";
  signal?: AbortSignal;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

function localHashEmbedding(text: string, dims = 256): number[] {
  const vec = new Array<number>(dims).fill(0);
  for (const token of tokenize(text)) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export async function jinaEmbed(
  texts: string[],
  opts: JinaEmbedOptions,
): Promise<{ vectors: number[][]; usage: { totalTokens: number } }> {
  if (texts.length === 0) return { vectors: [], usage: { totalTokens: 0 } };

  // PRIMARY: deterministic local hash embedding (zero tokens).
  // We only consult Jina if explicitly forced via a non-empty apiKey AND task signals
  // a model-quality requirement, which we approximate by `task === "classification"`
  // or `task === "text-matching"`. Otherwise local is sufficient for retrieval.
  const usesRemote = !!opts.apiKey?.trim() && (opts.task === "classification" || opts.task === "text-matching");
  if (!usesRemote) {
    const vectors = texts.map((text) => localHashEmbedding(text));
    const totalTokens = texts.reduce((sum, text) => sum + Math.max(1, Math.round(text.length / 4)), 0);
    return { vectors, usage: { totalTokens } };
  }

  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "jina-embeddings-v3",
      task: opts.task ?? "retrieval.passage",
      input: texts,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Jina embeddings ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as {
    data: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };
  return {
    vectors: data.data.map((d) => d.embedding),
    usage: { totalTokens: data.usage?.total_tokens ?? 0 },
  };
}

export interface JinaRerankOptions {
  apiKey: string;
  model?: string;
  topN?: number;
  signal?: AbortSignal;
}

export interface JinaRerankResult {
  index: number;
  relevanceScore: number;
  document: string;
}

function lexicalScore(query: string, document: string): number {
  const qTokens = tokenize(query);
  const dTokens = tokenize(document);
  if (qTokens.length === 0 || dTokens.length === 0) return 0;
  const dSet = new Set(dTokens);
  const overlap = qTokens.filter((t) => dSet.has(t)).length;
  const density = overlap / qTokens.length;
  const positionBoost = qTokens.slice(0, 4).filter((t) => dTokens.slice(0, 60).includes(t)).length * 0.05;
  return density + positionBoost;
}

export async function jinaRerank(
  query: string,
  documents: string[],
  opts: JinaRerankOptions,
): Promise<JinaRerankResult[]> {
  // PRIMARY: local lexical rerank (zero Jina tokens). Only call remote if `opts.model`
  // explicitly requests a remote reranker AND a key is present.
  const wantsRemote = !!opts.apiKey?.trim() && !!opts.model && opts.model.startsWith("jina-reranker-");
  if (!wantsRemote) {
    return documents
      .map((document, index) => ({ index, relevanceScore: lexicalScore(query, document), document }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, opts.topN ?? documents.length);
  }

  const res = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      query,
      documents,
      top_n: opts.topN ?? documents.length,
      return_documents: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Jina rerank ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as {
    results: { index: number; relevance_score: number; document?: { text: string } | string }[];
  };
  return data.results.map((r) => ({
    index: r.index,
    relevanceScore: r.relevance_score,
    document: typeof r.document === "string" ? r.document : r.document?.text ?? documents[r.index],
  }));
}

export interface JinaSearchOptions {
  apiKey: string;
  signal?: AbortSignal;
  count?: number;
  prismafetchUrl?: string;
}

export interface JinaSearchResult {
  url: string;
  title: string;
  description: string;
  content?: string;
}

/** PRIMARY: PrismaFetch. SECONDARY: OG browser scraper. BACKUP: s.jina.ai. */
export async function jinaSearch(query: string, opts: JinaSearchOptions): Promise<JinaSearchResult[]> {
  const availability = await resolvePrismaFetchAvailability(opts.prismafetchUrl);
  if (availability.ok) {
    try {
      const local = await prismaFetchSearch(query, {
        baseUrl: availability.baseUrl,
        count: opts.count,
        signal: opts.signal,
      });
      if (local.results.length > 0) return local.results;
    } catch {
      // fall through to OG browser scraper
    }
  }

  try {
    const scraped = await browserScraperSearch(query, { count: opts.count, signal: opts.signal });
    if (scraped.length > 0) return scraped;
  } catch {
    // fall through to Jina backup
  }

  if (!opts.apiKey?.trim()) {
    return [];
  }

  const url = `https://s.jina.ai/${encodeURIComponent(query)}?num=${opts.count ?? 8}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: "application/json",
      "X-Retain-Images": "none",
    },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Jina search ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as { data?: { url: string; title: string; description: string; content?: string }[] };
  const results = (data.data ?? []).slice(0, opts.count ?? 8);
  return results.map((r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    content: r.content,
  }));
}

/** PRIMARY: PrismaFetch read. SECONDARY: OG browser scraper read. BACKUP: r.jina.ai. */
export async function jinaReadUrl(url: string, opts: { apiKey: string; signal?: AbortSignal; prismafetchUrl?: string }): Promise<string> {
  const availability = await resolvePrismaFetchAvailability(opts.prismafetchUrl);
  if (availability.ok) {
    try {
      const local = await prismaFetchRead(url, { baseUrl: availability.baseUrl, signal: opts.signal });
      if (local.markdown && local.markdown.trim().length > 0) return local.markdown;
    } catch {
      // fall through to OG browser scraper
    }
  }

  try {
    const scraped = await browserScraperRead(url, { signal: opts.signal });
    if (scraped.trim().length > 0) return scraped;
  } catch {
    // fall through to Jina Reader
  }

  if (!opts.apiKey?.trim()) {
    return "";
  }

  const fetchUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(fetchUrl, {
    headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "text/plain" },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Jina reader ${res.status}`);
  return await res.text();
}
