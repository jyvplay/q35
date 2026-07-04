export type GroundingBackend = "jina" | "prismafetch-local" | "browser-scraper";

export interface PrismaFetchRuntimeSettings {
  prismafetchEnabled: boolean;
  prismafetchAutoFallback: boolean;
  prismafetchUrl: string;
}

export interface PrismaFetchSearchResult {
  title: string;
  url: string;
  description: string;
  content: string;
}

export interface PrismaFetchReadResult {
  url: string;
  title: string;
  markdown: string;
  tier?: string;
  links?: string[];
  totalTokens?: number;
}

export interface PrismaFetchSearchResponse {
  query: string;
  backend: string;
  results: PrismaFetchSearchResult[];
}

// ─── NEW: PRISMAFETCH READ MODES + OCR ───────────────────────────────
export type PrismaFetchReadMode =
  | "auto"
  | "fast_static"
  | "render_headless"
  | "visual_only";

export const PRISMAFETCH_READ_MODES: PrismaFetchReadMode[] = [
  "auto",
  "fast_static",
  "render_headless",
  "visual_only",
];

export interface PrismaFetchReadOptions {
  mode?: PrismaFetchReadMode;
  ocr?: boolean;
}

const SETTINGS_KEY = "veritas.settings.v2";
const DEFAULT_URL = "http://127.0.0.1:8080";

export function normalizePrismaFetchUrl(url?: string): string {
  return (url || DEFAULT_URL).trim().replace(/\/+$/, "");
}

export function getPrismaFetchSettings(): PrismaFetchRuntimeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<PrismaFetchRuntimeSettings> : {};
    return {
      prismafetchEnabled: parsed.prismafetchEnabled ?? true,
      prismafetchAutoFallback: parsed.prismafetchAutoFallback ?? true,
      prismafetchUrl: normalizePrismaFetchUrl(parsed.prismafetchUrl ?? DEFAULT_URL),
    };
  } catch {
    return {
      prismafetchEnabled: true,
      prismafetchAutoFallback: true,
      prismafetchUrl: DEFAULT_URL,
    };
  }
}

export async function prismaFetchHealth(baseUrl?: string, signal?: AbortSignal): Promise<boolean> {
  const normalized = normalizePrismaFetchUrl(baseUrl ?? getPrismaFetchSettings().prismafetchUrl);
  try {
    const res = await fetch(`${normalized}/healthz`, {
      method: "GET",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data = await res.json() as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function resolvePrismaFetchAvailability(explicitBaseUrl?: string): Promise<{ ok: boolean; baseUrl: string; reason?: string }> {
  const settings = getPrismaFetchSettings();
  const baseUrl = normalizePrismaFetchUrl(explicitBaseUrl ?? settings.prismafetchUrl);
  if (!settings.prismafetchEnabled) {
    return { ok: false, baseUrl, reason: "PrismaFetch fallback is disabled in settings." };
  }
  const ok = await prismaFetchHealth(baseUrl);
  if (!ok) {
    return { ok: false, baseUrl, reason: `PrismaFetch server unreachable at ${baseUrl}.` };
  }
  return { ok: true, baseUrl };
}

export async function prismaFetchSearch(
  query: string,
  opts?: { baseUrl?: string; count?: number; signal?: AbortSignal },
): Promise<{ results: PrismaFetchSearchResult[]; backend: string }> {
  const baseUrl = normalizePrismaFetchUrl(opts?.baseUrl ?? getPrismaFetchSettings().prismafetchUrl);
  const url = new URL(`${baseUrl}/api/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(opts?.count ?? 8));

  const res = await fetch(url.toString(), {
    method: "GET",
    signal: opts?.signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`PrismaFetch search ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const data = await res.json() as Partial<PrismaFetchSearchResponse>;
  return {
    backend: data.backend ?? "unknown",
    results: Array.isArray(data.results) ? data.results.map((r) => ({
      title: String(r.title ?? "Untitled"),
      url: String(r.url ?? ""),
      description: String(r.description ?? ""),
      content: String(r.content ?? r.description ?? ""),
    })).filter((r) => !!r.url) : [],
  };
}

export async function prismaFetchRead(
  targetUrl: string,
  opts?: { baseUrl?: string; mode?: PrismaFetchReadMode; ocr?: boolean; signal?: AbortSignal },
): Promise<PrismaFetchReadResult> {
  const baseUrl = normalizePrismaFetchUrl(opts?.baseUrl ?? getPrismaFetchSettings().prismafetchUrl);
  const url = new URL(`${baseUrl}/api/read`);
  url.searchParams.set("url", targetUrl);
  if (opts?.mode) url.searchParams.set("mode", opts.mode);
  if (opts?.ocr) url.searchParams.set("ocr", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    signal: opts?.signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`PrismaFetch read ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const data = await res.json() as Partial<PrismaFetchReadResult>;
  return {
    url: String(data.url ?? targetUrl),
    title: String(data.title ?? targetUrl),
    markdown: String(data.markdown ?? ""),
    tier: typeof data.tier === "string" ? data.tier : undefined,
    links: Array.isArray(data.links) ? data.links.map(String) : [],
    totalTokens: typeof data.totalTokens === "number" ? data.totalTokens : undefined,
  };
}

// Convenience: readMode + ocr from app settings (used by ControlPlane / Modules)
export function getPrismaFetchReadOptionsFromSettings(settings?: {
  prismafetchReadMode?: PrismaFetchReadMode;
  prismafetchOcr?: boolean;
}): PrismaFetchReadOptions {
  return {
    mode: settings?.prismafetchReadMode || "auto",
    ocr: !!settings?.prismafetchOcr,
  };
}
