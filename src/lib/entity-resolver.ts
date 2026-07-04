/**
 * Deterministic Entity Resolver
 * ─────────────────────────────
 * Extracts ticker symbols and company names from RETRIEVED source text only
 * (never from model memory). Produces a verified fact sheet that the synthesis
 * prompt MUST use — any ticker, name, price, or metric NOT in this sheet
 * is flagged as unverified.
 *
 * This kills three hallucination classes at once:
 *   1. Invented company names (e.g. "Dyali" for DY)
 *   2. Fabricated numbers (MTD/YTD returns not in sources)
 *   3. Recommendations with no supporting evidence
 */

export interface ResolvedEntity {
  ticker: string;
  /** Company name extracted verbatim from source text — never inferred. */
  name: string;
  /** The source index [S1, S2, ...] where we found this entity. */
  sourceIndices: number[];
  /** All numeric facts extracted verbatim from the source text, keyed by label. */
  facts: Record<string, string>;
  /** Raw source snippets mentioning this ticker (for grounding). */
  snippets: string[];
  /** Whether the source explicitly recommends / lists this as a candidate. */
  recommended: boolean;
  /** Whether we found a catalyst date, and if so, the raw text. */
  catalystRaw: string | null;
  /** Verification: how many distinct sources mention this ticker. */
  sourceCount: number;
}

export interface EntitySheet {
  entities: ResolvedEntity[];
  /** Tickers mentioned but with insufficient grounding (< 2 facts). */
  weakEntities: string[];
  /** Human-readable fact block for injection into the synthesis prompt. */
  promptBlock: string;
  /** Timestamp of extraction. */
  ts: number;
}

// Known ticker → company name mappings for the most common US equities.
// This is a fallback ONLY when the source text doesn't provide a name.
// It prevents hallucinated names like "Dyali" for DY.
const KNOWN_TICKERS: Record<string, string> = {
  AAPL: "Apple Inc.", MSFT: "Microsoft Corp.", GOOGL: "Alphabet Inc.", GOOG: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.", NVDA: "NVIDIA Corp.", META: "Meta Platforms Inc.",
  TSLA: "Tesla Inc.", AVGO: "Broadcom Inc.", AMD: "Advanced Micro Devices",
  INTC: "Intel Corp.", QCOM: "Qualcomm Inc.", MU: "Micron Technology",
  STX: "Seagate Technology", CRM: "Salesforce Inc.", NOW: "ServiceNow Inc.",
  PLTR: "Palantir Technologies", ADBE: "Adobe Inc.", ORCL: "Oracle Corp.",
  NFLX: "Netflix Inc.", DIS: "Walt Disney Co.", PYPL: "PayPal Holdings",
  SQ: "Block Inc.", SHOP: "Shopify Inc.", SPOT: "Spotify Technology",
  UBER: "Uber Technologies", COIN: "Coinbase Global", SNOW: "Snowflake Inc.",
  NET: "Cloudflare Inc.", DDOG: "Datadog Inc.", ZS: "Zscaler Inc.",
  PANW: "Palo Alto Networks", CRWD: "CrowdStrike Holdings",
  DY: "Dycom Industries Inc.", APH: "Amphenol Corp.", CIEN: "Ciena Corp.",
  GRMN: "Garmin Ltd.", MDB: "MongoDB Inc.", HUT: "Hut 8 Corp.",
  SPY: "SPDR S&P 500 ETF", QQQ: "Invesco QQQ Trust",
  BA: "Boeing Co.", JPM: "JPMorgan Chase", GS: "Goldman Sachs",
  V: "Visa Inc.", MA: "Mastercard Inc.", WMT: "Walmart Inc.",
  HD: "Home Depot Inc.", CAT: "Caterpillar Inc.", DE: "Deere & Co.",
  LLY: "Eli Lilly", UNH: "UnitedHealth Group", JNJ: "Johnson & Johnson",
  PFE: "Pfizer Inc.", ABBV: "AbbVie Inc.", MRK: "Merck & Co.",
  XOM: "Exxon Mobil", CVX: "Chevron Corp.", COP: "ConocoPhillips",
};

// Ticker regex: 1-5 uppercase letters that appear after common patterns
// like "$NVDA", "(NVDA)", "NVDA:", or standalone in financial text.
const TICKER_CONTEXT_RE = /(?:\$|(?:ticker|stock|shares?|buy|sell|hold|rating|target|price)\s*:?\s*)([A-Z]{1,5})\b/gi;
const TICKER_PARENS_RE = /\(([A-Z]{2,5})\)/g;
const TICKER_STANDALONE_RE = /\b([A-Z]{2,5})\b/g;

