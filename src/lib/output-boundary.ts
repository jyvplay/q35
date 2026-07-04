/**
 * Deterministic Output Boundary — INVERTED approach.
 *
 * Instead of trying to enumerate every possible scratchpad pattern (infinite),
 * we find the FINAL PROSE BLOCK and discard everything else.
 *
 * Strategy:
 * 1. If <final_answer> tags exist, extract that.
 * 2. Otherwise, scan backward from the end of the text to find the last
 *    contiguous block of clean prose (sentences, headings, tables, lists).
 *    Everything before the first line of that block is scratchpad.
 * 3. Line-level filter strips any remaining non-prose lines.
 * 4. Markdown [Source N] artifacts and meta-discourse are cleaned.
 *
 * This approach handles ANY new scratchpad format without code changes,
 * because it identifies the answer positively rather than the scratchpad
 * negatively.
 */

export interface BoundaryResult {
  cleaned: string;
  removedSegments: number;
  notes: string[];
}

// ─── Positive prose detection (what IS the answer) ──────────────────

/** A line is "definitely prose" if it's a natural sentence, heading, table, or list item. */
function isDefinitelyProse(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Markdown heading
  if (/^#{1,6}\s+\w/.test(t)) return true;
  // Markdown table row
  if (/^\|.+\|/.test(t)) return true;
  // Bold heading line
  if (/^\*\*[^*]+\*\*/.test(t)) return true;
  // Numbered list item with substance
  if (/^\d+\.\s+\S/.test(t) && t.length > 20) return true;
  // Bullet list with substance (not a planning bullet)
  if (/^[-*]\s+\S/.test(t) && t.length > 30 && !isPlanning(t)) return true;
  // Natural sentence (40+ chars ending with period/exclamation/question)
  if (t.length >= 40 && /[.!?]$/.test(t) && !isPlanning(t)) return true;
  return false;
}

/** A line is "definitely planning/scratchpad" if it matches known patterns. */
function isPlanning(line: string): boolean {
  const t = line.trim();
  // Indented asterisk planning bullets: "    *   No preamble"
  if (/^\s{2,}\*\s{2,}/.test(line)) return true;
  // Planning labels
  const labels = [
    /^\*?\s*(current (date|state)|target window|style persona|output (format|structure|template)|persona|constraints?|plan|direct answer|goal|old info|new info|the unknown|drafting|check against|sentence \d|bottom[- ]line|self[- ]correction|crucial|observation|decision|refining|addressing|wait[,!]|role|style mode|output rules)/i,
    /^\*?\s*\*[A-Z][^*]*:\*/,
    /^(?:wait|hmm|let me|ok so|actually|self-correction|self-eval|evaluation)/i,
    /\bretrieved records do not\b/i,
    /\bi (cannot|can not|am unable to) (invent|actually|substantiate|confirm)/i,
    /\bthis would be fabrication\b/i,
    /\bthe prompt (says|asks|instructions?|rules?)\b/i,
    /\b(verification|synthesis) (plan |protocol )?mode\b/i,
    /^\s*hypotheses?\s*:\s*$/i,
    /^\s*search quer(y|ies)\s*:\s*$/i,
    /\bi am now proceeding to verify\b/i,
    /\bplease wait for the (final|synthesized) (synthesis|response|answer)\b/i,
    /\bproceeding to (verify|synthesise|synthesize|the final)\b/i,
    /\b(operational|cognitive|reasoning) (flow|trace|ledger)\b/i,
    /\bnon-negotiable rules\b/i,
    /\b(humanistic|varied) phrasing\b/i,
    /\bno preamble\b/i,
    /\bcite inline\b/i,
    /\b(use |applying )["“]?(the |cadenced |elegant )?(narrator|scholar|analyst|naturalist|essayist)["“]?/i,
    /\btemporal anchor\b/i,
    /\bverified entity sheet\b/i,
    /\bstress position\b/i,
    /\bcumulative sentences\b/i,
    /\bfabrication check\b/i,
    /\bsince i am an ai\b/i,
    /\bsimulated (for |market |data |response |idea)/i,
    /\bi (must|should|will) (generate|reconcile|use|provide|make sure|ensure|avoid|explicitly|start with|open with|address)/i,
    /\b(pitfalls|alternatives|pitfalls, alternatives)\b/i,
    /\b(factor 1|factor 2|factor 3)\b/i,
  ];
  for (const re of labels) if (re.test(t)) return true;
  return false;
}

/**
 * Find the final prose block by scanning backward from the end.
 * Returns the index of the first line of the final contiguous prose block.
 */
function findFinalProseStart(lines: string[]): number {
  // Walk backward from the end, skipping blanks, to find the last prose line.
  let lastProse = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isDefinitelyProse(lines[i])) {
      lastProse = i;
      break;
    }
  }
  if (lastProse < 0) return 0; // no prose found, keep everything

  // Now walk backward from lastProse to find where the prose block starts.
  // Allow up to 2 blank lines or short transitional lines between prose lines.
  let start = lastProse;
  let gapCount = 0;
  for (let i = lastProse - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (isDefinitelyProse(lines[i])) {
      start = i;
      gapCount = 0;
    } else if (!t) {
      gapCount++;
      if (gapCount <= 2) {
        start = i; // blank lines between prose paragraphs are ok
      } else {
        break; // more than 2 consecutive blanks = end of prose block
      }
    } else if (isPlanning(lines[i])) {
      break; // hit a planning line = end of prose block going backward
    } else {
      // Ambiguous line (short, not clearly prose or planning)
      // If it's short (<30 chars) and between prose, include it
      if (t.length < 30) {
        gapCount++;
        if (gapCount <= 2) start = i;
        else break;
      } else {
        start = i; // medium-length non-planning line, probably prose
        gapCount = 0;
      }
    }
  }
  return start;
}

