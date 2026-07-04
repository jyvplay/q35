import type { ExtractedConstraints } from "./constraints";

export interface CoverageResult {
  requiredFacets: string[];
  coveredFacets: string[];
  coverage: number;
  denominator: number;
  numerator: number;
  method: string;
}

function includesAny(text: string, terms: string[]): boolean {
  const lc = text.toLowerCase();
  return terms.some(t => lc.includes(t.toLowerCase()));
}

export function requiredFacetsFor(query: string, c: ExtractedConstraints): string[] {
  const facets = new Set<string>(["direct_answer", "evidence", "uncertainty"]);
  if (c.timeHorizon) facets.add("time_window");
  if (c.isShortHorizon) {
    facets.add("near_term_catalysts");
    facets.add("out_of_window_filter");
    facets.add("near_term_risk");
  }
  if (c.domain === "financial") {
    facets.add("ticker_identity");
    facets.add("financial_guardrail");
    facets.add("recommendation_basis");
  }
  if (c.domain === "scientific") {
    facets.add("study_design");
    facets.add("reporting_standard");
  }
  for (const e of c.namedEntities) facets.add(`entity:${e}`);
  if (/top\s*\d+|top three|top 3/i.test(query)) facets.add("ranked_options");
  if (c.formatHints.includes("table")) facets.add("table_format");
  return [...facets];
}

export function measureCoverage(opts: {
  query: string;
  constraints: ExtractedConstraints;
  sources: { title: string; content: string }[];
  answer: string;
  verifiedClaims: number;
  totalClaims: number;
}): CoverageResult {
  const required = requiredFacetsFor(opts.query, opts.constraints);
  const sourceText = opts.sources.map(s => `${s.title} ${s.content}`).join("\n");
  const answer = opts.answer;
  const covered: string[] = [];

  for (const f of required) {
    if (f === "direct_answer" && answer.length > 80) covered.push(f);
    else if (f === "evidence" && opts.sources.length > 0 && opts.verifiedClaims > 0) covered.push(f);
    else if (f === "uncertainty" && includesAny(answer, ["risk", "uncertain", "caveat", "not financial advice", "insufficient"])) covered.push(f);
    else if (f === "time_window" && opts.constraints.timeHorizon && includesAny(answer, [String(opts.constraints.timeHorizon.days), opts.constraints.timeHorizon.unit, "window", "horizon"])) covered.push(f);
    else if (f === "near_term_catalysts" && includesAny(answer + sourceText, ["earnings", "catalyst", "launch", "event", "guidance", "report", "delivery", "prime day", "wwdc"])) covered.push(f);
    else if (f === "out_of_window_filter" && includesAny(answer, ["outside window", "outside the window", "after the window", "not actionable"])) covered.push(f);
    else if (f === "near_term_risk" && includesAny(answer, ["risk", "volatility", "pullback", "resistance", "macro", "rates"])) covered.push(f);
    else if (f === "ticker_identity" && opts.constraints.namedEntities.some(e => answer.includes(e))) covered.push(f);
    else if (f === "financial_guardrail" && includesAny(answer, ["not financial advice", "informational", "risk tolerance"])) covered.push(f);
    else if (f === "recommendation_basis" && includesAny(answer, ["because", "basis", "why", "catalyst", "momentum"])) covered.push(f);
    else if (f === "ranked_options" && /\b(1\.|first|top|rank)/i.test(answer)) covered.push(f);
    else if (f === "table_format" && /\|.+\|/.test(answer)) covered.push(f);
    else if (f.startsWith("entity:") && answer.includes(f.slice(7))) covered.push(f);
    else if (f === "study_design" && includesAny(answer, ["trial", "study design", "cohort", "mixed", "qualitative", "randomized"])) covered.push(f);
    else if (f === "reporting_standard" && includesAny(answer, ["PRISMA", "CONSORT", "STROBE", "COREQ", "APA JARS", "NIH"])) covered.push(f);
  }

  const numerator = covered.length;
  const denominator = required.length || 1;
  return {
    requiredFacets: required,
    coveredFacets: covered,
    coverage: numerator / denominator,
    numerator,
    denominator,
    method: "facet coverage = covered required facets / required facets; facets derived deterministically from query constraints and domain",
  };
}