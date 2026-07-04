/**
 * Deterministic CORS Proxy & Scraper Hardening (May 2026 fleet).
 *
 * Public CORS relays churn constantly, so we keep a broad, prioritized list and
 * rotate through several response shapes (raw passthrough vs. JSON-wrapped).
 * The first relay to return usable bytes wins.
 */

export interface ProxyDef {
  name: string;
  build: (url: string) => string;
  /** Some relays wrap the body in JSON ({contents:"..."}); extract if so. */
  unwrap?: (body: string) => string;
}

// Ordered fastest/most-reliable first as of May 2026. Raw passthrough relays are
// preferred because they don't double-encode HTML entities. Expanded fleet for
// resilience — the OG browser scraper is the workhorse so it must rarely fail.
export const PROXY_FLEET: ProxyDef[] = [
  { name: "corsproxy.io", build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { name: "allorigins-raw", build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "codetabs", build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` },
  { name: "corsproxy.org", build: (u) => `https://corsproxy.org/?${encodeURIComponent(u)}` },
  { name: "thingproxy", build: (u) => `https://thingproxy.freeboard.io/fetch/${u}` },
  { name: "cors.eu.org", build: (u) => `https://cors.eu.org/${u}` },
  { name: "cors-anywhere-hf", build: (u) => `https://cors-anywhere.herokuapp.com/${u}` },
  { name: "proxy.cors.sh", build: (u) => `https://proxy.cors.sh/${u}` },
  { name: "yacdn", build: (u) => `https://yacdn.org/proxy/${u}` },
  { name: "whateverorigin", build: (u) => `https://whateverorigin.org/get?url=${encodeURIComponent(u)}`, unwrap: jsonContents },
  { name: "allorigins-get", build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, unwrap: jsonContents },
  { name: "jsonp.afeld", build: (u) => `https://jsonp.afeld.me/?url=${encodeURIComponent(u)}` },
];

function jsonContents(body: string): string {
  try {
    const data = JSON.parse(body);
    return typeof data?.contents === "string" ? data.contents : body;
  } catch {
    return body;
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
};

async function timedFetch(url: string, signal: AbortSignal | undefined, headers: Record<string, string>): Promise<Response> {
  // Compose caller signal with an internal timeout so one dead relay can't hang the chain.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { signal: ctrl.signal, headers, redirect: "follow" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function looksUsable(text: string): boolean {
  if (!text) return false;
  if (text.length < 80) return false;
  // Reject obvious relay error envelopes.
  if (/^\s*(error|forbidden|too many requests|rate limit)/i.test(text) && text.length < 400) return false;
  return true;
}

export interface RobustFetchResult {
  text: string;
  source: "direct" | "proxy";
  proxy?: string;
}

/** Try a single proxy, resolving to a usable body or rejecting. */
async function tryProxy(proxy: ProxyDef, url: string, signal?: AbortSignal): Promise<RobustFetchResult> {
  const res = await timedFetch(proxy.build(url), signal, BROWSER_HEADERS);
  if (!res.ok) throw new Error(`${proxy.name}:${res.status}`);
  const raw = await res.text();
  const body = proxy.unwrap ? proxy.unwrap(raw) : raw;
  if (!looksUsable(body)) throw new Error(`${proxy.name}:thin`);
  return { text: body, source: "proxy", proxy: proxy.name };
}

/** Resolve the first fulfilled promise; reject only if ALL reject. */
function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let remaining = promises.length;
    const errors: any[] = [];
    if (remaining === 0) reject(new Error("no candidates"));
    promises.forEach(p => p.then(resolve, (e) => {
      errors.push(e);
      if (--remaining === 0) reject(new Error(errors.map(x => x?.message ?? x).join(", ")));
    }));
  });
}

/**
 * Resilient fetch: optional pinned proxy → direct → RACE the proxy fleet.
 * Racing collapses the old sequential per-proxy delay into ~1 wave latency.
 * Returns the first usable body. Throws CORS_BLOCKED only when everything fails.
 */
export async function fetchRobust(url: string, signal?: AbortSignal, preferProxy?: string): Promise<RobustFetchResult> {
  // 0. Pinned proxy first (e.g. codetabs for Bing — confirmed working combos).
  if (preferProxy) {
    const pinned = PROXY_FLEET.find(p => p.name === preferProxy);
    if (pinned) {
      try { return await tryProxy(pinned, url, signal); } catch { /* fall through */ }
    }
  }

  // 1. Direct (works for CORS-enabled origins) — short timeout.
  try {
    const res = await timedFetch(url, signal, BROWSER_HEADERS);
    if (res.ok) {
      const text = await res.text();
      if (looksUsable(text)) return { text, source: "direct" };
    }
  } catch { /* fall through */ }

  // 2. Race the proxy fleet in small waves — first usable wins. Keep this at
  // 2 because cluster search can launch several scraper reads in parallel.
  const WAVE = 2;
  const errs: string[] = [];
  for (let i = 0; i < PROXY_FLEET.length; i += WAVE) {
    if (signal?.aborted) break;
    const wave = PROXY_FLEET.slice(i, i + WAVE);
    try {
      return await firstSuccess(wave.map(p => tryProxy(p, url, signal)));
    } catch (e: any) {
      errs.push(e?.message ?? "wave-failed");
    }
  }

  throw new Error(`CORS_BLOCKED: all paths failed for ${url} [${errs.join("; ").slice(0, 200)}]`);
}

/**
 * Extract substantive text from raw HTML (lightweight, no DOM).
 */
export function extractTextFromHtml(html: string): string {
  let text = html.replace(/<(script|style|nav|footer|header|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
  return text.replace(/\s+/g, " ").trim().slice(0, 12_000);
}