// ─── Tag patterns and meta-discourse (same as before) ───────────────

const TAG_PATTERNS: RegExp[] = [
  /\((?:L\d+(?:\/L\d+)?(?:,\s*L\d+(?:\/L\d+)?)*)\)/g,
  /\(simulated for [A-Z][a-z]+ 20\d\d\)/g,
  /\(simulated\)/gi,
];

const META_DISCOURSE: RegExp[] = [
  /based on the (?:provided )?(?:data|search results?|payload|json|sources?)/gi,
  /according to the (?:search|retriev|payload|sources?)/gi,
  /the retrieved (?:documents?|records?) (?:do not provide|shows?|indicates?|states?)/gi,
  /as (?:an?|the) ai[,.]?/gi,
  /\bin conclusion[,.]?/gi,
  /\(self[-\s]?correction:[^)]*\)/gi,
];

// ─── Main entry point ───────────────────────────────────────────────

export function cleanOutput(raw: string): BoundaryResult {
  let s = raw.replace(/\r\n/g, "\n");
  const notes: string[] = [];
  let removed = 0;

  // 1. If the model used <final_answer> tags, prefer those.
  const tagged = s.match(/<final_answer>([\s\S]*?)(?:<\/final_answer>|$)/i);
  if (tagged) {
    notes.push("extracted <final_answer> tag");
    s = tagged[1].trim();
  } else {
    // 2. Inverted approach: find the final prose block and discard the rest.
    const lines = s.split("\n");
    const proseStart = findFinalProseStart(lines);
    if (proseStart > 0) {
      removed += proseStart;
      notes.push(`inverted boundary: dropped ${proseStart} pre-prose lines`);
      s = lines.slice(proseStart).join("\n").trim();
    }
  }

  // 3. Line-level filter: drop any remaining planning lines.
  const linesBefore = s.split("\n");
  const filtered = linesBefore.filter(line => !isPlanning(line));
  if (filtered.length < linesBefore.length) {
    const diff = linesBefore.length - filtered.length;
    removed += diff;
    notes.push(`stripped ${diff} residual planning lines`);
  }
  s = filtered.join("\n");

  // 4. Strip raw [Source N] / [Source N, M] artifacts and tag patterns.
  s = s.replace(/\[Source\s*\d+(?:\s*,\s*(?:Source\s*)?\d+)*\s*\]/gi, "");
  for (const re of TAG_PATTERNS) s = s.replace(re, "");

  // 5. Strip meta-discourse.
  for (const re of META_DISCOURSE) s = s.replace(re, "");

  // 6. Strip leaked XML/HTML structural tags (<paragraph>, <section>, <div>, etc.)
  s = s.replace(/<\/?(paragraph|section|div|span|p|article|header|footer|main)\s*\/?>/gi, "");

  // 7. Strip <scratchpad>...</scratchpad> and <final_response>...</final_response> wrapper tags
  s = s.replace(/<\/?(scratchpad|final_response|thinking|chain_of_thought|cot)\s*>/gi, "");

  // 8. Flag unpopulated placeholders inline
  let placeholderCount = 0;
  s = s.replace(/\[([^\]\n]{2,80})\]/g, (match, inner) => {
    const v = String(inner).trim();
    if (/^source\s*\d+$/i.test(v) || /^\d+$/.test(v)) return match;
    if (/^(?:list of|description of|insert|tbd|placeholder|to be |fill in|add |provide |your )/i.test(v)) {
      placeholderCount++;
      return `⚠️ PLACEHOLDER: ${v}`;
    }
    return match;
  });
  if (placeholderCount > 0) {
    notes.push(`flagged ${placeholderCount} unpopulated template placeholder(s)`);
  }

  // 9. PI-NAME REDACTION GATE — never emit invented Principal Investigator names.
  // Replace any "PI: Dr. Jane Doe" / "Principal Investigator: John Smith" /
  // "led by Dr. X" patterns with a neutral placeholder.
  let piRedactions = 0;
  s = s.replace(/\b(Principal Investigator|PI|Lead Investigator|Co-?PI|Project Director)\s*[:\-]\s*(Dr\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+/g, (m) => {
    piRedactions++;
    const role = m.split(/[:\-]/)[0].trim();
    return `${role}: [To be designated]`;
  });
  s = s.replace(/\b(led by|headed by|directed by)\s+(Dr\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+/g, (m) => {
    piRedactions++;
    const verb = m.split(/\s+/)[0] + " " + m.split(/\s+/)[1];
    return `${verb} the designated Principal Investigator`;
  });
  if (piRedactions > 0) {
    notes.push(`redacted ${piRedactions} invented PI name(s)`);
  }

  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned: s, removedSegments: removed, notes };
}
