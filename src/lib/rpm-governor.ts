/**
 * RPM Governor — serializes and throttles LLM calls so we never exceed the
 * free-tier requests-per-minute ceiling (typically 5–15 RPM on this key).
 *
 * Strategy:
 *  - A single global queue spaces calls by (60000 / rpm) ms minimum interval.
 *  - Callers can batch multiple logical sub-prompts into ONE request via
 *    `batchPrompts()` so the N-Deep engine consumes one RPM slot, not N.
 */

let lastCallTs = 0;
let chain: Promise<void> = Promise.resolve();

export interface ThrottleOpts {
  rpm?: number;
  onWait?: (ms: number) => void;
}

/** Run `fn` on a serialized chain, spacing calls to respect the RPM ceiling.
 *  FIXED: chain cannot deadlock — every link resolves to void regardless of fn outcome. */
export function throttle<T>(fn: () => Promise<T>, opts?: ThrottleOpts): Promise<T> {
  const rpm = Math.max(1, opts?.rpm ?? 10);
  const minInterval = Math.ceil(60_000 / rpm);
  return new Promise<T>((resolve, reject) => {
    chain = chain.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, lastCallTs + minInterval - now);
      if (wait > 0) {
        opts?.onWait?.(wait);
        await new Promise((r) => setTimeout(r, wait));
      }
      lastCallTs = Date.now();
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    }, () => {
      // prior link rejected — still execute this link
      lastCallTs = Date.now();
      fn().then(resolve, reject);
    });
  });
}

/** Reset the throttle chain — call between runs to prevent stale state. */
export function resetThrottle(): void {
  chain = Promise.resolve();
  lastCallTs = 0;
}

export interface BatchSection {
  key: string;     // stable id the model must echo back
  prompt: string;  // the sub-task
}

/**
 * Compose several sub-tasks into ONE prompt that asks the model to return a
 * single JSON object keyed by section id. This collapses N requests into 1,
 * which is the difference between staying under 5 RPM and tripping it.
 */
export function batchPrompts(intro: string, sections: BatchSection[]): string {
  const blocks = sections
    .map((s, i) => `### TASK ${i + 1} — key "${s.key}"\n${s.prompt}`)
    .join("\n\n");
  const keys = sections.map((s) => `"${s.key}"`).join(", ");
  return `${intro}

You will answer ${sections.length} tasks in ONE reply to conserve rate limit.
Return a SINGLE raw JSON object whose keys are exactly: ${keys}.
Each value is a string containing that task's full answer. No prose outside the JSON.

${blocks}`;
}

/** Parse a batched JSON reply back into a key→answer map (best-effort). */
export function parseBatchReply(raw: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let json: any = null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : raw;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { json = JSON.parse(src.slice(start, end + 1)); } catch { /* */ }
  }
  for (const k of keys) {
    if (json && typeof json[k] === "string") out[k] = json[k];
    else if (json && json[k] != null) out[k] = JSON.stringify(json[k]);
    else out[k] = "";
  }
  return out;
}