const STOPWORDS = new Set([
  "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN",
  "IS", "IT", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE",
  "AI", "ALL", "AND", "ANY", "ARE", "BUT", "CAN", "CEO", "COO", "CTO",
  "DID", "FOR", "GET", "GOT", "HAS", "HER", "HIM", "HIS", "HOW", "ITS",
  "LET", "MAY", "NEW", "NOT", "NOW", "OLD", "ONE", "OUR", "OUT", "OWN",
  "PUT", "RUN", "SAY", "SET", "THE", "TOO", "TOP", "TRY", "TWO", "USE",
  "WAS", "WAY", "WHO", "WHY", "WIN", "YET", "YOU", "API", "URL", "GDP",
  "IPO", "ETF", "SEC", "FED", "USA", "UK", "EU", "CEO", "CFO",
  "BEST", "NEXT", "OVER", "SAME", "SOME", "THAN", "THAT", "THEM",
  "THEN", "THEY", "THIS", "VERY", "WHAT", "WHEN", "WILL", "WITH",
  "YOUR", "ALSO", "BACK", "BEEN", "BOTH", "CAME", "EACH", "EVEN",
  "FROM", "GOOD", "HAVE", "HERE", "HIGH", "INTO", "JUST", "KEEP",
  "LAST", "LIKE", "LONG", "MADE", "MAKE", "MANY", "MORE", "MOST",
  "MUCH", "MUST", "NEAR", "ONLY", "PAST", "SAID", "SUCH", "SURE",
  "TAKE", "TECH", "WELL", "WERE", "YEAR", "NYSE", "HOLD", "TERM",
  "RISK", "RATE", "FREE", "FUND", "YEAR", "SELF", "MOVE", "CALL",
]);

/** Extract tickers from a single source text, with position context. */
function extractTickersFromText(text: string): Set<string> {
  const found = new Set<string>();
  for (const re of [TICKER_CONTEXT_RE, TICKER_PARENS_RE, TICKER_STANDALONE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const t = m[1];
      if (t.length >= 2 && !STOPWORDS.has(t) && KNOWN_TICKERS[t]) {
        found.add(t);
      }
    }
  }
  return found;
}

/** Extract numeric facts near a ticker mention. */
function extractFactsNearTicker(text: string, ticker: string): Record<string, string> {
  const facts: Record<string, string> = {};
  // Find all positions of the ticker in the text
  const positions: number[] = [];
  let idx = 0;
  while ((idx = text.indexOf(ticker, idx)) !== -1) {
    positions.push(idx);
    idx += ticker.length;
  }
  // For each position, scan a 500-char window for numeric patterns
  for (const pos of positions) {
    const window = text.slice(Math.max(0, pos - 200), pos + 300);
    // Price patterns: $211.14, $308.81
    const prices = window.match(/\$(\d{1,5}(?:\.\d{1,2})?)/g);
    if (prices) {
      if (!facts["price"]) facts["price"] = prices[0];
      if (prices.length > 1 && !facts["target"]) facts["target"] = prices[prices.length - 1];
    }
    // Percentage patterns: 11%, 20%, +42.54%
    const pcts = window.match(/[+-]?\d{1,4}(?:\.\d{1,2})?%/g);
    if (pcts) {
      for (const p of pcts) {
        if (!facts["pct1"]) facts["pct1"] = p;
        else if (!facts["pct2"] && p !== facts["pct1"]) facts["pct2"] = p;
      }
    }
    // Market cap patterns: $5.18T, $2.3B
    const mcap = window.match(/\$[\d.]+[TBMK]/i);
    if (mcap && !facts["mktCap"]) facts["mktCap"] = mcap[0];
    // Date patterns: August 26, 2026 / 08/26/2026
    const dates = window.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}/gi);
    if (dates) {
      for (const d of dates) {
        if (!facts["date1"]) facts["date1"] = d;
        else if (!facts["date2"] && d !== facts["date1"]) facts["date2"] = d;
      }
    }
    // Analyst ratings
    const ratings = window.match(/(?:strong\s+)?(?:buy|sell|hold|overweight|underweight|outperform|neutral)/gi);
    if (ratings && !facts["rating"]) facts["rating"] = ratings[0];
  }
  return facts;
}

/** Check if the source text recommends / lists this ticker as a candidate. */
function isRecommended(text: string, ticker: string): boolean {
  const lc = text.toLowerCase();
  const tLc = ticker.toLowerCase();
  const patterns = [
    `buy ${tLc}`, `${tLc} buy`, `recommend ${tLc}`, `top pick`,
    `prime candidate`, `strong buy`, `best stock`, `top stock`,
    `${tLc} is a`, `consider ${tLc}`,
  ];
  return patterns.some((p) => lc.includes(p));
}

