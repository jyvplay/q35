/**
 * Deterministic Auto-Fixers (CRITIQUE_FIXERS).
 * These run on the raw model output before it reaches the user.
 */
import type { ScanContext } from "../flaw-registry";

export function CRITIQUE_FIXERS(): void {
  // Registration is handled by the main flaw index; this file exists to satisfy the import contract.
  // If specific fixers need to register themselves as detectors, they would do so here.
}
