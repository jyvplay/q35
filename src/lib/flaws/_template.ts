/**
 * DOMAIN PACK TEMPLATE — copy to e.g. medical.ts / legal.ts / finance.ts,
 * fill in detectors from your domain research, then add ONE line to flaws/index.ts:
 *   registerFlawPack("<domain>", <DOMAIN>_FLAWS);
 *
 * Canonical examples in this codebase:
 *   - flaws/statistics.ts (broad methodology)
 *   - flaws/statistics-advanced.ts (specialist supplement)
 *   - flaws/software-extended.ts (cross-stack software engineering)
 *   - flaws/software-rn-webgl.ts (RN + WebGL/WebGPU)
 *
 * They demonstrate:
 *  • a self-gating isXContent(ctx) helper so the pack is invisible on unrelated content
 *  • a local mk() helper that builds FlawIssues with concrete `remediation` strings
 *    (surfaced into the Universal Rigor critique LLM automatically)
 *  • detectors that pair an `appliesTo` gate with a tight `scan` regex to keep FP near zero
 *
 * Shared toolkit available from "../flaw-registry":
 *   isNumericPrompt, hasUnits, numberAppearsIn, isFactualPrompt, clampN, roundN
 *
 * Pack-level controls available from "../flaw-registry":
 *   setPackEnabled("<name>", boolean)  → enable/disable the whole pack at runtime
 *   listPacks()                        → introspect registered packs and counts
 *   loadDeclarativePack({...})         → load packs from JSON/CSV without writing TS
 */
import type { FlawDetector, ScanContext } from "../flaw-registry";

function isYourDomainContent(ctx: ScanContext): boolean {
  // Permissive gate: any keyword fingerprint of your domain.
  return /\byour-domain-keyword\b/i.test(`${ctx.prompt} ${ctx.answer}`);
}

export const TEMPLATE_FLAWS: FlawDetector[] = [
  {
    id: "domain.example.rule-1",
    domain: "domain",
    description: "Catalog ref or short citation + 1-line human description of the failure mode.",
    appliesTo: isYourDomainContent,
    scan: (ctx) => {
      const issues = [];
      // if (violatesKnownFailureMode(ctx.answer)) {
      //   issues.push({
      //     severity: "critical",
      //     code: "DOMAIN_X_VIOLATION",
      //     message: "What went wrong, concretely.",
      //     remediation: "The deterministic repair instruction.",
      //   });
      // }
      return issues;
    },
  },
];
