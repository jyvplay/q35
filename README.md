# VeritasChat + GBSE — Restored App + Additive V15 Calibration Harness

Primary app: `src/App.tsx` mounts the canonical npm package app from
`veritas-q35-unified/src/App` and adds only one floating V15
calibration rail. No npm package file is modified.

## Current State

- Original UI restored and styled under Tailwind v4 via `src/index.css` with
  `@source "../node_modules/veritas-q35-unified/src"`.
- V15 overlay is minimized by default as a tiny left-center rail, so it does not
  cover the original chat input or header.
- V15 calibration dialog includes:
  - Live Compare tab
  - Batch Bank tab
  - 1-5 question cap
  - custom question support
  - sequential per-question completion before moving to next
  - baseline score, V15 guard score, V15 third-party judge score
  - independent comparative judge over both answers
  - improvement ledger for guard-vs-judge divergence
  - 9-model Gemini Test-and-Rotate roster
  - rate-limit-aware judge retry on a different model
  - per-question run settings
  - Williams persona selector
  - adversarial-engine toggle
  - web grounding toggle with exact OG / PrismaFetch / Jina backend selection
  - 246-defense catalog pack toggle
  - advanced gate testbed toggle
  - long-report cohesion pass
  - downloadable JSON/MD receipts

## Build Verification

Use the platform build tool only:

```txt
build_project: PASS
```

Latest verified build:

- 197 modules transformed
- `dist/index.html` about 975 KB / 306 KB gzip
- workers preserved: `graph.worker`, `compute.worker`

## Notes For Future Agents

- Do not modify `vite.config.ts`.
- Do not create `eject.*` files.
- Do not reinstall `veritas-q35-unified`.
- Keep the V15 system additive unless the user explicitly authorizes editing or
  ejecting the npm package source.
- The active receipt is `V15_CALIBRATION_RECEIPT.md`.

Status: stable. unfinished: 0.