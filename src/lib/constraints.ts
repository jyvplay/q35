// Deterministic constraint extraction and enforcement.
// Solves the "60-day blindspot" and "instruction spillage" class of failures.
//
// 1) extractConstraints() pulls explicit constraints (time horizon, format,
//    comparison targets, scope hints) from the user's prompt using regex,
//    so the LLM is bound to them rather than asked to infer them.
// 2) sanitizeOutput() strips leaked scratchpad/outline/constraint blocks
//    from the model output BEFORE the user sees it.
// 3) buildConstraintBlock() converts extracted constraints into a hard
//    instruction block that the synthesis prompt prepends.

export interface TimeHorizon {
  value: number;
  unit: "day" | "week" | "month" | "quarter" | "year";
  rawMatch: string;
  /** Approx days, for filtering decisions. */
  days: number;
}

export interface ExtractedConstraints {
  timeHorizon?: TimeHorizon;
  /** Tickers / proper nouns the user named (e.g., NVDA). Used to keep focus. */
  namedEntities: string[];
  /** Explicit comparison targets, e.g. "Is X the best?" → "X". */
  explicitComparisonTargets: string[];
  /** Format hints: "table", "list", "summary", "short", "long", "bullet". */
  formatHints: string[];
  /** Detected user-asked exclusions: "without X", "except X". */
  exclusions: string[];
  /** Single-sentence summary the constraint block restates back to the model. */
  scopeSentence?: string;
  /** Domain flag, used to attach domain-specific guardrails. */
  domain?:
    | "financial"
    | "medical"
    | "legal"
    | "scientific"
    | "engineering"
    | "general";
  /** True when the question is clearly tactical/short-horizon (≤ 90 days). */
  isShortHorizon: boolean;
  /** True when the question is clearly strategic/long-horizon (≥ 1 year). */
  isLongHorizon: boolean;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, few: 3, several: 4, dozen: 12,
};

const UNIT_DAYS: Record<TimeHorizon["unit"], number> = {
  day: 1, week: 7, month: 30, quarter: 91, year: 365,
};

const FINANCIAL_HINTS = /\b(stock|stocks|ticker|equity|equities|share|shares|invest|investment|portfolio|earnings|nvda|tsla|aapl|msft|spy|qqq|s&p|nasdaq|dividend|trade|trader|bull|bear|long|short|put|call|option|crypto|btc|eth)\b/i;
const MEDICAL_HINTS = /\b(symptom|diagnosis|disease|drug|dose|dosage|mg|patient|treatment|therapy|clinical|trial|medication|side effect)\b/i;
const LEGAL_HINTS = /\b(lawsuit|statute|jurisdiction|liability|contract clause|tort|plaintiff|defendant|court|ruling|precedent|jurisprudence)\b/i;
const SCIENCE_HINTS = /\b(study|hypothesis|p-?value|placebo|peer[-\s]?review|methodology|systematic review|meta[-\s]?analysis)\b/i;
const ENG_HINTS = /\b(architecture|algorithm|throughput|latency|protocol|specification|kubernetes|microservice|library|framework|api)\b/i;

function detectDomain(text: string): ExtractedConstraints["domain"] {
  if (FINANCIAL_HINTS.test(text)) return "financial";
  if (MEDICAL_HINTS.test(text)) return "medical";
  if (LEGAL_HINTS.test(text)) return "legal";
  if (SCIENCE_HINTS.test(text)) return "scientific";
  if (ENG_HINTS.test(text)) return "engineering";
  return "general";
}

const TIME_RE =
  /\b(?:next|coming|upcoming|over\s+the\s+next|within|in\s+the\s+next|for\s+the\s+next|in)\s+(a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?:\s+of)?|few|several|dozen|\d+)\s+(day|week|month|quarter|year)s?\b/i;
const TIME_BARE_RE = /\b(\d+)[-\s]?(day|week|month|quarter|year)s?\b/i;

function extractTimeHorizon(text: string): TimeHorizon | undefined {
  const m = text.match(TIME_RE) || text.match(TIME_BARE_RE);
  if (!m) return undefined;
  const wordValue = m[1].toLowerCase().replace(/\s+of$/, "");
  const value = WORD_NUMBERS[wordValue] ?? Number(wordValue);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = m[2].toLowerCase() as TimeHorizon["unit"];
  return { value, unit, rawMatch: m[0], days: value * UNIT_DAYS[unit] };
}

