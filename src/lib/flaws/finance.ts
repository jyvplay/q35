/**
 * Finance Domain Pack v1
 *
 * Targets text-detectable failure modes in financial/investment content:
 *   - Unsolicited investment advice without registration/suitability caveat
 *   - "Guaranteed returns" / "no risk"
 *   - Past-performance-as-future-results
 *   - Crypto/security misclassification under Howey
 *   - Tax advice without CPA/EA caveat
 *   - GAAP/IFRS conflation
 *   - Backtest without out-of-sample
 *   - Sharpe ratio / VaR misuse
 *   - "Risk-free" attached to non-Treasury instruments
 *   - Insider information indicators
 *   - SEC Rule 10b-5 risk language
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (
  severity: FlawIssue["severity"],
  code: string,
  message: string,
  remediation: string,
): FlawIssue => ({ severity, code, message, remediation });

function T(c: ScanContext): string { return `${c.prompt}\n${c.answer}`; }
function isFinance(c: ScanContext): boolean {
  return /\b(stock|bond|equity|portfolio|invest|investment|trading|trader|broker|asset|securit|fund|ETF|mutual fund|hedge fund|options|futures|derivat|crypto|bitcoin|ethereum|token|ICO|IPO|SEC|FINRA|GAAP|IFRS|EBITDA|P\/E|ROI|NPV|IRR|Sharpe|alpha|beta|volatility|drawdown|VaR|capital|dividend|yield|interest rate|fed|treasury|tax|IRS|401k|IRA|Roth|capital gain|short sale|margin)\b/i.test(T(c));
}
function isAdvisoryFinance(c: ScanContext): boolean {
  return isFinance(c) && /\b(you should|recommend|buy|sell|invest in|allocate|put your money|portfolio.*allocation|best stock|best investment)\b/i.test(c.answer);
}

export const FINANCE_FLAWS: FlawDetector[] = [
  // ── Investment-adviser registration / suitability ─────────────────────────
  {
    id: "fin.no-adviser-disclaimer",
    domain: "domain",
    description: "Direct investment advice without RIA / fiduciary / suitability caveat.",
    appliesTo: isAdvisoryFinance,
    scan: c => /\b(you should buy|you should sell|you should invest|recommend buying|recommend selling|put your money in|buy [A-Z]{1,5} now)\b/i.test(c.answer)
      && !/\b(not\s+(?:financial|investment)\s+advice|consult\s+(?:a\s+)?(?:licensed|registered|financial)\s+(?:adviser|advisor|RIA|CFP)|registered\s+investment\s+adviser|fiduciary|suitabili|for\s+informational\s+purposes|do\s+your\s+own\s+research)\b/i.test(c.answer)
      ? [mk("major", "FIN_NO_ADVISER_DISCLAIMER", "Direct investment advice without 'not financial advice / consult registered adviser' caveat.", "Add: 'This is for informational purposes only and not financial advice. Consult a licensed/registered investment adviser (RIA, CFP) about your specific situation before making investment decisions.' Required by SEC/FINRA rules and to limit liability.")]
      : [],
  },

  // ── Guaranteed-returns / risk-free fallacies ──────────────────────────────
  {
    id: "fin.guaranteed-returns",
    domain: "domain",
    description: "'Guaranteed returns' or 'no risk' language outside Treasury/FDIC context.",
    appliesTo: isFinance,
    scan: c => /\b(guaranteed\s+(?:returns?|profits?|gains?)|risk[-\s]free\s+(?:returns?|profits?|gains?)|zero\s+risk|no\s+risk\s+of\s+loss|can[']?t\s+lose|cannot\s+lose)\b/i.test(c.answer)
      && !/\b(U\.S\.\s+Treasur|T-?bill|FDIC[-\s]?insured|government[-\s]?backed)\b/i.test(c.answer)
      ? [mk("critical", "FIN_GUARANTEED_RETURNS", "'Guaranteed returns' / 'no risk' / 'risk-free' language used outside Treasury/FDIC context — Rule 10b-5 / FTC misrepresentation risk.", "No equity, crypto, hedge-fund, or private-investment product is 'risk-free' or 'guaranteed'. SEC Rule 10b-5 prohibits material misrepresentation. Reserve 'risk-free' for U.S. Treasuries and FDIC-insured deposits up to limit.")]
      : [],
  },
  {
    id: "fin.risk-free-misuse",
    domain: "domain",
    description: "'Risk-free rate' applied to non-Treasury / non-sovereign instrument.",
    appliesTo: isFinance,
    scan: c => /\brisk[-\s]?free\s+rate\b/i.test(c.answer)
      && /\b(corporate bond|junk bond|high[-\s]yield|stock|equity|crypto|emerging market)\b/i.test(c.answer)
      && !/\b(spread\s+over|excess\s+(?:return|yield)|treasury\s+yield)\b/i.test(c.answer)
      ? [mk("major", "FIN_RISK_FREE_MISUSE", "'Risk-free rate' applied to risk-bearing instrument.", "Risk-free rate refers to U.S. Treasury (or equivalent sovereign) yield only. Other instruments have credit/default risk and are priced as spread over the risk-free rate.")]
      : [],
  },

  // ── Past performance / regulatory boilerplate ─────────────────────────────
  {
    id: "fin.past-performance",
    domain: "domain",
    description: "Citing past returns as predictive of future without disclaimer.",
    appliesTo: isFinance,
    scan: c => /\b(returned|gained|posted|achieved)\s+\d+\s*%(?:\s+(?:over|in)\s+the\s+(?:past|last)\s+\d+\s+years?)?[\s\S]{0,80}\b(will|expect|likely)\s+(?:to\s+)?(?:gain|return|earn|continue)/i.test(c.answer)
      && !/\b(past\s+performance\s+(?:is\s+not|does\s+not\s+guarantee))/i.test(c.answer)
      ? [mk("major", "FIN_PAST_PERFORMANCE", "Past returns presented as predictive of future returns without disclaimer.", "Per SEC and FINRA: past performance is not indicative of future results. Add disclaimer or reframe historical data as illustrative only.")]
      : [],
  },

  // ── Tax / accounting precision ────────────────────────────────────────────
  {
    id: "fin.tax-no-jurisdiction",
    domain: "domain",
    description: "Tax statements without jurisdiction (federal vs state, U.S. vs foreign).",
    appliesTo: c => /\b(tax|IRS|capital gain|deduction|withholding|1099|W-2|filing|return)\b/i.test(T(c)),
    scan: c => /\b(tax\s+rate\s+is|you\s+(?:owe|pay)|deduct(?:ible)?|tax[-\s]?free|exempt|capital\s+gains\s+tax)\b/i.test(c.answer)
      && /\b(is|are|equals?|\d+\s*%)\b/i.test(c.answer)
      && !/\b(U\.S\.\s+federal|federal\s+income|state\s+tax|California|New York|Texas|varies\s+by\s+state|foreign|jurisdiction|consult\s+a\s+(?:CPA|tax\s+(?:adviser|professional))|Enrolled\s+Agent)\b/i.test(c.answer)
      ? [mk("major", "FIN_TAX_NO_JURISDICTION", "Tax rate / treatment stated without jurisdiction or 'consult a CPA' caveat.", "U.S. federal vs state vs foreign tax treatment varies materially. Specify jurisdiction and add: 'Consult a CPA or Enrolled Agent for your specific situation.'")]
      : [],
  },
  {
    id: "fin.gaap-ifrs-conflation",
    domain: "domain",
    description: "GAAP and IFRS conflated as equivalent.",
    appliesTo: c => /\b(GAAP|IFRS|accounting standards?|financial statements?)\b/i.test(T(c)),
    scan: c => /\b(GAAP\s+and\s+IFRS\s+(?:are|both)\s+(?:the\s+same|equivalent|interchangeable)|GAAP\s+is\s+(?:basically\s+)?IFRS)\b/i.test(c.answer)
      ? [mk("major", "FIN_GAAP_IFRS_CONFLATION", "GAAP and IFRS conflated as equivalent — they differ materially in inventory, R&D, lease accounting, etc.", "Differentiate: U.S. GAAP (FASB, rules-based) vs IFRS (IASB, principles-based). Key differences: LIFO permitted under GAAP but not IFRS; R&D capitalization rules differ; lease accounting (ASC 842 vs IFRS 16) differs.")]
      : [],
  },

  // ── Quantitative finance hygiene ──────────────────────────────────────────
  {
    id: "fin.backtest-no-oos",
    domain: "domain",
    description: "Backtest result cited without out-of-sample / look-ahead disclosure.",
    appliesTo: c => /\b(backtest|backtesting|strategy returned|simulated returns)\b/i.test(T(c)),
    scan: c => /\bbacktest(?:ed|ing)?\b[\s\S]{0,80}\b(?:returned|achieved|earned|gained)\s+\d+\s*%/i.test(c.answer)
      && !/\b(out[-\s]?of[-\s]?sample|walk[-\s]?forward|look[-\s]?ahead|survivorship|overfit|in[-\s]?sample\s+only)\b/i.test(c.answer)
      ? [mk("major", "FIN_BACKTEST_NO_OOS", "Backtest performance cited without out-of-sample / look-ahead / survivorship-bias disclosure.", "Always disclose: in-sample vs out-of-sample period, walk-forward validation, look-ahead-bias controls, survivorship-bias correction (delisted tickers included), and transaction cost / slippage assumptions.")]
      : [],
  },
  {
    id: "fin.sharpe-no-period",
    domain: "domain",
    description: "Sharpe ratio cited without time period / risk-free benchmark.",
    appliesTo: c => /\bSharpe\b/i.test(T(c)),
    scan: c => /\bSharpe\s+(?:ratio\s+)?(?:of|=)\s*\d+(?:\.\d+)?\b/i.test(c.answer)
      && !/\b(annuali[sz]ed|period|risk[-\s]?free|monthly|daily|over\s+\d+\s+(?:year|month))/i.test(c.answer)
      ? [mk("warning", "FIN_SHARPE_NO_PERIOD", "Sharpe ratio cited without specifying annualization / period / risk-free benchmark.", "Sharpe = (R_p - R_f) / σ_p. Always state: time period, annualization basis (e.g. √252 for daily, √12 for monthly), and risk-free rate used.")]
      : [],
  },
  {
    id: "fin.var-no-confidence",
    domain: "domain",
    description: "Value-at-Risk cited without confidence level / horizon.",
    appliesTo: c => /\bVaR\b/i.test(T(c)),
    scan: c => /\bVaR\s+(?:of|=|is)\s*\$?\d/i.test(c.answer)
      && !/\b(\d{2}\s*%\s+confidence|95\s*%|99\s*%|1[-\s]?day|10[-\s]?day|horizon)\b/i.test(c.answer)
      ? [mk("warning", "FIN_VAR_NO_CONFIDENCE", "Value-at-Risk cited without confidence level or time horizon.", "VaR is always conditioned on confidence (e.g. 95% or 99%) AND horizon (e.g. 1-day, 10-day). Specify both. Also note VaR's known limitations (does not bound tail loss; consider CVaR/Expected Shortfall).")]
      : [],
  },

  // ── Securities law triggers ───────────────────────────────────────────────
  {
    id: "fin.crypto-howey",
    domain: "domain",
    description: "Crypto token classified as 'not a security' without Howey test discussion.",
    appliesTo: c => /\b(crypto|token|ICO|altcoin|bitcoin|ethereum|coin)\b/i.test(T(c)),
    scan: c => /\b(?:is\s+not\s+a\s+security|won[']?t\s+be\s+regulated\s+by\s+SEC|outside\s+SEC\s+jurisdiction)\b/i.test(c.answer)
      && !/\b(Howey\s+test|investment\s+contract|expectation\s+of\s+profits|common\s+enterprise)\b/i.test(c.answer)
      ? [mk("major", "FIN_CRYPTO_HOWEY", "Crypto token classified as 'not a security' without Howey test analysis.", "U.S. SEC applies the Howey test (1946): an investment of money in a common enterprise with expectation of profits from the efforts of others = security. Discuss the four prongs explicitly before claiming non-security status.")]
      : [],
  },
  {
    id: "fin.insider-trading-marker",
    domain: "domain",
    description: "Language consistent with material non-public information trading advice.",
    appliesTo: isFinance,
    scan: c => /\b(insider\s+(?:info|information|knowledge|tip)|material\s+non[-\s]?public|MNPI|before\s+the\s+announcement|before\s+earnings\s+(?:are\s+)?released|got\s+a\s+tip\s+from)\b/i.test(c.answer)
      && /\b(buy|sell|trade|short|long|position)\b/i.test(c.answer)
      ? [mk("critical", "FIN_INSIDER_TRADING_MARKER", "Content implies trading on material non-public information (MNPI) — securities-fraud / SEC Rule 10b-5 / insider-trading exposure.", "Refuse to advise on trading based on MNPI. Direct the user to disclosure obligations and counsel. Insider trading is a federal crime under SEC Rule 10b-5 and the Securities Exchange Act of 1934.")]
      : [],
  },

  // ── Crypto / DeFi safety ──────────────────────────────────────────────────
  {
    id: "fin.defi-no-impermanent-loss",
    domain: "domain",
    description: "DeFi liquidity-pool returns cited without impermanent-loss disclosure.",
    appliesTo: c => /\b(DeFi|liquidity\s+pool|LP\s+token|AMM|Uniswap|Curve|Balancer|yield\s+farm)\b/i.test(T(c)),
    scan: c => /\b(?:APY|APR|yield)\s+of\s+\d+\s*%/i.test(c.answer)
      && !/\b(impermanent\s+loss|IL|divergence\s+loss|smart\s+contract\s+risk|rug\s+pull)\b/i.test(c.answer)
      ? [mk("major", "FIN_DEFI_NO_IL", "DeFi LP / yield-farm APY cited without impermanent-loss and smart-contract-risk disclosure.", "DeFi LP returns can be wiped out by impermanent loss when token prices diverge, plus smart-contract bugs, oracle manipulation, and rug-pull risk. Disclose all three explicitly.")]
      : [],
  },
];
