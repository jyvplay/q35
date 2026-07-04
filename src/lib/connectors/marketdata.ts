import type { StockArtifact } from "../artifacts";

/**
 * Browser-side Alpha Vantage resolver.
 * Returns null on any failure; callers must treat missing numbers as unknown.
 */
export async function alphaVantageStockResolver(ticker: string, apiKey: string): Promise<Partial<StockArtifact> | null> {
  if (!apiKey) return null;
  const base = "https://www.alphavantage.co/query";
  const quoteUrl = `${base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
  const overviewUrl = `${base}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const [quoteRes, overviewRes] = await Promise.all([fetch(quoteUrl), fetch(overviewUrl)]);
    if (!quoteRes.ok || !overviewRes.ok) return null;
    const quote = await quoteRes.json() as Record<string, any>;
    const overview = await overviewRes.json() as Record<string, any>;
    const q = quote["Global Quote"] ?? {};
    const priceRaw = q["05. price"];
    const price = priceRaw ? Number(priceRaw) : null;
    const marketCapRaw = overview["MarketCapitalization"];
    const marketCap = marketCapRaw ? compactMarketCap(Number(marketCapRaw)) : "";
    const rating = ratingFromAnalystTarget(price, Number(overview["AnalystTargetPrice"] || 0));
    return {
      price: Number.isFinite(price) ? price : null,
      mktCap: marketCap,
      analystRating: rating,
      asOf: new Date().toISOString(),
      source: "alphavantage",
    };
  } catch {
    return null;
  }
}

function compactMarketCap(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return String(Math.round(n));
}

function ratingFromAnalystTarget(price: number | null, target: number): StockArtifact["analystRating"] {
  if (!price || !target || !Number.isFinite(price) || !Number.isFinite(target)) return "N/A";
  const upside = (target - price) / price;
  if (upside >= 0.25) return "Strong Buy";
  if (upside >= 0.10) return "Buy";
  if (upside > -0.10) return "Hold";
  if (upside > -0.25) return "Sell";
  return "Strong Sell";
}