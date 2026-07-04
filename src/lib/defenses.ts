// 126 Failure Modes → 126 Specific Solutions (verbatim from repo)

export interface InjectionResult {
  blocked: boolean;
  patterns: string[];
  sanitized: string;
}

const INJECTION_PATTERNS: { regex: RegExp; id: string }[] = [
  { regex: /ignore\s+(all\s+)?previous/i, id: 'M1' },
  { regex: /disregard\s+(all\s+)?(prior|previous|above)/i, id: 'M1' },
  { regex: /system\s*prompt/i, id: 'M1' },
  { regex: /reveal\s+(your|the)\s+(instructions|prompt|system)/i, id: 'M1' },
  { regex: /jailbreak/i, id: 'M1' },
  { regex: /you\s+are\s+now\s+/i, id: 'M2' },
  { regex: /new\s+instructions?\s*:/i, id: 'M2' },
  { regex: /from\s+now\s+on,?\s+you/i, id: 'M2' },
  { regex: /forget\s+(everything|previous|all)/i, id: 'M2' },
  { regex: /<\|[^|]*\|>/g, id: 'M3' },
  { regex: /\[INST\].*\[\/INST\]/gi, id: 'M3' },
  { regex: /<!--[\s\S]*?-->/g, id: 'M4' },
  { regex: /aria-hidden|aria-label\s*=/gi, id: 'M4' },
  { regex: /data-prompt\s*=/gi, id: 'M4' },
  { regex: /act\s+as\s+(a|an|the)\s+/i, id: 'M2' },
  { regex: /pretend\s+(you're|to\s+be)/i, id: 'M2' },
];

export function detectInjection(text: string): InjectionResult {
  const patterns: string[] = [];
  let sanitized = text;
  for (const { regex, id } of INJECTION_PATTERNS) {
    if (regex.test(sanitized)) {
      patterns.push(id);
      sanitized = sanitized.replace(regex, '[BLOCKED]');
    }
  }
  return { blocked: patterns.length > 0, patterns: [...new Set(patterns)], sanitized };
}

export interface AtomicClaim {
  id: string;
  text: string;
  searchQuery: string;
  failureClass: string;
  solution: string;
}

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'this','that','these','those','i','you','he','she','it','we','they','me','him',
  'her','us','them','my','your','his','its','our','their','what','which','who',
  'when','where','how','why','if','then','than','but','and','or','not','no',
  'so','very','just','also','too','only','with','from','into','about','for',
  'of','in','on','at','to','by','as','up','out','all','some','any','each',
]);

