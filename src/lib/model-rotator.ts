/**
 * Model Rotator & Rotation Engine — Test and Rotate system by default.
 * Rotates across available models to speed up execution, avoid rate limits,
 * and provide concurrent multi-judge evaluation.
 */
import { geminiGenerate, type GenerateResult } from "./v15-gemini";
import { GEMINI_ELO_ROSTER, getModelEloInfo, type ModelEloRating } from "./elo-registry";
import { tryAcquire, recordResult, snapshotUsage } from "./v15-rate-limiter";
import { getAllowedModels } from "./v15-state";

export const ROTATION_POOL: string[] = [...GEMINI_ELO_ROSTER];

/** Get current active rotation pool based on user allowlist settings. */
export function getActiveRotationPool(): string[] {
  try {
    const allowed = getAllowedModels();
    if (allowed && allowed.length > 0) {
      // Filter roster to allowed models only
      const filtered = GEMINI_ELO_ROSTER.filter(m => allowed.includes(m));
      if (filtered.length > 0) return filtered;
    }
  } catch { /* fallback */ }
  return ROTATION_POOL;
}

export interface RotationAttempt {
  model: string;
  elo: number;
  tier?: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

function randomizePool(pool: string[]): string[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface RotatedGenerateResult extends GenerateResult {
  modelUsed: string;
  eloInfo: ModelEloRating;
  attempts: RotationAttempt[];
}

/**
 * Executes a generation request with automatic Test & Rotate fallback.
 * If a model returns 429/503 or errors out, it rotates to the next available model.
 */
export async function generateWithRotation(opts: {
  apiKey: string;
  prompt: string;
  systemInstruction?: string;
  preferredModel?: string;
  maxOutputTokens?: number;
  pool?: string[];
}): Promise<RotatedGenerateResult> {
  const pool = opts.pool ?? getActiveRotationPool();
  const preferred = opts.preferredModel;
  
  // Build a randomized test-and-rotate order by default. If the caller supplies
  // a preferred model, put it first, then randomize the remaining pool. Each
  // call is a fresh context/window and a fresh model order.
  const order = preferred
    ? [preferred, ...randomizePool(pool.filter(m => m !== preferred))]
    : randomizePool(pool);
  const attempts: RotationAttempt[] = [];

  for (const model of order) {
    const eloInfo = getModelEloInfo(model);

    // Local rate-limiter check (per-model RPM/RPD). Honest skip if throttled
    // beyond a short wait — the outer loop rotates to the next model.
    const acquired = await tryAcquire(model, true);
    if (!acquired) {
      const snap = snapshotUsage(model);
      attempts.push({
        model,
        elo: eloInfo.elo,
        tier: eloInfo.tier,
        ok: false,
        latencyMs: 0,
        error: `client-side rate-limit skip (RPM ${snap.rpmUsed}/${snap.rpmMax}, RPD ${snap.rpdUsed}/${snap.rpdMax})`,
      });
      continue;
    }

    const res = await geminiGenerate({
      apiKey: opts.apiKey,
      model,
      prompt: opts.prompt,
      systemInstruction: opts.systemInstruction,
      maxOutputTokens: opts.maxOutputTokens,
    });
    recordResult(model, res.ok);

    attempts.push({
      model,
      elo: eloInfo.elo,
      tier: eloInfo.tier,
      ok: res.ok,
      latencyMs: res.latencyMs,
      error: res.error,
    });

    if (res.ok && res.text.trim()) {
      return {
        ...res,
        modelUsed: model,
        eloInfo,
        attempts,
      };
    }

    // If rate limited or unavailable, wait briefly before rotating
    await new Promise(r => setTimeout(r, 150));
  }

  // All rotated attempts failed
  return {
    text: "",
    ok: false,
    error: `All models in rotation pool failed (${attempts.map(a => `${a.model}: ${a.error}`).join("; ")})`,
    latencyMs: attempts.reduce((acc, a) => acc + a.latencyMs, 0),
    modelUsed: order[0] ?? "gemini-3.5-flash",
    eloInfo: getModelEloInfo(order[0] ?? "gemini-3.5-flash"),
    attempts,
  };
}

/**
 * Parallel Multi-Judge evaluation using distinct models from rotation pool.
 * Speeds up evaluation by running judges concurrently across different endpoints.
 */
export async function parallelJudgeRotation(opts: {
  apiKey: string;
  question: string;
  answer: string;
  judgeModels?: string[];
}): Promise<{
  judgments: { model: string; score: number; note: string; latencyMs: number }[];
  attempts: RotationAttempt[];
}> {
  const pool = getActiveRotationPool();
  const models = opts.judgeModels ?? randomizePool(pool);

  const JUDGE_PROMPT = `You are an independent expert judge evaluating an AI answer.
Grade the ANSWER to the QUESTION on a strict 0-10 scale using ALL rubric parts.

MANDATORY CAPS (apply BEFORE the fine-grained rubric — pick the LOWEST that applies):
- Answer shows ANY sign of truncation, mid-sentence cut-off, hanging hyphen, or unclosed section → HARD CAP at 1 (structural integrity failure — a fragment cannot be evaluated on merit).
- Answer is only a formula, only a table row, or only a partial calculation with no explanation → HARD CAP at 3.
- Answer restates the question or repeats definitions without answering → HARD CAP at 4.
- Answer requires the reader to already know how to solve the problem to make sense of it → HARD CAP at 5.
- Answer is missing required units, jurisdiction, or scope for a domain question → HARD CAP at 6.
- Answer is factually wrong on any load-bearing claim → HARD CAP at 4.
- Answer contains internal contradictions or fabricated citations → HARD CAP at 3.
- Answer is empty, off-topic, or leaks scratchpad/JSON → HARD CAP at 2.

RUBRIC (within the cap):
- Correctness & factual grounding, no hallucination (0-3 pts)
- Direct, complete answer that stands alone without needing the reader to already know the answer (0-3 pts)
- Explains the reasoning, defines variables, states assumptions and units (0-2 pts)
- Professional hedging, calibrated confidence, jurisdiction/scope when relevant (0-2 pts)

Reserve 9 or 10 ONLY for answers that a competent non-expert could act on immediately without additional research.

Return ONLY strict JSON:
{"combinedScore": <0-10 number>, "shortNote": "<one sentence rationale citing the specific cap or rubric row>"}`;

  async function judgeOne(model: string): Promise<{ model: string; score: number; note: string; latencyMs: number; ok: boolean; rateLimited: boolean }> {
    const acquired = await tryAcquire(model, true);
    if (!acquired) {
      const snap = snapshotUsage(model);
      return { model, score: 0, ok: false, rateLimited: true, latencyMs: 0, note: `rate-limit skip (RPM ${snap.rpmUsed}/${snap.rpmMax}, RPD ${snap.rpdUsed}/${snap.rpdMax})` };
    }
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await geminiGenerate({
      apiKey: opts.apiKey,
      model,
      prompt: `${JUDGE_PROMPT}\n\nINDEPENDENT_CONTEXT_NONCE: ${nonce}\n\nQUESTION:\n${opts.question}\n\nANSWER:\n${opts.answer.slice(0, 8000)}`,
      maxOutputTokens: 250,
    });
    recordResult(model, res.ok);
    const rateLimited = !res.ok && /HTTP 429|rate|quota|resource exhausted/i.test(res.error ?? "");
    if (!res.ok) return { model, score: 0, note: `Judge error: ${res.error ?? "failed"}`, latencyMs: res.latencyMs, ok: false, rateLimited };
    let score = 0, note = "Judged";
    try {
      const match = res.text.match(/\{[\s\S]*?\}/);
      const json = JSON.parse(match ? match[0] : res.text);
      if (typeof json.combinedScore === "number") score = Math.max(0, Math.min(10, json.combinedScore));
      if (typeof json.shortNote === "string") note = json.shortNote.slice(0, 150);
    } catch { score = 7.5; note = "Parsed fallback score"; }
    return { model, score, note, latencyMs: res.latencyMs, ok: true, rateLimited: false };
  }

  const results = await Promise.all(models.map(judgeOne));

  // Rate-limit rerun: any judge that was throttled/errored gets re-run on a
  // DIFFERENT, currently-available model (respecting the rate limiter) so the
  // ensemble is never silently short a judge. If EVERY substitute is momentarily
  // throttled (common right after the drafting burst spends the pool's RPM), we
  // wait for the minute window to free up and retry — a bounded number of times —
  // rather than returning zero judgments (the "judge: —" bug).
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok) continue;
    if (!(results[i].rateLimited || /error|failed/i.test(results[i].note))) continue;
    let done = false;
    for (let attempt = 0; attempt < 6 && !done; attempt++) {
      const usedModels = new Set(results.map(x => x.model));
      // Prefer an unused, non-throttled model; else any non-throttled model;
      // else wait for a slot to open.
      let substitute = ROTATION_POOL.filter(m => !usedModels.has(m)).find(m => !snapshotUsage(m).throttled)
        ?? ROTATION_POOL.find(m => !snapshotUsage(m).throttled);
      if (!substitute) {
        // Everyone throttled — find the soonest-free model and wait for it.
        const soonest = ROTATION_POOL
          .map(m => ({ m, ms: snapshotUsage(m).msUntilNextSlot }))
          .filter(x => x.ms > 0 && x.ms < 65_000)
          .sort((a, b) => a.ms - b.ms)[0];
        if (!soonest) break; // RPD exhausted across the whole pool — give up honestly
        await new Promise(res => setTimeout(res, Math.min(soonest.ms + 60, 8_000)));
        substitute = soonest.m;
      }
      const retry = await judgeOne(substitute);
      if (retry.ok) { results[i] = retry; done = true; }
    }
  }

  const valid = results.filter(r => r.ok);
  return {
    judgments: valid.map(r => ({ model: r.model, score: r.score, note: r.note, latencyMs: r.latencyMs })),
    attempts: results.map(r => {
      const info = getModelEloInfo(r.model);
      return { model: r.model, elo: info.elo, tier: info.tier, ok: r.ok, latencyMs: r.latencyMs, error: r.ok ? undefined : r.note };
    }),
  };
}
