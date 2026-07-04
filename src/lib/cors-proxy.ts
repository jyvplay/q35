/**
 * CORS-Resistant Web Scraper
 * Uses multiple fallback strategies to bypass CORS restrictions:
 * 1. Direct fetch (for CORS-enabled sites)
 * 2. AllOrigins proxy (free CORS proxy)
 * 3. Corsproxy.io fallback
 * 4. Textise dot iitty for text-only extraction
 */

export interface ScrapeResult {
  url: string;
  success: boolean;
  content: string;
  method: string;
  error?: string;
}

const CORS_PROXIES = [
  {
    name: "direct",
    buildUrl: (url: string) => url,
    extract: (text: string) => text,
  },
  {
    name: "allorigins",
    buildUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    extract: (text: string) => {
      try {
        const data = JSON.parse(text);
        return data.contents || text;
      } catch {
        return text;
      }
    },
  },
  {
    name: "corsproxy",
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    extract: (text: string) => text,
  },
  {
    name: "textise",
    buildUrl: (url: string) => `https://r.jina.ai/${url}`,
    extract: (text: string) => text,
  },
];

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy.buildUrl(url);
      const response = await fetch(proxyUrl, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,text/plain",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const text = await response.text();
      const content = proxy.extract(text);

      if (content && content.length > 100) {
        return {
          url,
          success: true,
          content: content.slice(0, 50000), // Limit to 50KB
          method: proxy.name,
        };
      }
    } catch (error: any) {
      // Try next proxy
      continue;
    }
  }

  return {
    url,
    success: false,
    content: "",
    method: "all-failed",
    error: "All CORS proxies failed to fetch this URL",
  };
}

export async function scrapeMultipleUrls(urls: string[], maxConcurrency = 12): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const queue = [...urls];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < maxConcurrency && queue.length > 0) {
      const url = queue.shift()!;
      const promise = (async () => {
        const result = await scrapeUrl(url);
        results.push(result);
      })();
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
      const completedIndex = active.findIndex((p) => {
        const idx = active.indexOf(p);
        if (idx !== -1) {
          active.splice(idx, 1);
          return true;
        }
        return false;
      });
      if (completedIndex !== -1) {
        active.splice(completedIndex, 1);
      }
    }
  }

  return results;
}