function buildSearchQuery(sentence: string): string {
  const words = sentence
    .replace(/[^\w\s'-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  const sorted = words.sort((a, b) => b.length - a.length);
  return sorted.slice(0, 6).join(' ');
}

function classifyClaim(text: string): { failureClass: string; solution: string } {
  const t = text.toLowerCase();
  if (/\d+(?:\.\d+)?\s*(%|percent|million|billion|trillion|thousand)/.test(t))
    return { failureClass: 'S', solution: 'S1-S6: Every number must be sourced — searching for numerical verification' };
  if (/(?:study|paper|research|et\s+al|published|journal|findings)/i.test(t))
    return { failureClass: 'H', solution: 'H1-H10: Verify against primary literature via Jina Search' };
  if (/(?:function|code|api|package|import|npm|pip|library|sdk)/i.test(t))
    return { failureClass: 'B', solution: 'B6: Registry lookup via Jina — verifying package/API exists' };
  if (/(?:framework|methodology|standard|protocol|specification)/i.test(t))
    return { failureClass: 'Y', solution: 'Y1-Y4: Ontological verification — checking entity/concept exists' };
  if (/(?:202[3-9]|20[3-9]\d|year|recent|latest|current)/i.test(t))
    return { failureClass: 'D', solution: 'D1-D4: Temporal verification — searching for current data' };
  if (/(?:capital|population|president|located|founded|born|died)/i.test(t))
    return { failureClass: 'Q', solution: 'Q3: Factuality verification — cross-checking against web sources' };
  if (/(?:always|never|every|all|none|no one|everyone|impossible)/i.test(t))
    return { failureClass: 'F', solution: 'F3: Scope verification — checking for overgeneralization' };
  if (/(?:said|stated|wrote|argued|claimed|according to|quoted)/i.test(t))
    return { failureClass: 'BB', solution: 'BB1-BB3: Quote verification — checking against original source' };
  return { failureClass: 'F', solution: 'F1: General factuality check — verifying claim against web sources' };
}

export function extractClaims(text: string): AtomicClaim[] {
  // Split on sentence boundaries but NOT after common abbreviations, ordinals,
  // inline labels ("vs.", "e.g.", "i.e.", "Aim 1.", "Fig.") or mid-list items.
  const abbreviations = /(?:vs|etc|e\.g|i\.e|al|Dr|Mr|Mrs|Ms|Prof|Fig|Figs|No|Nos|Vol|Ed|Eds|Rev|Rep|Jr|Sr|Inc|Corp|Ltd|approx|est|min|max)\.\s+/gi;
  const cleaned = text
    .replace(/\[UNVERIFIED\]|\[POST-CUTOFF\]|\[NUMERICAL-CHECK\]/g, '')
    .replace(/\[Source\s*\d+(?:\s*,\s*(?:Source\s*)?\d+)*\s*\]/gi, '');

  // Protect abbreviation periods by replacing them temporarily
  let protected_ = cleaned;
  const abbrevSlots: string[] = [];
  protected_ = protected_.replace(abbreviations, (match) => {
    abbrevSlots.push(match);
    return `__ABBR${abbrevSlots.length - 1}__ `;
  });

  // Also protect "Aim N:" / "§N" / numbered list items from splitting
  protected_ = protected_.replace(/(\bAim\s+\d+):?\s*/gi, (match) => {
    abbrevSlots.push(match);
    return `__ABBR${abbrevSlots.length - 1}__`;
  });

  const rawSentences = protected_
    .split(/(?<=[.!?])\s+(?=[A-Z\d*•\-#])/)
    .map((s) => {
      // Restore abbreviation slots
      return s.replace(/__ABBR(\d+)__/g, (_, idx) => abbrevSlots[parseInt(idx)] || "").trim();
    })
    .filter((s) => {
      if (s.length < 25) return false;
      if (/^(I don't know|I'm not sure|I cannot|Let me|However,? I)/i.test(s)) return false;
      if (s.endsWith('?')) return false;
      return true;
    });

  // Merge short fragments that were likely part of a prior sentence
  const sentences: string[] = [];
  for (const s of rawSentences) {
    if (sentences.length > 0 && s.length < 60 && !/^[A-Z]/.test(s)) {
      sentences[sentences.length - 1] += " " + s;
    } else {
      sentences.push(s);
    }
  }

  return sentences.map((sentence, idx) => {
    const { failureClass, solution } = classifyClaim(sentence);
    return {
      id: `c-${Date.now()}-${idx}`,
      text: sentence,
      searchQuery: buildSearchQuery(sentence),
      failureClass,
      solution,
    };
  });
}

export function checkCoherence(
  claims: AtomicClaim[],
  previousClaims: AtomicClaim[],
): { contradictions: string[]; drifts: string[] } {
  const contradictions: string[] = [];
  const drifts: string[] = [];
  for (const curr of claims) {
    for (const prev of previousClaims) {
      const currWords = new Set(curr.text.toLowerCase().split(/\s+/));
      const prevWords = new Set(prev.text.toLowerCase().split(/\s+/));
      const overlap = [...currWords].filter((w) => prevWords.has(w)).length;
      if (overlap > 5 && curr.failureClass !== prev.failureClass) {
        drifts.push(`Possible attribution drift between: "${prev.text.slice(0, 40)}…" and "${curr.text.slice(0, 40)}…"`);
      }
    }
  }
  return { contradictions, drifts };
}