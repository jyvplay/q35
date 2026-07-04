/**
 * Public ticker → company name + sector registry.
 * Deterministic source of truth for resolving tickers. Numeric facts
 * (price, market cap, earnings dates) NEVER live here — those must
 * come from a live data provider via setLiveStockResolver().
 */

export interface TickerMeta {
  name: string;
  sector: string;
}

export const TICKER_NAMES: Record<string, TickerMeta> = {
  // Mega-cap tech
  AAPL: { name: "Apple Inc.", sector: "Consumer Electronics" },
  MSFT: { name: "Microsoft Corp.", sector: "Software" },
  GOOGL: { name: "Alphabet Inc. Class A", sector: "Internet Services" },
  GOOG: { name: "Alphabet Inc. Class C", sector: "Internet Services" },
  AMZN: { name: "Amazon.com Inc.", sector: "E-commerce / Cloud" },
  NVDA: { name: "NVIDIA Corp.", sector: "Semiconductors" },
  META: { name: "Meta Platforms Inc.", sector: "Social Media" },
  TSLA: { name: "Tesla Inc.", sector: "Auto / Energy" },
  // Semiconductors
  AVGO: { name: "Broadcom Inc.", sector: "Semiconductors" },
  AMD: { name: "Advanced Micro Devices", sector: "Semiconductors" },
  INTC: { name: "Intel Corp.", sector: "Semiconductors" },
  QCOM: { name: "Qualcomm Inc.", sector: "Semiconductors" },
  MU: { name: "Micron Technology", sector: "Memory" },
  ASML: { name: "ASML Holding NV", sector: "Semi Equipment" },
  TSM: { name: "Taiwan Semiconductor", sector: "Semi Foundry" },
  // Enterprise / SaaS
  CRM: { name: "Salesforce Inc.", sector: "Enterprise SaaS" },
  NOW: { name: "ServiceNow Inc.", sector: "Enterprise SaaS" },
  ADBE: { name: "Adobe Inc.", sector: "Creative Software" },
  ORCL: { name: "Oracle Corp.", sector: "Database" },
  SNOW: { name: "Snowflake Inc.", sector: "Data Cloud" },
  DDOG: { name: "Datadog Inc.", sector: "Observability" },
  NET: { name: "Cloudflare Inc.", sector: "Edge Networking" },
  CRWD: { name: "CrowdStrike Holdings", sector: "Cybersecurity" },
  PANW: { name: "Palo Alto Networks", sector: "Cybersecurity" },
  ZS: { name: "Zscaler Inc.", sector: "Cybersecurity" },
  // Data / AI
  PLTR: { name: "Palantir Technologies", sector: "Data Analytics" },
  MDB: { name: "MongoDB Inc.", sector: "Database" },
  // Hardware / Networking / Storage
  STX: { name: "Seagate Technology", sector: "Storage" },
  WDC: { name: "Western Digital", sector: "Storage" },
  ANET: { name: "Arista Networks", sector: "Networking" },
  CSCO: { name: "Cisco Systems", sector: "Networking" },
  // Media / Streaming
  NFLX: { name: "Netflix Inc.", sector: "Streaming" },
  DIS: { name: "Walt Disney Co.", sector: "Media / Entertainment" },
  SPOT: { name: "Spotify Technology", sector: "Audio Streaming" },
  // Fintech / Payments
  V: { name: "Visa Inc.", sector: "Payments" },
  MA: { name: "Mastercard Inc.", sector: "Payments" },
  PYPL: { name: "PayPal Holdings", sector: "Payments" },
  COIN: { name: "Coinbase Global", sector: "Crypto Exchange" },
  // Banks
  JPM: { name: "JPMorgan Chase", sector: "Diversified Banks" },
  GS: { name: "Goldman Sachs", sector: "Investment Banking" },
  MS: { name: "Morgan Stanley", sector: "Investment Banking" },
  BAC: { name: "Bank of America", sector: "Diversified Banks" },
  WFC: { name: "Wells Fargo", sector: "Diversified Banks" },
  // Healthcare / Pharma
  LLY: { name: "Eli Lilly and Co.", sector: "Pharmaceuticals" },
  UNH: { name: "UnitedHealth Group", sector: "Managed Care" },
  JNJ: { name: "Johnson and Johnson", sector: "Pharmaceuticals" },
  PFE: { name: "Pfizer Inc.", sector: "Pharmaceuticals" },
  ABBV: { name: "AbbVie Inc.", sector: "Pharmaceuticals" },
  MRK: { name: "Merck and Co.", sector: "Pharmaceuticals" },
  // Energy
  XOM: { name: "Exxon Mobil", sector: "Integrated Oil and Gas" },
  CVX: { name: "Chevron Corp.", sector: "Integrated Oil and Gas" },
  COP: { name: "ConocoPhillips", sector: "Exploration and Production" },
  // Consumer
  WMT: { name: "Walmart Inc.", sector: "Mass Retail" },
  COST: { name: "Costco Wholesale", sector: "Warehouse Retail" },
  HD: { name: "Home Depot Inc.", sector: "Home Improvement" },
  TGT: { name: "Target Corp.", sector: "General Merchandise" },
  // Industrials
  BA: { name: "Boeing Co.", sector: "Aerospace and Defense" },
  CAT: { name: "Caterpillar Inc.", sector: "Construction Machinery" },
  DE: { name: "Deere and Co.", sector: "Agricultural Machinery" },
  // Commonly-confused tickers (the bug from prior critique)
  DY: { name: "Dycom Industries Inc.", sector: "Telecom Construction" },
  APH: { name: "Amphenol Corp.", sector: "Electronic Components" },
  CIEN: { name: "Ciena Corp.", sector: "Optical Networking" },
  GRMN: { name: "Garmin Ltd.", sector: "GPS Devices" },
  HUT: { name: "Hut 8 Corp.", sector: "Bitcoin Mining" },
  // ETFs
  SPY: { name: "SPDR S and P 500 ETF Trust", sector: "ETF (S and P 500)" },
  QQQ: { name: "Invesco QQQ Trust", sector: "ETF (Nasdaq-100)" },
  IWM: { name: "iShares Russell 2000 ETF", sector: "ETF (Small Caps)" },
  DIA: { name: "SPDR Dow Jones Industrial Average ETF", sector: "ETF (Dow)" },
  VTI: { name: "Vanguard Total Stock Market ETF", sector: "ETF (Total Market)" },
};
