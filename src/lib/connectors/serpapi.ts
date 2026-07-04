// SerpAPI connector. NOTE: SerpAPI does not always permit direct browser
// fetches due to CORS. Users may need to set a CORS proxy URL (e.g. their own
// Cloudflare Worker) — pass `proxyBase` to route through it.
// Docs: https://serpapi.com/search-api

export interface SerpApiOptions {
  apiKey: string;
  engine?: "google" | "bing" | "duckduckgo" | "google_news" | "google_scholar";
  num?: number;
  hl?: string;
  gl?: string;
  proxyBase?: string; // e.g. "https://my-proxy.workers.dev/?url="
  signal?: AbortSignal;
}

export interface SerpResult {
  position?: number;
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

export async function serpapiSearch(query: string, opts: SerpApiOptions): Promise<SerpResult[]> {
  const params = new URLSearchParams({
    engine: opts.engine ?? "google",
    q: query,
    api_key: opts.apiKey,
    num: String(opts.num ?? 10),
    hl: opts.hl ?? "en",
    gl: opts.gl ?? "us",
    output: "json",
  });
  let url = `https://serpapi.com/search.json?${params.toString()}`;
  if (opts.proxyBase) url = `${opts.proxyBase}${encodeURIComponent(url)}`;

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SerpAPI ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    organic_results?: Array<{
      position?: number;
      title: string;
      link: string;
      snippet?: string;
      source?: string;
      date?: string;
    }>;
    news_results?: Array<{ position?: number; title: string; link: string; snippet?: string; source?: string; date?: string }>;
    error?: string;
  };
  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);
  const raw = data.organic_results ?? data.news_results ?? [];
  return raw.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title,
    link: r.link,
    snippet: r.snippet ?? "",
    source: r.source,
    date: r.date,
  }));
}