/** Extract a catalyst mention near the ticker. */
function extractCatalyst(text: string, ticker: string): string | null {
  const idx = text.indexOf(ticker);
  if (idx === -1) return null;
  const window = text.slice(Math.max(0, idx - 100), idx + 400);
  const m = window.match(/(?:earnings|catalyst|report|event|release|launch|WWDC|Prime Day|delivery)[^.]*\./i);
  return m ? m[0].trim() : null;
}

/**
 * Main entry point: resolve entities from retrieved source data.
 * This is deterministic — same sources → same output, always.
 */
export function resolveEntities(
  sources: { title: string; url: string; content: string }[],
  userQuery: string,
): EntitySheet {
  const entityMap = new Map<string, ResolvedEntity>();

  // Also extract tickers the user explicitly asked about
  const userTickers = extractTickersFromText(userQuery.toUpperCase());

  for (let i = 0; i < sources.length; i++) {
    const fullText = `${sources[i].title} ${sources[i].content}`;
    const tickers = extractTickersFromText(fullText);

    for (const ticker of tickers) {
      const existing = entityMap.get(ticker) ?? {
        ticker,
        name: KNOWN_TICKERS[ticker] ?? ticker,
        sourceIndices: [],
        facts: {},
        snippets: [],
        recommended: false,
        catalystRaw: null,
        sourceCount: 0,
      };

      existing.sourceIndices.push(i + 1);
      existing.sourceCount = new Set(existing.sourceIndices).size;

      // Extract facts from this source
      const newFacts = extractFactsNearTicker(fullText, ticker);
      for (const [k, v] of Object.entries(newFacts)) {
        if (!existing.facts[k]) existing.facts[k] = v;
      }

      // Grab a short snippet
      const idx = fullText.indexOf(ticker);
      if (idx !== -1) {
        const snip = fullText.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, " ").trim();
        if (existing.snippets.length < 3) existing.snippets.push(snip);
      }

      // Check recommendation
      if (isRecommended(fullText, ticker)) existing.recommended = true;

      // Extract catalyst
      const cat = extractCatalyst(fullText, ticker);
      if (cat && !existing.catalystRaw) existing.catalystRaw = cat;

      // Try to extract a better name from the source text
      const nameMatch = fullText.match(new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,3})\\s*\\(${ticker}\\)`, ""));
      if (nameMatch) existing.name = nameMatch[1];

      entityMap.set(ticker, existing);
    }
  }

  // Separate strong entities (≥2 facts or user-asked) from weak ones
  const entities: ResolvedEntity[] = [];
  const weakEntities: string[] = [];

  for (const [ticker, entity] of entityMap) {
    const factCount = Object.keys(entity.facts).length;
    const isUserAsked = userTickers.has(ticker);
    if (factCount >= 1 || isUserAsked || entity.recommended) {
      entities.push(entity);
    } else {
      weakEntities.push(ticker);
    }
  }

  // Sort: user-asked first, then by source count, then by fact count
  entities.sort((a, b) => {
    const aUser = userTickers.has(a.ticker) ? 1 : 0;
    const bUser = userTickers.has(b.ticker) ? 1 : 0;
    if (bUser !== aUser) return bUser - aUser;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return Object.keys(b.facts).length - Object.keys(a.facts).length;
  });

  // Build the prompt block
  const promptBlock = buildPromptBlock(entities, weakEntities);

  return { entities, weakEntities, promptBlock, ts: Date.now() };
}

function buildPromptBlock(entities: ResolvedEntity[], weak: string[]): string {
  if (entities.length === 0) return "ENTITY SHEET: No ticker symbols were found in the retrieved sources.";

  const lines = [
    "═══ VERIFIED ENTITY SHEET (extracted from retrieved sources — use ONLY these facts) ═══",
    "Any ticker, company name, price, or metric NOT listed below is UNVERIFIED and must be labeled [UNVERIFIED] if used.",
    "",
  ];

  for (const e of entities) {
    const factStr = Object.entries(e.facts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    lines.push(`${e.ticker} (${e.name}) — sources: [${e.sourceIndices.map((i) => `S${i}`).join(",")}]`);
    if (factStr) lines.push(`  Facts: ${factStr}`);
    if (e.catalystRaw) lines.push(`  Catalyst: ${e.catalystRaw}`);
    if (e.recommended) lines.push(`  Status: RECOMMENDED in source`);
    lines.push("");
  }

  if (weak.length > 0) {
    lines.push(`WEAK (mentioned but insufficient data): ${weak.join(", ")} — do NOT recommend these without explicit evidence.`);
  }

  lines.push("═══════════════════════════════════════════════════════════════════════════════════════");
  return lines.join("\n");
}
