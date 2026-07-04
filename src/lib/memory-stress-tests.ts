/**
 * Memory Stress Tests — deterministic in-browser workloads that mimic the
 * heaviest research configurations (SLOOP + N-Deep + Cluster) and verify
 * the memory governor keeps the heap within budget.
 *
 * No network calls. Pure in-browser allocation simulations that mirror the
 * actual peak memory patterns of each pipeline phase, using the governor's
 * own safe-cap helpers and draft caps to predict whether the user's chosen
 * configuration will OOM on their device BEFORE they launch a heavy query.
 */

import {
  readMemoryReport,
  safeClusterWidth,
  safeNDeepPasses,
  safeSloopPages,
  safeDraftCharCap,
  settleHeap,
  type MemoryReport,
} from "./memory-governor";

// ─── Legacy minimal API (back-compat with existing MemoryStressPanel) ─────────
export interface StressResult {
  passed: boolean;
  peakMB: number;
  durationMs: number;
  notes: string[];
}

// ─── New advanced API (R2 patch integration) ─────────────────────────────────
export interface StressTestStep {
  name: string;
  ok: boolean;
  details: string;
  pressureBefore: number;
  pressureAfter: number;
  ms: number;
}

export interface StressTestReport {
  config: {
    sloopPages: number;
    sloopSections: number;
    clusterWidth: number;
    nDeepPasses: number;
    draftCharsPerSection: number;
  };
  steps: StressTestStep[];
  startReport: MemoryReport;
  endReport: MemoryReport;
  passed: boolean;
  peakMB: number;
  durationMs: number;
  recommendedConfig?: {
    sloopPages: number;
    clusterWidth: number;
    nDeepPasses: number;
  };
}

function repeat(s: string, n: number): string {
  // Array.join is O(n) — avoids quadratic string concatenation.
  return new Array(n + 1).join(s);
}

async function timed<T>(fn: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}

function pressure(): number {
  return readMemoryReport().pressure;
}

/** Synthetic workload that mimics SLOOP section generation. */
function sloopSectionAlloc(chars: number): { digest: string; alloc: number } {
  const block = repeat("LOREM IPSUM DOLOR SIT AMET CONSECTETUR ", Math.max(1, Math.ceil(chars / 40)));
  const text = block.slice(0, chars);
  const digest = text.slice(0, 240);
  return { digest, alloc: text.length };
}

/** Synthetic workload that mimics N-Deep redraft memory pattern. */
function nDeepRedraftAlloc(chars: number): string {
  const a = repeat("X", chars);
  const b = repeat("Y", chars);
  const c = repeat("Z", Math.min(safeDraftCharCap(), Math.round(chars * 1.05)));
  void a.length; void b.length;
  return c;
}

/** Synthetic workload that mimics a cluster wave: N parallel payloads. */
async function clusterWaveAlloc(width: number, payloadChars: number): Promise<number> {
  const promises = new Array(width).fill(0).map((_v, i) =>
    Promise.resolve(repeat(String.fromCharCode(65 + (i % 26)), payloadChars))
  );
  const arr = await Promise.all(promises);
  const total = arr.reduce((sum, s) => sum + s.length, 0);
  return total;
}

/**
 * Advanced stress test — separates SLOOP, Cluster, and N-Deep phases with
 * per-step pressure tracking and recommends a safe configuration on failure.
 */