// "Is NVDA the best?" / "Is AAPL good?" / "Should I buy TSLA?"
const COMPARE_RE = /\b(?:is|are|should\s+i\s+(?:buy|sell|hold))\s+([A-Z][A-Z0-9.\-]{0,9})\b/g;
// Standalone tickers in caps (3-5 chars) anywhere in the text.
const TICKER_RE = /\b([A-Z]{2,5})\b/g;
const TICKER_STOPWORDS = new Set([
  "I", "A", "AN", "AND", "OR", "BUT", "FOR", "NOT", "THE", "TO", "OF",
  "IN", "ON", "AT", "BY", "AS", "IS", "BE", "DO", "GO", "GET",
  "WHY", "HOW", "WHAT", "WHO", "WHEN", "WHERE", "WHICH", "MY", "ME", "WE",
  "US", "YOU", "YOUR", "OUR", "HIS", "HER", "ITS", "IT", "SO", "IF",
  "BEST", "WORST", "GOOD", "BAD", "OK", "OKAY", "VS", "VS.", "TLDR",
  "ANY", "ALL", "NEW", "OLD", "TOP", "PRO", "CON", "AI", "ML", "API",
]);

function extractTickers(text: string): { explicit: string[]; named: string[] } {
  const explicit = new Set<string>();
  const named = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = COMPARE_RE.exec(text)) !== null) {
    const t = m[1];
    if (!TICKER_STOPWORDS.has(t.toUpperCase())) explicit.add(t.toUpperCase());
  }
  while ((m = TICKER_RE.exec(text)) !== null) {
    const t = m[1];
    if (!TICKER_STOPWORDS.has(t)) named.add(t);
  }
  return { explicit: [...explicit], named: [...named] };
}

const FORMAT_TOKENS: Array<{ re: RegExp; tag: string }> = [
  { re: /\btable\b|\bmatrix\b|\bcompare?\s+(?:in\s+a\s+)?table\b/i, tag: "table" },
  { re: /\bbullets?\b|\bbullet\s+points?\b/i, tag: "bullets" },
  { re: /\b(short|tldr|quick|brief|concise|one[-\s]?liner)\b/i, tag: "short" },
  { re: /\b(long|detailed|exhaustive|comprehensive|in[-\s]?depth)\b/i, tag: "long" },
  { re: /\b(summary|summari[sz]e)\b/i, tag: "summary" },
  { re: /\b(list|enumerate)\b/i, tag: "list" },
  { re: /\b(json|yaml|markdown|md)\b/i, tag: "structured" },
];

function extractFormatHints(text: string): string[] {
  const hits = new Set<string>();
  for (const { re, tag } of FORMAT_TOKENS) if (re.test(text)) hits.add(tag);
  return [...hits];
}

const EXCLUSION_RE = /\b(?:without|except|excluding|but\s+not|other\s+than)\s+([A-Za-z0-9 ,.\-]+?)(?=[.?!]|$)/gi;

function extractExclusions(text: string): string[] {
  const ex: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = EXCLUSION_RE.exec(text)) !== null) ex.push(m[1].trim());
  return ex;
}

export function extractConstraints(userText: string): ExtractedConstraints {
  const timeHorizon = extractTimeHorizon(userText);
  const { explicit, named } = extractTickers(userText);
  const formatHints = extractFormatHints(userText);
  const exclusions = extractExclusions(userText);
  const domain = detectDomain(userText);

  const namedEntitiesSet = new Set<string>([...explicit, ...named]);
  const namedEntities = [...namedEntitiesSet];

  const isShortHorizon = !!timeHorizon && timeHorizon.days <= 90;
  const isLongHorizon = !!timeHorizon && timeHorizon.days >= 365;

  let scopeSentence: string | undefined;
  if (timeHorizon) {
    scopeSentence = `User asked about a window of ~${timeHorizon.days} day${timeHorizon.days === 1 ? "" : "s"} ("${timeHorizon.rawMatch}").`;
  }

  return {
    timeHorizon,
    namedEntities,
    explicitComparisonTargets: explicit,
    formatHints,
    exclusions,
    scopeSentence,
    domain,
    isShortHorizon,
    isLongHorizon,
  };
}

// ────────────────────────────────────────────────────────────────────
// Constraint block for the synthesis prompt.
// This is the hard instruction the model receives, derived from the
// extracted constraints above. The model gets a small, explicit, and
// deterministic set of rules — no inference of "what the user meant".

