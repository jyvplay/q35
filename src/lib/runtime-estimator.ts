/**
 * Runtime Estimator — deterministic configuration estimator.
 *
 * Two estimators are exposed:
 *   1. `estimateRuntime(simple)` — legacy minimal estimator (existing API).
 *   2. `estimateRuntime(advanced)` — when called with the advanced input shape,
 *      breaks down per-phase wall-clock seconds for Grounding / SLOOP / N-Deep.
 *
 * Both are pure functions; no network, no LLM calls. Used by MemoryStressPanel
 * to give users a time-budget preview before launching a heavy query.
 */

export interface RuntimeEstimate {
  estimatedSeconds: number;
  llmCalls: number;
  notes: string[];
  /** Per-phase breakdown when advanced estimator is invoked. */
  breakdown?: Array<{ step: string; seconds: number }>;
}

export interface RuntimeEstimateInput {
  // Simple form (back-compat with prior callers)
  pages?: number;
  nDeep?: number;
  cluster?: number;
  searchDepth?: number;
  // Advanced form (new)
  sources?: number;
  hypotheses?: number;
  deepResearch?: boolean;
  sloopPages?: number;
  clusterWidth?: number;
  nDeepPasses?: number;
  forceSloop?: boolean;
  modelFamily?: "gemini-fast" | "gemma-31b" | "other";
}

export function estimateRuntime(opts: RuntimeEstimateInput): RuntimeEstimate {
  // ── Advanced path: triggered when any advanced field is provided ─────────
  const isAdvanced =
    opts.sources !== undefined ||
    opts.hypotheses !== undefined ||
    opts.forceSloop !== undefined ||
    opts.modelFamily !== undefined ||
    opts.deepResearch !== undefined ||
    opts.sloopPages !== undefined ||
    opts.clusterWidth !== undefined ||
    opts.nDeepPasses !== undefined;

  if (isAdvanced) {
    const breakdown: Array<{ step: string; seconds: number }> = [];
    const modelFamily = opts.modelFamily ?? "other";
    const modelFactor = modelFamily === "gemma-31b" ? 1.8 : modelFamily === "gemini-fast" ? 1.0 : 1.25;

    const sources = opts.sources ?? 18;
    const hypotheses = opts.hypotheses ?? 4;
    const sloopPages = opts.sloopPages ?? opts.pages ?? 8;
    const clusterWidth = opts.clusterWidth ?? opts.cluster ?? 6;
    const nDeepPasses = opts.nDeepPasses ?? opts.nDeep ?? 4;
    const deepResearch = opts.deepResearch ?? false;
    const forceSloop = opts.forceSloop ?? true;

    // Grounding search wave: query + hypotheses. Cluster width batches.
    const searchCalls = 1 + Math.max(0, hypotheses);
    const effectiveCluster = Math.max(1, Math.min(clusterWidth, Math.max(1, hypotheses || 1)));
    const searchSeconds = ((searchCalls * 4.2) / effectiveCluster + sources * 0.5) * modelFactor;
    breakdown.push({ step: "Grounding", seconds: searchSeconds });

    if (forceSloop) {
      const sections = Math.max(4, sloopPages * 2);
      const sloopSeconds = sections * 11.5 * modelFactor;
      breakdown.push({ step: "SLOOP", seconds: sloopSeconds });
    } else if (deepResearch) {
      breakdown.push({ step: "4-Stage", seconds: 22 * modelFactor });
    } else {
      breakdown.push({ step: "Direct synthesis", seconds: 10 * modelFactor });
    }

    if (nDeepPasses > 0) {
      // Each pass includes critique + section revisions + batched judge.
      const nDeepSeconds = (nDeepPasses * 17 + 8) * modelFactor;
      breakdown.push({ step: "N-Deep", seconds: nDeepSeconds });
    }

    const estimatedSeconds = Math.round(breakdown.reduce((sum, b) => sum + b.seconds, 0));
    const llmCalls = Math.round(
      (forceSloop ? Math.max(4, sloopPages * 2) : deepResearch ? 4 : 1) +
      nDeepPasses * 3 + // critique + revisions + judge per pass
      Math.max(0, hypotheses) // grounding
    );
    return {
      estimatedSeconds: Math.max(12, estimatedSeconds),
      llmCalls: Math.max(6, llmCalls),
      notes: ["advanced", `model=${modelFamily}`, `pages=${sloopPages}`, `cluster=${clusterWidth}`, `nDeep=${nDeepPasses}`],
      breakdown,
    };
  }

  // ── Simple path: legacy estimator (back-compat) ──────────────────────────
  const p = Math.max(4, Math.min(16, opts.pages ?? 8));
  const nd = Math.max(1, Math.min(12, opts.nDeep ?? 4));
  const c = Math.max(2, Math.min(20, opts.cluster ?? 8));
  const d = Math.max(3, Math.min(12, opts.searchDepth ?? 5));

  const llmCalls = Math.round(p * 1.4 + nd * 1.1 + (c * 0.6) + (d * 0.8));
  const seconds = Math.round(p * 1.65 + nd * 2.0 + (c * 0.95) + (d * 1.05));

  return {
    estimatedSeconds: Math.max(12, seconds),
    llmCalls: Math.max(6, llmCalls),
    notes: ["heuristic", `pages=${p}`, `nDeep=${nd}`, `cluster=${c}`],
  };
}

/**
 * Smoke test: verifies estimator produces sane output for the user-reported
 * failing config (8 SLOOP / 4 N-Deep / 8 Cluster / 5 depth, 4-stage on).
 * Used by MemoryStressPanel for at-load self-check.
 */
export function runtimeEstimatorSmoke(): RuntimeEstimate {
  const target = estimateRuntime({
    sources: 18,
    hypotheses: 4,
    deepResearch: true,
    forceSloop: true,
    sloopPages: 8,
    clusterWidth: 8,
    nDeepPasses: 4,
    modelFamily: "gemma-31b",
  });
  if (target.estimatedSeconds <= 0) throw new Error("runtime estimate must be positive");
  if (!target.breakdown?.find(b => b.step === "SLOOP")) throw new Error("expected SLOOP step");
  if (!target.breakdown?.find(b => b.step === "N-Deep")) throw new Error("expected N-Deep step");
  return target;
}