export async function runStressTestAdvanced(opts: {
  sloopPages: number;
  clusterWidth: number;
  nDeepPasses: number;
  draftCharsPerSection?: number;
}): Promise<StressTestReport> {
  const startReport = readMemoryReport();
  const start = Date.now();
  const sloopSections = Math.max(4, opts.sloopPages * 2);
  const draftCharsPerSection = Math.min(
    opts.draftCharsPerSection ?? 18_000,
    safeDraftCharCap(),
  );
  const steps: StressTestStep[] = [];
  let peakMB = startReport.usedMB;

  // Step 1 — SLOOP synthetic section pass
  {
    const before = pressure();
    const t = await timed(async () => {
      let totalAlloc = 0;
      const digests: string[] = [];
      for (let i = 0; i < sloopSections; i++) {
        const { digest, alloc } = sloopSectionAlloc(draftCharsPerSection);
        digests.push(digest);
        totalAlloc += alloc;
        const r = readMemoryReport();
        if (r.usedMB > peakMB) peakMB = r.usedMB;
        await new Promise(r => setTimeout(r, 0));
      }
      return { digests, totalAlloc };
    });
    const after = pressure();
    steps.push({
      name: `SLOOP synthetic ${sloopSections} sections @ ${Math.round(draftCharsPerSection / 1024)}KB`,
      ok: after < 0.92,
      details: `Allocated ${(t.value.totalAlloc / 1048576).toFixed(1)} MB total; held ${t.value.digests.length} digests`,
      pressureBefore: before,
      pressureAfter: after,
      ms: t.ms,
    });
  }
  await settleHeap(20);

  // Step 2 — Cluster wave parallelism
  {
    const before = pressure();
    const safeWidth = safeClusterWidth(opts.clusterWidth, readMemoryReport());
    const t = await timed(() => clusterWaveAlloc(safeWidth, 12_000));
    const after = pressure();
    const r = readMemoryReport();
    if (r.usedMB > peakMB) peakMB = r.usedMB;
    steps.push({
      name: `Cluster wave width=${opts.clusterWidth} (governor capped to ${safeWidth})`,
      ok: after < 0.92,
      details: `Total parallel payload ${(t.value / 1048576).toFixed(1)} MB`,
      pressureBefore: before,
      pressureAfter: after,
      ms: t.ms,
    });
  }
  await settleHeap(20);

  // Step 3 — N-Deep redraft loop
  {
    const before = pressure();
    const safePasses = safeNDeepPasses(opts.nDeepPasses, draftCharsPerSection * sloopSections, readMemoryReport());
    const t = await timed(async () => {
      let current = repeat("S", Math.min(safeDraftCharCap(), draftCharsPerSection * 2));
      for (let p = 0; p < safePasses; p++) {
        current = nDeepRedraftAlloc(current.length);
        const r = readMemoryReport();
        if (r.usedMB > peakMB) peakMB = r.usedMB;
        await new Promise(r => setTimeout(r, 0));
      }
      return current.length;
    });
    const after = pressure();
    steps.push({
      name: `N-Deep redraft passes requested=${opts.nDeepPasses} (governor capped to ${safePasses})`,
      ok: after < 0.95,
      details: `Final working draft chars ${t.value}`,
      pressureBefore: before,
      pressureAfter: after,
      ms: t.ms,
    });
  }

  const endReport = readMemoryReport();
  const passed = steps.every(s => s.ok) && endReport.pressure < 0.92;
  const durationMs = Date.now() - start;

  let recommendedConfig: StressTestReport["recommendedConfig"] | undefined;
  if (!passed) {
    recommendedConfig = {
      sloopPages: safeSloopPages(opts.sloopPages, endReport),
      clusterWidth: safeClusterWidth(opts.clusterWidth, endReport),
      nDeepPasses: safeNDeepPasses(opts.nDeepPasses, draftCharsPerSection * sloopSections, endReport),
    };
  }

  return {
    config: {
      sloopPages: opts.sloopPages,
      sloopSections,
      clusterWidth: opts.clusterWidth,
      nDeepPasses: opts.nDeepPasses,
      draftCharsPerSection,
    },
    steps,
    startReport,
    endReport,
    passed,
    peakMB,
    durationMs,
    recommendedConfig,
  };
}

/** Legacy entry point — returns minimal StressResult shape for existing callers. */
export async function runMemoryStressTest(opts: {
  pages: number;
  passes: number;
  cluster: number;
  onProgress?: (msg: string) => void;
}): Promise<StressResult> {
  opts.onProgress?.(`start: pages=${opts.pages} passes=${opts.passes} cluster=${opts.cluster}`);
  const report = await runStressTestAdvanced({
    sloopPages: opts.pages,
    clusterWidth: opts.cluster,
    nDeepPasses: opts.passes,
  });
  for (const s of report.steps) {
    opts.onProgress?.(`${s.name}: ${s.ok ? "OK" : "FAIL"} (${s.pressureBefore.toFixed(2)} → ${s.pressureAfter.toFixed(2)})`);
  }
  return {
    passed: report.passed,
    peakMB: report.peakMB,
    durationMs: report.durationMs,
    notes: report.steps.map(s => `${s.name}: ${s.ok ? "ok" : "warn"}`),
  };
}