export function buildConstraintBlock(c: ExtractedConstraints): string {
  const lines: string[] = ["HARD CONSTRAINTS (you MUST respect, no exceptions):"];

  if (c.timeHorizon) {
    const d = c.timeHorizon.days;
    lines.push(`- TIME WINDOW: The user is asking about a horizon of ~${d} day${d === 1 ? "" : "s"} ("${c.timeHorizon.rawMatch}").`);
    if (c.isShortHorizon) {
      lines.push(`  • This is a SHORT, TACTICAL window. Long-term metrics MUST be excluded unless explicitly relevant.`);
      lines.push(`  • EXCLUDE: 1-year price targets, trailing 12-month returns, multi-year forecasts, distant-quarter projections.`);
      lines.push(`  • INCLUDE: catalysts/events inside the next ${d} days, near-term technical setup, current momentum, immediate macro headlines.`);
      lines.push(`  • If a catalyst (e.g. earnings) falls OUTSIDE this window, you MUST state explicitly that it is OUTSIDE the window and therefore not actionable.`);
    } else if (c.isLongHorizon) {
      lines.push(`  • This is a LONG, STRATEGIC window. Day-to-day price action and intraday technicals are NOT decisive.`);
      lines.push(`  • Prefer multi-year fundamentals, secular trends, valuation framework, and structural risks.`);
    } else {
      lines.push(`  • Filter all evidence to be meaningfully informative within ${d} days.`);
    }
  }

  if (c.explicitComparisonTargets.length > 0) {
    lines.push(`- EXPLICIT COMPARISON TARGET(S): ${c.explicitComparisonTargets.join(", ")}. The user asked specifically about these — address them by name first, then alternatives.`);
  } else if (c.namedEntities.length > 0) {
    lines.push(`- NAMED ENTITIES: ${c.namedEntities.join(", ")}. Keep these in focus.`);
  }

  if (c.formatHints.length > 0) {
    lines.push(`- OUTPUT FORMAT: ${c.formatHints.join(", ")}.`);
    if (c.formatHints.includes("table") || c.formatHints.includes("structured")) {
      lines.push(`  • Use a Markdown table for the comparison. Columns must be scannable.`);
    }
    if (c.formatHints.includes("short") || c.formatHints.includes("summary")) {
      lines.push(`  • Keep the answer brief. No throat-clearing.`);
    }
  }

  if (c.exclusions.length > 0) {
    lines.push(`- EXCLUSIONS: ${c.exclusions.join("; ")}. Do not include these.`);
  }

  if (c.domain === "financial") {
    lines.push(`- DOMAIN GUARDRAIL (financial): This is informational, not investment advice. Mention major risks. Never imply guaranteed returns.`);
  } else if (c.domain === "medical") {
    lines.push(`- DOMAIN GUARDRAIL (medical): Not medical advice. Recommend consulting a clinician for individualized decisions.`);
  } else if (c.domain === "legal") {
    lines.push(`- DOMAIN GUARDRAIL (legal): Not legal advice. Note jurisdictional variance.`);
  }

  lines.push("");
  lines.push("OUTPUT RULES (strict, non-negotiable):");
  lines.push("- Begin with the first sentence of the substantive answer. NO preamble.");
  lines.push("- DO NOT restate the user's question.");
  lines.push("- DO NOT restate or label any constraints (no \"Constraints:\", \"Persona:\", \"Structure:\", \"Direct Answer:\", \"Question:\").");
  lines.push("- DO NOT include an outline, numbered plan, or scratchpad before the prose.");
  lines.push("- DO NOT include extracted-fact bullet dumps before the prose. Synthesize directly.");
  lines.push("- DO NOT mention the source list as a list — cite inline like [Source N].");
  lines.push("- If a piece of evidence falls outside the requested constraints, EITHER omit it OR explicitly mark it as out-of-window context.");
  lines.push("- Every numeric/empirical claim must be inside the user's stated scope, or it must be flagged as out-of-scope.");

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Output sanitizer.
// Strips leaked scratchpad/outline/constraint blocks from model output.
// The model SHOULD follow the rules above, but small models leak. This
// is a deterministic safety net.

const LEAK_PATTERNS: RegExp[] = [
  // "Question: ..." / "User question: ..."
  /^\s*\**\s*(?:User\s+)?Question\s*:\s*.*$/gim,
  // "Constraints: ..."
  /^\s*\**\s*Constraints?\s*:\s*.*$/gim,
  // "Persona: ..."
  /^\s*\**\s*Persona\s*:\s*.*$/gim,
  // "Structure:" possibly followed by a numbered outline
  /^\s*\**\s*Structure\s*:\s*[\s\S]*?(?=\n\s*\n|$)/gim,
  // "Direct Answer:" header (scratchpad header style)
  /^\s*\**\s*Direct\s+Answer\s*:\s*/gim,
  // "Is NVDA the best?" header (scratchpad-restate style at top)
  /^\s*\**\s*Is\s+[A-Z][A-Z0-9.\-]+\s+the\s+best\??\s*:\s*.*$/gim,
  // Hidden XML/tag wrappers that should never appear in output
  /<\/?(?:STYLE_INSTRUCTIONS|RETRIEVED_WEB_DATA|SECOND_PASS_VERIFICATION_RESULTS|HARD_CONSTRAINTS|SCRATCHPAD|THOUGHT|REASONING|PLAN|HIDDEN_REASONING)\b[^>]*>/gi,
  // "Alternative Options: ..." / "The Hardware vs. Software split: ..."
  /^\s*\**\s*Alternative\s+Options\s*:\s*.*$/gim,
  // "Macro Factors:" scratchpad headers
  /^\s*\**\s*Macro\s+Factors?\s*:\s*$/gim,
  // "Catalysts: ..." scratchpad headers
  /^\s*\**\s*(?:Catalysts?|Earnings|Sources?\s+found)\s*:\s*\d.*$/gim,
];

/** Patterns that indicate a leading scratchpad block. Find first prose start. */
const PROSE_BOUNDARY = [
  /\n#{1,6}\s/, // first markdown heading
  /\n\s*[A-Z][^*\n]{40,}/, // first long paragraph line that isn't a bullet
];

export interface SanitizeReport {
  cleaned: string;
  removedSegments: number;
  detectedLeak: boolean;
  notes: string[];
}

export function sanitizeOutput(raw: string): SanitizeReport {
  const notes: string[] = [];
  let detectedLeak = false;
  let cleaned = raw;
  let removedSegments = 0;

  // Strip per-line leak patterns.
  for (const re of LEAK_PATTERNS) {
    const before = cleaned;
    cleaned = cleaned.replace(re, "");
    if (cleaned !== before) {
      removedSegments++;
      detectedLeak = true;
    }
  }

  // If the output BEGINS with a scratchpad-style bullet block (lots of "* X:" lines)
  // before any prose, trim everything up to the first prose paragraph or heading.
  const head = cleaned.slice(0, 1200);
  const headIsBulletDump =
    /^[\s\S]{0,30}\*\s+(?:\*+)?(?:Question|Constraints?|Persona|Structure|Direct\s+Answer|NVDA|MU|STX)/.test(head);
  if (headIsBulletDump) {
    let cutAt = -1;
    for (const re of PROSE_BOUNDARY) {
      const m = cleaned.match(re);
      if (m && m.index !== undefined && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
    }
    if (cutAt > 0) {
      cleaned = cleaned.slice(cutAt).trimStart();
      detectedLeak = true;
      removedSegments++;
      notes.push("Stripped leading scratchpad bullet dump before first prose section.");
    }
  }

  // Collapse runs of >2 blank lines created by stripping.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  if (detectedLeak) {
    notes.push(`Sanitizer removed ${removedSegments} leaked segment(s) from model output.`);
  }

  return { cleaned, removedSegments, detectedLeak, notes };
}

// Friendly one-line summary of the active constraints, for the UI badge.
export function summarizeConstraints(c: ExtractedConstraints): string {
  const parts: string[] = [];
  if (c.timeHorizon) parts.push(`${c.timeHorizon.value} ${c.timeHorizon.unit}${c.timeHorizon.value > 1 ? "s" : ""}`);
  if (c.explicitComparisonTargets.length > 0) parts.push(`focus: ${c.explicitComparisonTargets.join("/")}`);
  if (c.formatHints.length > 0) parts.push(`fmt: ${c.formatHints.join(",")}`);
  if (c.domain && c.domain !== "general") parts.push(`domain: ${c.domain}`);
  return parts.length > 0 ? parts.join(" · ") : "no explicit constraints";
}
