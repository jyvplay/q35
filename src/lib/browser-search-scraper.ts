import { extractTextFromHtml, fetchRobust } from "./scraper-hardener";
import { searchAcademicSources } from "./academic-sources";

export interface BrowserScraperSearchResult {
  title: string;
  url: string;
  description: string;
  content: string;
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeRedirect(href: string, base: string): string {
  try {
    const parsed = new URL(href, base);
    // DuckDuckGo wraps targets in ?uddg=
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    // Bing wraps in ?u= (sometimes base64); fall back to raw
    const u = parsed.searchParams.get("u");
    if (u) {
      if (/^https?:/i.test(u)) return u;
      // Bing often stores URL-safe base64 in u=a1<base64>. Decode if possible.
      const raw = u.startsWith("a1") ? u.slice(2) : u;
      try {
        const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
        const decoded = atob(padded);
        if (/^https?:/i.test(decoded)) return decoded;
      } catch { /* ignore */ }
    }
    return parsed.toString();
  } catch {
    return href;
  }
}

type EngineParser = (html: string, count: number) => BrowserScraperSearchResult[];

interface SearchEngine {
  name: string;
  url: (q: string) => string;
  parse: EngineParser;
}

function normalizeQuery(query: string): string {
  let q = query
    .replace(/^\s*(please|can you|could you|would you|i need you to|help me|find me|please find me)\b/gi, "")
    .replace(/\b(please|thanks|thank you)\b/gi, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Domain-specific rewrite for the recurring NIH/social-welfare task. This
  // avoids engines spending the query budget on generic words like "please".
  if (/\bNIH\b|National Institutes of Health|grant|funded|funding/i.test(query) && /social welfare|social determinants|SDOH|health disparities/i.test(query)) {
    q = "NIH funding opportunities social determinants of health social welfare health disparities NIMHD NIMH NIA NOSI NOFO";
  }
  return q || query;
}

function isNihSocialWelfareQuery(query: string): boolean {
  return (/\bNIH\b|National Institutes of Health|grant|funded|funding/i.test(query) &&
    /social welfare|social determinants|SDOH|health disparities|housing|food insecurity|public health|community/i.test(query));
}

function curatedNihSeeds(query: string): BrowserScraperSearchResult[] {
  if (!isNihSocialWelfareQuery(query)) return [];
  return [
    {
      title: "NIH Guide for Grants and Contracts",
      url: "https://grants.nih.gov/funding/searchguide/index.html#/",
      description: "Official NIH Guide search for active NOFOs, NOSIs, notices, and funding announcements.",
      content: "Official NIH funding announcement search. Use to identify active NOFOs and NOSIs; applications must route through an awarding Institute or Center, not coordinating offices.",
    },
    {
      title: "NIH RePORTER Matchmaker and Project Search",
      url: "https://reporter.nih.gov/",
      description: "Official database of funded NIH projects useful for recent award pattern analysis.",
      content: "NIH RePORTER is the official project database for NIH-funded grants and can be used to inspect recently awarded projects, awarding ICs, mechanisms, and topic clusters.",
    },
    {
      title: "NIMHD Research Interest Areas",
      url: "https://www.nimhd.nih.gov/programs/extramural/research-interest-areas/",
      description: "NIMHD priority areas for minority health and health disparities research.",
      content: "NIMHD supports research on minority health, health disparities, social determinants of health, community interventions, and multi-level influences on health outcomes.",
    },
    {
      title: "NIMH Strategic Priorities",
      url: "https://www.nimh.nih.gov/about/strategic-planning-reports",
      description: "NIMH strategic planning and funding priorities for mental health research.",
      content: "NIMH priorities can support mental health-focused work on social determinants, digital behavioral health, services research, implementation, and community intervention models.",
    },
    {
      title: "NIH Office of Behavioral and Social Sciences Research (OBSSR)",
      url: "https://obssr.od.nih.gov/",
      description: "NIH coordinating office for behavioral and social sciences research.",
      content: "OBSSR coordinates and co-funds behavioral and social sciences research but is not itself the awarding IC for R-series applications; proposals must identify an awarding Institute or Center.",
    },
    {
      title: "Grants.gov Search Grants",
      url: "https://www.grants.gov/search-grants",
      description: "Government-wide funding opportunity search portal.",
      content: "Grants.gov lists federal funding opportunities and can be used to confirm agency, eligibility, and opportunity status, but NIH Guide remains the canonical NIH opportunity source.",
    },
  ];
}

function relevanceScore(result: BrowserScraperSearchResult, query: string): number {
  const hay = `${result.title} ${result.description} ${result.content} ${result.url}`.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  const terms = ["nih", "nimhd", "nimh", "nia", "grant", "funding", "nofo", "nosi", "social determinants", "health disparities", "sdoh", "research", "reporter", "grants.gov" ];
  for (const t of terms) if (hay.includes(t)) score += 2;
  for (const t of q.split(/\s+/).filter(w => w.length > 4)) if (hay.includes(t)) score += 0.5;
  if (/dictionary|definition|fashion|collins|merriam|cambridge|grammar|synonym/i.test(hay)) score -= 20;
  if (/bing\.com\/ck\//i.test(result.url)) score -= 15;
  return score;
}

function filterAndRank(results: BrowserScraperSearchResult[], query: string, count: number): BrowserScraperSearchResult[] {
  return results
    .map(r => ({ r, score: relevanceScore(r, query) }))
    .filter(x => x.score > -5)
    .sort((a, b) => b.score - a.score)
    .map(x => x.r)
    .slice(0, count);
}

function genericAnchorParse(host: string): EngineParser {
  return (html, count) => {
    const results: BrowserScraperSearchResult[] = [];
    const seen = new Set<string>();
    const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null && results.length < count) {
      let url = decodeRedirect(m[1], `https://${host}`);
      if (!/^https?:\/\//i.test(url)) continue;
      if (url.includes(host)) continue; // skip internal engine links
      const title = stripHtml(m[2]);
      if (!title || title.length < 12) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, description: "", content: "" });
    }
    return results;
  };
}

interface SearchEngineExt extends SearchEngine {
  /** Force a specific proxy that is confirmed to work for this engine. */
  preferProxy?: string;
  /** JSON engines bypass HTML parsing entirely and are CORS-safe. */
  jsonFetch?: (q: string, count: number, onDebug?: (m: string) => void) => Promise<BrowserScraperSearchResult[]>;
}

// ── Wikipedia OpenSearch + REST summary — fully CORS-safe, no proxy needed ──
async function wikipediaSearch(query: string, count: number): Promise<BrowserScraperSearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${count}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const hits = data?.query?.search ?? [];
  return hits.map((h: any) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(h.title).replace(/\s/g, "_"))}`,
    description: stripHtml(h.snippet || ""),
    content: stripHtml(h.snippet || ""),
  }));
}

const ENGINES: SearchEngineExt[] = [
  // 1. Wikipedia API — CORS-safe JSON, always works, no proxy. Highest priority
  //    for reliability; provides authoritative encyclopedic grounding.
  {
    name: "wikipedia-api",
    url: () => "",
    parse: () => [],
    jsonFetch: (q, count) => wikipediaSearch(q, count),
  },
  // 2. Bing via codetabs — CONFIRMED working combination. Pinned proxy.
  {
    name: "bing(codetabs)",
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    preferProxy: "codetabs",
    parse: (html, count) => {
      const results: BrowserScraperSearchResult[] = [];
      const blocks = html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1);
      for (const block of blocks) {
        const link = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!link || !/^https?:\/\//i.test(link[1])) continue;
        const snip = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        results.push({
          title: stripHtml(link[2]) || link[1],
          url: link[1],
          description: stripHtml(snip?.[1] || ""),
          content: stripHtml(snip?.[1] || ""),
        });
        if (results.length >= count) break;
      }
      return results;
    },
  },
  // 3. DuckDuckGo Lite — the lite endpoint renders server-side and is the most
  //    proxy-friendly DDG surface (the /html/ endpoint is JS-gated and never worked).
  {
    name: "duckduckgo-lite",
    url: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    parse: (html, count) => {
      const results: BrowserScraperSearchResult[] = [];
      const seen = new Set<string>();
      const anchorRe = /<a[^>]+(?:class=["'][^"']*result-link[^"']*["'][^>]*)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = anchorRe.exec(html)) !== null && results.length < count) {
        const url = decodeRedirect(m[1], "https://duckduckgo.com");
        if (!/^https?:\/\//i.test(url)) continue;
        if (/duckduckgo\.com/i.test(url)) continue;
        const title = stripHtml(m[2]);
        if (!title || title.length < 10) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        results.push({ title, url, description: "", content: "" });
      }
      return results;
    },
  },
  // 4. Bing default (any proxy) — backup if codetabs is rate-limited.
  {
    name: "bing",
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    parse: (html, count) => {
      const results: BrowserScraperSearchResult[] = [];
      const blocks = html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1);
      for (const block of blocks) {
        const link = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!link || !/^https?:\/\//i.test(link[1])) continue;
        const snip = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        results.push({
          title: stripHtml(link[2]) || link[1],
          url: link[1],
          description: stripHtml(snip?.[1] || ""),
          content: stripHtml(snip?.[1] || ""),
        });
        if (results.length >= count) break;
      }
      return results;
    },
  },
  // 5. Mojeek — independent index, proxy-friendly.
  {
    name: "mojeek",
    url: (q) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`,
    parse: (html, count) => {
      const results: BrowserScraperSearchResult[] = [];
      const re = /<a[^>]+class=["'][^"']*ob[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && results.length < count) {
        if (!/^https?:\/\//i.test(m[1])) continue;
        results.push({ title: stripHtml(m[2]) || m[1], url: m[1], description: "", content: "" });
      }
      return results.length ? results : genericAnchorParse("mojeek.com")(html, count);
    },
  },
];

