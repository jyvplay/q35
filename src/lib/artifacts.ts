/**
 * Deterministic Artifact System
 * The AI emits an ArtifactRequest; the orchestrator resolves it against an
 * authoritative store and injects verified facts back. Names come from a
 * registry; prices/mkt cap/earnings come from a pluggable live resolver.
 */

export interface StockArtifact {
  ticker: string;
  name: string;
  price: number | null;
  mktCap: string;
  nextEarnings: string;
  analystRating: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "N/A";
  sector: string;
  asOf: string;
  source: string;
  hasLiveData: boolean;
}

export interface EarningsEvent {
  ticker: string;
  date: string;
  fiscalQuarter: string;
  type: "earnings" | "guidance" | "product" | "fda" | "investor-day";
}

export interface ArtifactRequest {
  type: "stocks" | "earnings" | "macro";
  tickers?: string[];
  windowStart?: string;
  windowEnd?: string;
}

export interface ArtifactResponse {
  resolved: StockArtifact[];
  unresolved: string[];
  earnings: EarningsEvent[];
  asOf: string;
  source: string;
}

export type LiveStockResolver = (ticker: string) => Promise<Partial<StockArtifact> | null>;
export type LiveEarningsResolver = (ticker: string) => Promise<EarningsEvent[]>;

let _liveResolver: LiveStockResolver | null = null;
let _earningsResolver: LiveEarningsResolver | null = null;

export function setLiveStockResolver(fn: LiveStockResolver | null): void { _liveResolver = fn; }
export function setLiveEarningsResolver(fn: LiveEarningsResolver | null): void { _earningsResolver = fn; }

import { TICKER_NAMES } from "./artifact-registry";

function localResolveStock(ticker: string): StockArtifact | null {
  const t = ticker.toUpperCase().trim();
  const meta = TICKER_NAMES[t];
  if (!meta) return null;
  return {
    ticker: t,
    name: meta.name,
    price: null,
    mktCap: "",
    nextEarnings: "",
    analystRating: "N/A",
    sector: meta.sector,
    asOf: new Date().toISOString().slice(0, 10),
    source: "registry",
    hasLiveData: false,
  };
}

export async function resolveStock(ticker: string): Promise<StockArtifact | null> {
  const t = ticker.toUpperCase().trim();
  const base = localResolveStock(t);
  if (!base) return null;
  if (_liveResolver) {
    try {
      const live = await _liveResolver(t);
      if (live) {
        return {
          ...base,
          price: live.price ?? base.price,
          mktCap: live.mktCap ?? base.mktCap,
          nextEarnings: live.nextEarnings ?? base.nextEarnings,
          analystRating: live.analystRating ?? base.analystRating,
          asOf: live.asOf ?? base.asOf,
          source: live.source ?? "live",
          hasLiveData: true,
        };
      }
    } catch { /* fall back to registry */ }
  }
  return base;
}

export async function resolveArtifactRequest(req: ArtifactRequest): Promise<ArtifactResponse> {
  const asOf = new Date().toISOString();
  const resolved: StockArtifact[] = [];
  const unresolved: string[] = [];
  const earnings: EarningsEvent[] = [];

  if (req.type === "stocks" || req.type === "earnings") {
    for (const t of req.tickers ?? []) {
      const s = await resolveStock(t);
      if (s) resolved.push(s);
      else unresolved.push(t.toUpperCase());
    }
  }

  if (req.type === "earnings" && _earningsResolver) {
    for (const t of req.tickers ?? []) {
      try {
        const events = await _earningsResolver(t.toUpperCase());
        if (req.windowStart || req.windowEnd) {
          earnings.push(...events.filter(e => {
            const d = e.date;
            if (req.windowStart && d < req.windowStart) return false;
            if (req.windowEnd && d > req.windowEnd) return false;
            return true;
          }));
        } else {
          earnings.push(...events);
        }
      } catch { /* skip */ }
    }
  }

  return { resolved, unresolved, earnings, asOf, source: _liveResolver ? "live" : "registry" };
}

/** Build a prompt block listing only resolved artifacts. The model MUST cite these. */
export function buildArtifactPromptBlock(res: ArtifactResponse): string {
  const lines: string[] = [
    "═══ DETERMINISTIC ARTIFACT STORE (use ONLY tickers/names/numbers from here) ═══",
  ];
  if (res.resolved.length === 0) {
    lines.push("No tickers resolved by the artifact store. Do not invent any.");
  } else {
    for (const s of res.resolved) {
      const facts: string[] = [];
      if (s.price !== null) facts.push(`price=$${s.price.toFixed(2)}`);
      if (s.mktCap) facts.push(`mktCap=${s.mktCap}`);
      if (s.nextEarnings) facts.push(`nextEarnings=${s.nextEarnings}`);
      facts.push(`rating=${s.analystRating}`);
      facts.push(`sector=${s.sector}`);
      lines.push(`• ${s.ticker} (${s.name}) — ${facts.join(", ")} [source: ${s.source}${s.hasLiveData ? "" : ", name-only"}]`);
    }
  }
  if (res.unresolved.length > 0) {
    lines.push("");
    lines.push(`UNRESOLVED (do NOT mention these tickers in the final answer): ${res.unresolved.join(", ")}`);
  }
  if (res.earnings.length > 0) {
    lines.push("");
    lines.push("Earnings calendar in window:");
    for (const e of res.earnings) lines.push(`  - ${e.ticker} ${e.fiscalQuarter} ${e.type} on ${e.date}`);
  }
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  return lines.join("\n");
}

/** Parse an ArtifactRequest from raw LLM output (tolerant). */
export function parseArtifactRequest(raw: string): ArtifactRequest | null {
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const type = obj.type === "earnings" || obj.type === "macro" ? obj.type : "stocks";
    const tickers = Array.isArray(obj.tickers) ? obj.tickers.map(String).slice(0, 12) : undefined;
    return { type, tickers, windowStart: obj.windowStart, windowEnd: obj.windowEnd };
  } catch {
    return null;
  }
}

/** Heuristic: should this query trigger artifact resolution? */
export function shouldResolveArtifacts(query: string): boolean {
  const q = query.toLowerCase();
  return /\b(stock|stocks|ticker|equit|share price|market cap|nvda|aapl|tsla|spy|qqq|earnings|buy|sell|invest|trade|portfolio)\b/.test(q);
}
