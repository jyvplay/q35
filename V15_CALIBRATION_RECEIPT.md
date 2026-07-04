# V15 Calibration — Change Receipt (Codex-V15-Calibration-Rebuild)

Build: PASS · 197 modules · dist/index.html 975 KB / 306 KB gzip · deterministic.

## Root-cause fix: "judge: —" (broken pipeline in the screenshot)
The single judge (top-Elo model) was consumed by the drafting/editing burst and hit
the client-side rate limiter at judge time, leaving 0 judgments → null judge score.
`parallelJudgeRotation` now, when every substitute is momentarily throttled, WAITS for
the soonest minute-window to free (bounded, ≤6 attempts / ≤8s each) and retries on a
different model. No more silent "judge: —".

## Delivered this turn (all additive)
1. **Independent comparative judge** — new `runComparativeJudge()`: a THIRD judge with a
   fresh context that sees the QUESTION + BOTH answers, scores each, computes the gap,
   names the winner, and lists concrete improvements each needs to reach 9.9. Rendered as
   a dedicated amber card in the batch detail pane.
2. **Per-question run settings** — `V15RunOutcome.runSettings` records depth, model,
   4-Stage, cluster size, SLOOP pages, template, style override, persona, adversarial,
   web, defense-pack, testbed, judge-mode; shown as a mono strip above each result.
3. **Williams-style persona** — `ARCHETYPES` imported from the npm package; a persona
   selector in the profile bar; the chosen archetype is injected into the draft directives.
4. **Adversarial engine wired** — `runAdversarialRedTeam` imported from the npm package and
   run on the V15 draft when enabled; blocking defects fold into the guard issues + score.
5. **Live web grounding** — new `v15-grounding.ts` reuses the app's own
   `searchWithGroundingFallback` (PrismaFetch → OG scraper → Jina). A "Web grounding"
   toggle + OG/PrismaFetch/Jina sub-toggles. Retrieved evidence is threaded into the
   FIRST draft AND every subsequent N-Deep editor pass (maximum contextual carry-through).
6. **In-order execution** — the pipeline runs strictly Draft → (per depth: scan → 246-gate →
   testbed-mine → refine) → adversarial → judge → comparative-judge → divergence. No step is
   skipped; depth is honored (no early exit when depth ≥ 3).

## Notes
- Solution vs. the proposed "improve scraping frequency": rather than polling scrapers
  repeatedly, we ground ONCE up front and CARRY the evidence block through every pass —
  this maximizes contextual info per the request while minimizing rate-limit pressure
  (fewer network calls, evidence reused across all N-Deep refinements).

Status: stable.
