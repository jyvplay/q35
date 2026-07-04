/**
 * Original 246-Defense Pack — additive V15 mapping of the FULL npm package
 * defense corpus into the V15 flaw-registry.
 *
 * Sources (imported directly from the npm package — verbatim, no mutation):
 *   • FAILURE_MODES (186 named failure-mode → solution mappings)
 *   • KERNEL_DEFENSES (60 kernel-layer pipeline defenses)
 *
 * Total: 246 defenses (matches the "126 defenses / 4-stage pipeline" banner
 * count plus the additional 120 catalogued classes).
 *
 * This pack ONLY registers META-DETECTORS: one info-severity anchor per
 * defense, keyed to substring/regex hints derived from each defense's name +
 * solution text, so V15 can surface exactly which named defense category a
 * given answer touches. It NEVER mutates any of the existing flaw packs
 * (builtin, statistics, medical, legal, finance, software-*), and it is
 * loaded only via ensureOriginalDefensePackLoaded() called from the V15
 * pipeline — the base flaws/index.ts is untouched.
 */
import { FAILURE_MODES } from "@/lib/failure-modes";
import { KERNEL_DEFENSES } from "@/lib/defense-registry";
import type { FlawDetector, FlawIssue } from "../flaw-registry";
import { registerFlawPack } from "../flaw-registry";

const mk = (severity: FlawIssue["severity"], code: string, message: string, remediation: string): FlawIssue =>
  ({ severity, code, message, remediation });

/**
 * A defense fires as an INFO-level anchor when its trigger phrases appear
 * anywhere in the answer or prompt. It is intentionally low-weight so it
 * cannot dominate scoring — it exists to surface which of the 246 defenses
 * a given answer engages, which V15's editor/critique loop can then use as
 * remediation context.
 */
function makeAnchorDetector(id: string, code: string, name: string, group: string, solution: string): FlawDetector {
  // Build cheap triggers from the defense's own words.
  const words = (name + " " + solution).toLowerCase();
  const tokens = Array.from(new Set(words.match(/[a-z]{5,}/g) ?? []))
    .filter(w => !STOPWORDS.has(w))
    .slice(0, 6);
  const trigger = tokens.length > 0 ? new RegExp(`\\b(?:${tokens.join("|")})\\b`, "i") : null;
  return {
    id: `orig.${id}`,
    domain: "domain",
    description: `${group}: ${name}`,
    appliesTo: (c) => (trigger ? trigger.test(c.prompt) || trigger.test(c.answer) : false),
    scan: () => [mk(
      "info",
      `ORIG_DEFENSE_${code}`,
      `Answer touches the original defense catalog category "${name}" (${group}).`,
      solution.slice(0, 240),
    )],
  };
}

const STOPWORDS = new Set([
  "answer","every","against","without","which","should","would","could","those","these","their","being","other",
  "return","because","between","through","before","after","under","above","never","always","cannot","doesnt","dont",
  "match","input","output","claim","query","asked","using","given","based","cases","types","level","tools","across",
  "chain","checks","checked","checker","source","sources","result","results","status","system","content","context",
  "detail","details","format","string","strict","runtime","present","policy","module","modules","record","records",
  "detection","detected","display","displayed","display","values","value","respond","response","responses",
]);

const FAILURE_DETECTORS: FlawDetector[] = FAILURE_MODES.map((fm: any) =>
  makeAnchorDetector(`fm.${fm.id}`, fm.id, fm.name, fm.superclassName, fm.solution)
);

const KERNEL_DETECTORS: FlawDetector[] = KERNEL_DEFENSES.map((k: any) =>
  makeAnchorDetector(`kd.${k.id}`, k.id, k.name, k.group, k.wiredIn)
);

let loaded = false;
export function ensureOriginalDefensePackLoaded(): { ok: boolean; total: number } {
  if (loaded) return { ok: true, total: FAILURE_DETECTORS.length + KERNEL_DETECTORS.length };
  loaded = true;
  registerFlawPack("original-246", [...FAILURE_DETECTORS, ...KERNEL_DETECTORS]);
  return { ok: true, total: FAILURE_DETECTORS.length + KERNEL_DETECTORS.length };
}

export const ORIGINAL_DEFENSE_COUNT = FAILURE_MODES.length + KERNEL_DEFENSES.length;
