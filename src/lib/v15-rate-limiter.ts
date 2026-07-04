/**
 * V15 Per-Model Rate Limiter — enforces the ACTUAL Gemini free-tier limits so
 * the calibration harness stops hitting 429s. Tracks per-model RPM (rolling
 * 60s window) and RPD (rolling 24h window). If a call would exceed either,
 * the limiter either waits (short overrun) or reports the model as
 * temporarily throttled so the rotator can pick a different one.
 *
 * Numbers below are the CONSERVATIVE side of each model's published limit
 * (user-reported / observed / free-tier) — using the smaller of the two
 * numbers the user provided (e.g. "9 / 5" → 5) so we never exceed either
 * apparent ceiling.
 *
 * Any model not in the table falls back to a safe default (3 RPM, 15 RPD).
 * The limiter is fully additive: nothing calls it unless explicitly wired
 * through acquireSlot() / releaseSlot() in the rotator.
 */

export interface ModelLimit {
  rpm: number;   // requests per minute
  rpd: number;   // requests per day
  tpm?: number;  // tokens per minute (not enforced, informational)
  category?: string;
}

// Conservative floors from user-supplied observed limits (min(observed, published)).
export const MODEL_LIMITS: Record<string, ModelLimit> = {
  "gemini-2.5-flash-lite":  { rpm: 10, rpd: 20, tpm: 39_750,  category: "Text" },
  "gemini-2.5-flash":       { rpm: 5,  rpd: 20, tpm: 104_960, category: "Text" },
  "gemini-3.5-flash":       { rpm: 5,  rpd: 20, tpm: 25_850,  category: "Text" },
  "gemini-3-flash-preview": { rpm: 5,  rpd: 15, tpm: 17_380,  category: "Text" },
  "gemini-3.1-flash-lite":  { rpm: 15, rpd: 84, tpm: 53_560,  category: "Text" },
  "gemma-4-31b-it":         { rpm: 11, rpd: 47, tpm: 33_090,  category: "Other" },
  "gemma-4-26b-it":         { rpm: 5,  rpd: 20, tpm: 30_000,  category: "Other" },
  "gemma-3-27b-it":         { rpm: 5,  rpd: 20, tpm: 30_000,  category: "Other" },
};

const DEFAULT_LIMIT: ModelLimit = { rpm: 3, rpd: 15 };

interface UsageBook {
  minute: number[];   // ms timestamps within last 60s
  day: number[];      // ms timestamps within last 24h
  inflight: number;   // outstanding requests (not yet resolved)
}

const usage: Map<string, UsageBook> = new Map();

function book(model: string): UsageBook {
  let u = usage.get(model);
  if (!u) { u = { minute: [], day: [], inflight: 0 }; usage.set(model, u); }
  return u;
}

function prune(u: UsageBook, now: number): void {
  u.minute = u.minute.filter(t => now - t < 60_000);
  u.day = u.day.filter(t => now - t < 86_400_000);
}

export function getLimit(model: string): ModelLimit {
  return MODEL_LIMITS[model] ?? DEFAULT_LIMIT;
}

export interface UsageSnapshot {
  model: string;
  rpmUsed: number; rpmMax: number; rpmRemaining: number;
  rpdUsed: number; rpdMax: number; rpdRemaining: number;
  inflight: number;
  msUntilNextSlot: number;   // 0 if free right now
  throttled: boolean;
}

export function snapshotUsage(model: string): UsageSnapshot {
  const now = Date.now();
  const u = book(model);
  prune(u, now);
  const lim = getLimit(model);
  const rpmUsed = u.minute.length + u.inflight;
  const rpdUsed = u.day.length + u.inflight;
  const rpmFree = rpmUsed < lim.rpm;
  const rpdFree = rpdUsed < lim.rpd;
  const throttled = !rpmFree || !rpdFree;

  let msUntilNextSlot = 0;
  if (!rpmFree && u.minute.length > 0) {
    const oldest = Math.min(...u.minute);
    msUntilNextSlot = Math.max(0, 60_000 - (now - oldest));
  }
  if (!rpdFree) msUntilNextSlot = Math.max(msUntilNextSlot, 60_000 * 60 * 4); // very large stub

  return {
    model,
    rpmUsed, rpmMax: lim.rpm, rpmRemaining: Math.max(0, lim.rpm - rpmUsed),
    rpdUsed, rpdMax: lim.rpd, rpdRemaining: Math.max(0, lim.rpd - rpdUsed),
    inflight: u.inflight,
    msUntilNextSlot,
    throttled,
  };
}

export function snapshotAllUsage(): UsageSnapshot[] {
  return Object.keys(MODEL_LIMITS).map(snapshotUsage);
}

/**
 * Reserve a slot on `model` if available. Returns true if reserved (caller
 * MUST call recordResult() after the call), false if it should skip.
 *
 * If `waitIfShort` is true and the wait to a free minute-slot is < 3s, the
 * function awaits and then reserves. This makes bursty short waits smooth
 * without holding a call for 55s under load.
 */
export async function tryAcquire(model: string, waitIfShort = true): Promise<boolean> {
  const snap = snapshotUsage(model);
  if (!snap.throttled) {
    const u = book(model);
    u.inflight++;
    return true;
  }
  if (waitIfShort && snap.msUntilNextSlot > 0 && snap.msUntilNextSlot <= 3_000 && snap.rpdRemaining > 0) {
    await new Promise(r => setTimeout(r, snap.msUntilNextSlot + 40));
    // Recheck after wait
    const s2 = snapshotUsage(model);
    if (!s2.throttled) { book(model).inflight++; return true; }
  }
  return false;
}

/** Record the outcome of a completed request (successful or not). */
export function recordResult(model: string, ok: boolean): void {
  const u = book(model);
  u.inflight = Math.max(0, u.inflight - 1);
  const now = Date.now();
  if (ok) {
    u.minute.push(now);
    u.day.push(now);
  }
  prune(u, now);
}

/** Pick the best model from `pool` right now (least-loaded, respects limits). */
export function pickLeastLoaded(pool: string[]): string | null {
  const snaps = pool.map(snapshotUsage);
  const free = snaps.filter(s => !s.throttled);
  if (free.length === 0) return null;
  free.sort((a, b) => {
    // Prefer highest remaining fraction, then lowest inflight
    const fa = (a.rpmRemaining / a.rpmMax) + (a.rpdRemaining / a.rpdMax);
    const fb = (b.rpmRemaining / b.rpmMax) + (b.rpdRemaining / b.rpdMax);
    if (fb !== fa) return fb - fa;
    return a.inflight - b.inflight;
  });
  return free[0].model;
}
