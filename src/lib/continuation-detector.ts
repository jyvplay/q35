/**
 * Continuation Detector
 *
 * Detects when an LLM output was truncated mid-generation (hit max_tokens cap).
 * Signs of truncation:
 *  - Multiple consecutive section headers with no body between them
 *  - Text ends mid-sentence (no terminal punctuation)
 *  - Text ends with an opening list marker or table row
 *  - Header-to-prose ratio is heavily skewed toward headers
 */

export interface TruncationDiagnosis {
  truncated: boolean;
  reason: string;
  emptySections: string[];   // section headers that have no body after them
  endsAbruptly: boolean;     // text ends mid-sentence
}

/**
 * Find Markdown headers (## Foo, ### Bar) and check if each has a body.
 * A section is considered "empty" if the text between this header and the
 * next header (or end) is less than 40 chars of non-whitespace content.
 */
export function diagnoseOutput(text: string): TruncationDiagnosis {
  if (!text || text.length < 100) {
    return { truncated: false, reason: "too-short-to-diagnose", emptySections: [], endsAbruptly: false };
  }

  const lines = text.split("\n");
  const headerIndices: Array<{ line: number; title: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,4}\s+(.+)$/) || lines[i].match(/^\*\*(.+?)\*\*\s*$/);
    if (m) {
      headerIndices.push({ line: i, title: m[1].trim() });
    }
  }

  const emptySections: string[] = [];
  for (let i = 0; i < headerIndices.length; i++) {
    const startLine = headerIndices[i].line + 1;
    const endLine = i + 1 < headerIndices.length ? headerIndices[i + 1].line : lines.length;
    const body = lines.slice(startLine, endLine).join(" ").replace(/\s+/g, " ").trim();
    if (body.length < 40) {
      emptySections.push(headerIndices[i].title);
    }
  }

  // Check abrupt termination: last 200 chars should end with terminal punctuation
  const tail = text.trimEnd().slice(-200);
  const endsAbruptly =
    !/[.!?…”")\]]\s*$/.test(text.trimEnd()) &&
    text.trimEnd().length > 200 &&
    !/^#/.test(tail.split("\n").slice(-1)[0] ?? "");

  const headerHeavyRatio = headerIndices.length / Math.max(1, lines.filter(l => l.trim().length > 0).length);
  const tooManyEmpty = emptySections.length >= 2 && headerIndices.length >= 3;

  const truncated = tooManyEmpty || endsAbruptly || (headerHeavyRatio > 0.5 && headerIndices.length >= 3);
  const reason = truncated
    ? tooManyEmpty
      ? `${emptySections.length}/${headerIndices.length} sections are empty (likely truncated mid-generation)`
      : endsAbruptly
        ? "output ends mid-sentence (likely hit max_tokens)"
        : "header-to-body ratio is abnormally high"
    : "output looks complete";

  return { truncated, reason, emptySections, endsAbruptly };
}

/**
 * Build a continuation prompt that asks the model to fill in only the
 * specific empty sections rather than rewriting the whole answer.
 */
export function buildContinuationPrompt(
  originalQuery: string,
  truncatedDraft: string,
  emptySections: string[],
): string {
  return [
    `The prior draft below was truncated and several sections were left as bare headers with no body.`,
    `Fill in ONLY the missing section bodies for: ${emptySections.map(s => `"${s}"`).join(", ")}.`,
    `Do NOT rewrite sections that already have content. Do NOT repeat the section headers in your response.`,
    `Output the new section bodies in Markdown, prefixed with their section header so they can be spliced in.`,
    `Think in neuralese internally; output only plain English.`,
    ``,
    `USER ASK: ${originalQuery.slice(0, 400)}`,
    ``,
    `TRUNCATED DRAFT (last 1500 chars for context):`,
    truncatedDraft.slice(-1500),
  ].join("\n");
}

/**
 * Splice continuation content back into the truncated draft.
 * If a section header is found in both the draft and the continuation,
 * the continuation's body replaces the draft's empty body.
 */
export function spliceContinuation(draft: string, continuation: string): string {
  if (!continuation.trim()) return draft;

  // Parse continuation into section -> body map
  const contMap = new Map<string, string>();
  const headerRe = /^(#{1,4}\s+.+)$/gm;
  const parts = continuation.split(headerRe);
  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i].trim();
    const body = (parts[i + 1] || "").trim();
    if (body) contMap.set(header.replace(/^#+\s+/, "").trim().toLowerCase(), body);
  }

  if (contMap.size === 0) {
    // No structured continuation — just append it
    return draft + "\n\n" + continuation;
  }

  // Splice: for each empty header in the draft, find a matching continuation body
  const draftLines = draft.split("\n");
  const output: string[] = [];
  for (let i = 0; i < draftLines.length; i++) {
    output.push(draftLines[i]);
    const headerMatch = draftLines[i].match(/^#{1,4}\s+(.+)$/);
    if (headerMatch) {
      const key = headerMatch[1].trim().toLowerCase();
      const body = contMap.get(key);
      if (body) {
        // Check if next non-empty line is another header (empty section)
        let j = i + 1;
        while (j < draftLines.length && draftLines[j].trim() === "") j++;
        const nextIsHeader = j >= draftLines.length || /^#{1,4}\s+/.test(draftLines[j]);
        if (nextIsHeader) {
          output.push("");
          output.push(body);
          output.push("");
          contMap.delete(key);
        }
      }
    }
  }

  // Any remaining continuation content gets appended
  if (contMap.size > 0) {
    output.push("");
    for (const [header, body] of contMap) {
      output.push(`## ${header.charAt(0).toUpperCase() + header.slice(1)}`);
      output.push("");
      output.push(body);
      output.push("");
    }
  }

  return output.join("\n");
}
