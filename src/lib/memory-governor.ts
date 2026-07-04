/**
 * Memory Governor — realistic, browser-aware memory pressure signal.
 * Purpose: prevent OOM crashes during heavy SLOOP/N-Deep/cluster runs by
 * exposing a single shared signal that callers can consult to:
 *   - decide whether to start a new heavy step,
 *   - how many parallel slots to use this wave,
 *   - whether to skip optional steps (adversarial critique, OCR), and
 *   - how to size working draft strings.
 *
 * The governor is intentionally additive — it never disables features, it
 * only caps concurrency / sizes when measured pressure crosses a threshold.
 * All existing code paths still work without it.
 */
export type PressureLevel = "ok" | "elevated" | "warn" | "critical";

export interface MemoryReport {
  /** Used JS heap, MB; 0 if unavailable. */
  usedMB: number;
  /** Raw browser heap ceiling, MB. */
  limitMB: number;
  /** Effective safe working limit for THIS app, MB. */
  softLimitMB: number;
  /** Used / raw limit, 0..1. */
  pctHeap: number;
  /** navigator.deviceMemory (GB) when available; null otherwise. */
  deviceGB: number | null;
  /** Approximate app-state memory, MB (caller-provided, optional). */
  approxStateMB: number;
  /** Composite pressure 0..1 incorporating heap + state + device. */
  pressure: number;
  /** Categorical band derived from the composite pressure. */
  level: PressureLevel;
  /** Realistic free MB budget we still trust to allocate. */
  freeBudgetMB: number;
  /** True when heap telemetry was actually available (Chrome/Edge). */
  heapAvailable: boolean;
}

const SAFETY_MARGIN_MB = 80; // leave headroom for GC, fetches, snapshot
const STATE_TO_HEAP_SCALE = 2.4; // app-state objects pull in retained closures
const DEFAULT_DEVICE_LIMIT_MB = 1024; // fallback when nothing is exposed

// Synthetic allocation tracker
const allocations = new Map<string, number>();

export function recordAllocation(label: string, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    allocations.delete(label);
  } else {
    allocations.set(label, Math.round(bytes));
  }
}

export function clearAllocation(label: string): void {
  allocations.delete(label);
}

export function clearAllocationsByPrefix(prefix: string): void {
  for (const key of Array.from(allocations.keys())) {
    if (key.startsWith(prefix)) allocations.delete(key);
  }
}

function getSyntheticMB(): number {
  let total = 0;
  for (const v of allocations.values()) total += v;
  return Math.round(total / 1048576);
}

export async function yieldForGc(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export async function settleHeap(ms = 25): Promise<void> {
  await yieldForGc(0);
  await yieldForGc(ms);
}

export function readMemoryReport(approxStateMB = 0): MemoryReport {
  const deviceGB =
    typeof (navigator as any).deviceMemory === "number"
      ? ((navigator as any).deviceMemory as number)
      : null;

  let usedMB = 0;
  let limitMB = 0;
  let heapAvailable = false;
  try {
    const mem = (performance as any).memory;
    if (mem) {
      heapAvailable = true;
      usedMB = Math.round(mem.usedJSHeapSize / 1048576);
      limitMB = Math.round(mem.jsHeapSizeLimit / 1048576);
    }
  } catch {
    /* ignore */
  }

  // Heuristic limit when JS heap telemetry is unavailable (Firefox/Safari).
  if (limitMB <= 0) {
    if (deviceGB && deviceGB > 0) limitMB = Math.min(2048, deviceGB * 256);
    else limitMB = DEFAULT_DEVICE_LIMIT_MB;
  }

  // Effective safe working limit.
  const softLimitMB = Math.max(
    256,
    Math.min(
      2048,
      Math.round(limitMB * 0.4),
      deviceGB ? Math.round(deviceGB * 1024 * 0.35) : 1024,
    ),
  );

  const synthMB = getSyntheticMB();
  const effectiveUsedMB = Math.max(usedMB, synthMB);

  const pctHeap = limitMB > 0 ? Math.min(1, effectiveUsedMB / limitMB) : 0;
  const effectiveHeapPressure = softLimitMB > 0 ? Math.min(1, effectiveUsedMB / softLimitMB) : pctHeap;
  const statePressure = softLimitMB > 0 ? Math.min(1, (approxStateMB * STATE_TO_HEAP_SCALE) / softLimitMB) : 0;
  // Composite — take the worst signal and round to 2dp.
  const pressure = Math.min(1, Math.max(effectiveHeapPressure, statePressure));
  const level: PressureLevel =
    pressure >= 0.9 ? "critical" : pressure >= 0.75 ? "warn" : pressure >= 0.55 ? "elevated" : "ok";

  const freeBudgetMB = Math.max(0, Math.round(softLimitMB - effectiveUsedMB - SAFETY_MARGIN_MB));
  return { usedMB: effectiveUsedMB, limitMB, softLimitMB, pctHeap, deviceGB, approxStateMB, pressure, level, freeBudgetMB, heapAvailable };
}

/**
 * Reusable safe-cap helpers used by SLOOP / N-Deep / cluster waves.
 * Design: these are now PERMISSIVE. Because each transient buffer is flattened
 * and freed between iterations (streaming consolidation + settleHeap), the
 * marginal heap cost of an extra SLOOP page / N-Deep pass / cluster lane is
 * small and bounded.
 */
export function safeClusterWidth(requested: number, report = readMemoryReport()): number {
  if (report.level === "critical") return Math.min(requested, 2);
  if (report.level === "warn") return Math.min(requested, 3);
  if (report.level === "elevated") return Math.min(requested, 4);
  // Keep all hypotheses, but run large clusters in safe waves to avoid the
  // scraper/proxy fan-out that caused browser OOMs.
  return Math.min(requested, 4);
}
export function safeSloopPages(requested: number, report = readMemoryReport()): number {
  if (report.level === "critical") return Math.min(requested, 6);
  return requested;
}

export function safeNDeepPasses(requested: number, _sourceChars = 0, report = readMemoryReport()): number {
  let cap = requested;
  if (report.level === "critical") cap = Math.min(cap, 4);
  if (report.freeBudgetMB < 64) cap = Math.min(cap, 2);
  return Math.max(1, cap);
}

export function safeDraftCharCap(report = readMemoryReport()): number {
  const bytesPerChar = 2;
  const buffersInFlight = 3;
  const budgetBytes = Math.max(1, report.freeBudgetMB) * 1024 * 1024;
  const charBudget = Math.floor(budgetBytes / (bytesPerChar * buffersInFlight));
  return Math.max(24_000, Math.min(90_000, charBudget));
}

export function wouldExceedBudget(extraMB: number, report = readMemoryReport()): boolean {
  return extraMB > report.freeBudgetMB;
}

export function shouldSkipAdversarial(draftChars: number, report = readMemoryReport()): boolean {
  if (report.level === "critical") return true;
  if (report.level === "warn" && draftChars > 20_000) return true;
  return false;
}
