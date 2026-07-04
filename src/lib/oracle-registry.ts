/**
 * Oracle Registry — Deterministic / External Verification Layer.
 *
 * Mirrors flaw-registry but for ASYNC, environment-gated oracles that cover
 * failure modes the lexical (text-only) layer cannot reach:
 *   compiler/linter, SAST taint, SBOM/CVE, license, NLI contradiction,
 *   source-span fabrication, sandboxed execution, formal verification.
 *
 * HONESTY KERNEL (from turn-1 §1 EETT / §E2 / §E3 / §153 EGS):
 *   - An oracle NEVER fabricates a result. If its transport is not wired,
 *     it returns an honest `*_UNAVAILABLE` info issue (gate honesty).
 *   - Every real verdict carries provenance (tool, version, hashes via meta).
 *   - Oracles are opt-in: host supplies transports; default = SIMULATED/UNAVAILABLE.
 */
import type { GuardIssue } from "./universal-rigor-guard";
import type { ScanContext, ScanSource } from "./flaw-registry";

export type OracleKind =
  | "compiler" | "sast" | "sca-cve" | "license"
  | "nli" | "span-fabrication" | "sandbox" | "formal" | "custom";

export type OracleStatus = "verified" | "failed" | "unavailable" | "simulated" | "error";

export interface OracleResult {
  oracleId: string;
  kind: OracleKind;
  status: OracleStatus;
  /** Issues to merge into the guard's GuardIssue stream (already shaped). */
  issues: GuardIssue[];
  /** Provenance for audit (tool, version, exit code, hashes). */
  meta?: Record<string, unknown>;
}

/**
 * Transport: host-supplied async callable that actually performs the side-effect
 * (spawning a compiler, calling Semgrep, querying OSV, running an NLI model).
 * If absent, the oracle degrades to `unavailable`.
 */
export type OracleTransport = (payload: OraclePayload) => Promise<OracleTransportResult>;

export interface OraclePayload {
  prompt: string;
  answer: string;
  /** Extracted code blocks (lang + body) for compiler/SAST/sandbox oracles. */
  codeBlocks: { lang: string; code: string }[];
  /** Retrieved source documents for span-fabrication / NLI grounding. */
  sources?: ScanSource[];
  /** Dependency manifests detected in the answer (package.json, requirements). */
  manifests?: { kind: string; raw: string }[];
  meta?: Record<string, unknown>;
}

export interface OracleTransportResult {
  status: OracleStatus;
  issues: GuardIssue[];
  meta?: Record<string, unknown>;
}

export interface Oracle {
  id: string;
  kind: OracleKind;
  description?: string;
  enabled?: boolean;
  /** Gate: skip when irrelevant (e.g. no code blocks for a compiler oracle). */
  appliesTo?: (p: OraclePayload, ctx: ScanContext) => boolean;
  /** Host-wired transport. Undefined ⇒ oracle reports `unavailable` honestly. */
  transport?: OracleTransport;
  /** Optional timeout (ms) for the transport call. */
  timeoutMs?: number;
}

const ORACLES = new Map<string, Oracle>();

export function registerOracle(o: Oracle): void {
  ORACLES.set(o.id, { enabled: true, timeoutMs: 30_000, ...o });
}
export function registerOracles(os: Oracle[]): void { os.forEach(registerOracle); }
export function setOracleEnabled(id: string, on: boolean): void {
  const o = ORACLES.get(id); if (o) o.enabled = on;
}
export function setOracleTransport(id: string, transport: OracleTransport): void {
  const o = ORACLES.get(id); if (o) o.transport = transport;
}
export function listOracles(): { id: string; kind: OracleKind; wired: boolean; enabled: boolean }[] {
  return [...ORACLES.values()].map(o => ({ id: o.id, kind: o.kind, wired: !!o.transport, enabled: o.enabled !== false }));
}
export function clearOracles(): void { ORACLES.clear(); }

// ── Code-block extraction (shared util) ─────────────────────────────────────
export function extractCodeBlocks(answer: string): { lang: string; code: string }[] {
  const out: { lang: string; code: string }[] = [];
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    out.push({ lang: (m[1] || "text").toLowerCase(), code: m[2] });
  }
  return out;
}

function detectManifests(answer: string): { kind: string; raw: string }[] {
  const out: { kind: string; raw: string }[] = [];
  for (const b of extractCodeBlocks(answer)) {
    if (/"dependencies"\s*:/.test(b.code) || /"devDependencies"\s*:/.test(b.code)) out.push({ kind: "npm", raw: b.code });
    if (/^\s*[\w.-]+(==|>=|~=)\d/m.test(b.code)) out.push({ kind: "pip", raw: b.code });
    if (/^\s*\[dependencies\]/m.test(b.code)) out.push({ kind: "cargo", raw: b.code });
    if (/^\s*require\s+\(/m.test(b.code) || /^\s*go\s+\d+\.\d+/m.test(b.code)) out.push({ kind: "gomod", raw: b.code });
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`oracle timeout ${ms}ms`)), ms);
    p.then(v => { clearTimeout(id); resolve(v); }).catch(e => { clearTimeout(id); reject(e); });
  });
}

/**
 * Run all enabled, applicable oracles. Builds the payload from the ScanContext.
 * Returns merged results. Unwired oracles report honest `unavailable`.
 */
export async function runOracles(ctx: ScanContext): Promise<OracleResult[]> {
  const codeBlocks = extractCodeBlocks(ctx.answer);
  const manifests = detectManifests(ctx.answer);
  const payload: OraclePayload = {
    prompt: ctx.prompt, answer: ctx.answer, codeBlocks,
    sources: ctx.sources, manifests, meta: ctx.meta,
  };

  const tasks = [...ORACLES.values()]
    .filter(o => o.enabled !== false)
    .filter(o => !o.appliesTo || o.appliesTo(payload, ctx))
    .map(async (o): Promise<OracleResult> => {
      if (!o.transport) {
        return {
          oracleId: o.id, kind: o.kind, status: "unavailable",
          issues: [{
            severity: "info", code: `ORACLE_UNAVAILABLE_${o.kind.toUpperCase().replace(/-/g, "_")}`,
            message: `Oracle '${o.id}' (${o.kind}) is not wired in this environment — ${o.description ?? "deterministic verification skipped"}. Failure modes in this class are NOT covered by text-only scanning.`,
            remediation: `Wire a transport for '${o.id}' via setOracleTransport() to enable ${o.kind} verification.`,
          }],
          meta: { wired: false },
        };
      }
      try {
        const r = await withTimeout(o.transport(payload), o.timeoutMs ?? 30_000);
        return { oracleId: o.id, kind: o.kind, status: r.status, issues: r.issues, meta: { wired: true, ...r.meta } };
      } catch (err: any) {
        return {
          oracleId: o.id, kind: o.kind, status: "error",
          issues: [{ severity: "info", code: "ORACLE_ERROR", message: `Oracle '${o.id}' threw: ${err?.message ?? "unknown"}` }],
          meta: { wired: true, error: true },
        };
      }
    });

  return Promise.all(tasks);
}

/** Flatten oracle results into the GuardIssue stream for unified scoring. */
export function oracleResultsToIssues(results: OracleResult[]): GuardIssue[] {
  return results.flatMap(r => r.issues.map(i => ({ ...i, code: i.code })));
}