async function scrapeResultContent(result: BrowserScraperSearchResult, signal?: AbortSignal): Promise<BrowserScraperSearchResult> {
  if (result.content && result.content.length > 240) return result;
  // Hard 8s timeout per page: prevents slow downloads from holding heap
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
  try {
    const fetched = await fetchRobust(result.url, ac.signal);
    clearTimeout(timer);
    // Cap extracted text immediately (1200 chars) — never hold full page body
    const extracted = String(extractTextFromHtml(fetched.text).slice(0, 1_200));
    if (extracted.length > result.content.length) {
      return { ...result, content: extracted, description: result.description || String(extracted.slice(0, 300)) };
    }
  } catch {
    clearTimeout(timer);
    /* keep snippet */
  }
  return result;
}

/**
 * Jina-free web search: tries each engine through the CORS-resilient fetcher
 * until one yields results, then enriches the top hits with scraped page text.
 */
export async function browserScraperSearch(
  query: string,
  opts?: { count?: number; signal?: AbortSignal; onDebug?: (msg: string) => void; enrich?: boolean },
): Promise<BrowserScraperSearchResult[]> {
  const count = Math.max(1, Math.min(20, opts?.count ?? 8));
  const enrich = opts?.enrich ?? true;
  const normalized = normalizeQuery(query);
  if (normalized !== query) opts?.onDebug?.(`OG scraper normalized query: "${query.slice(0, 80)}" → "${normalized}"`);
  const curated = curatedNihSeeds(query);

  // Fire the academic/government APIs in parallel immediately. They are CORS-safe
  // and frequently return before the proxy-backed search engines.
  const academicPromise = searchAcademicSources(normalized, {
    count: Math.min(count, 6),
    onDebug: opts?.onDebug,
  }).catch(() => []);

  for (const engine of ENGINES) {
    if (opts?.signal?.aborted) break;
    try {
      let hits: BrowserScraperSearchResult[];
      if (engine.jsonFetch) {
        // CORS-safe JSON engine — no proxy, no HTML parsing.
        const raw = await engine.jsonFetch(normalized, count * 2, opts?.onDebug);
        hits = filterAndRank(raw, normalized, count);
      } else {
        const page = await fetchRobust(engine.url(normalized), opts?.signal, engine.preferProxy);
        hits = filterAndRank(engine.parse(page.text, count * 2), normalized, count);
        opts?.onDebug?.(`OG scraper engine "${engine.name}": parsed via ${page.source}${page.proxy ? ` (${page.proxy})` : ""}`);
      }
      if (hits.length > 0) {
        opts?.onDebug?.(`OG scraper engine "${engine.name}": ${hits.length} usable hits`);
        if (!enrich) return filterAndRank([...hits, ...curated], normalized, count);
        const queue = [...hits];
        const out: BrowserScraperSearchResult[] = [];
        // One enrichment worker per search keeps capability but prevents
        // cluster waves from multiplying into dozens of page downloads.
        const workers = Array.from({ length: Math.min(1, queue.length) }, async () => {
          while (queue.length) {
            const next = queue.shift();
            if (!next) break;
            out.push(await scrapeResultContent(next, opts?.signal));
          }
        });
        await Promise.all(workers);
        const academic = await academicPromise;
        const academicAsBrowserResults: BrowserScraperSearchResult[] = academic.map(a => ({
          title: a.title, url: a.url, description: a.description, content: a.content,
        }));
        const merged = filterAndRank([...out, ...curated, ...academicAsBrowserResults], normalized, count * 2);
        return merged.slice(0, count);
      }
      opts?.onDebug?.(`OG scraper engine "${engine.name}": 0 hits — trying next engine`);
    } catch (e: any) {
      opts?.onDebug?.(`OG scraper engine "${engine.name}" failed (${e?.message?.slice(0, 80) ?? "err"}) — trying next engine`);
    }
  }

  const academic = await academicPromise;
  const academicAsBrowserResults: BrowserScraperSearchResult[] = academic.map(a => ({
    title: a.title, url: a.url, description: a.description, content: a.content,
  }));
  const fallback = filterAndRank([...curated, ...academicAsBrowserResults], normalized, count * 2);
  if (fallback.length > 0) {
    opts?.onDebug?.(`OG scraper engines exhausted; academic/NIH fallback yielded ${fallback.length} source(s)`);
    return fallback.slice(0, count);
  }
  opts?.onDebug?.(`OG scraper exhausted all ${ENGINES.length} engines and academic APIs with 0 results`);
  return [];
}

export async function browserScraperRead(
  url: string,
  opts?: { signal?: AbortSignal; onDebug?: (msg: string) => void },
): Promise<string> {
  const fetched = await fetchRobust(url, opts?.signal);
  const text = extractTextFromHtml(fetched.text);
  opts?.onDebug?.(`OG scraper read: ${text.length} chars via ${fetched.source}${fetched.proxy ? ` (${fetched.proxy})` : ""}`);
  return text;
}
