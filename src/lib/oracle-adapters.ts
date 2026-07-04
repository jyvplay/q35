/**
 * Built-in Oracle Adapters — gate-honest stubs for the 8 non-text-detectable
 * failure classes. Each registers with NO transport by default (honest
 * 'unavailable'); the host wires real transports per environment.
 */
import { registerOracle, extractCodeBlocks, type OraclePayload } from "./oracle-registry";
import type { ScanContext } from "./flaw-registry";

const COMPILED_LANGS = /^(ts|tsx|typescript|js|jsx|javascript|rust|rs|go|cpp|c\+\+|cc|cxx|c|swift|java|kotlin|python|py)$/i;

export function registerBuiltinOracles(): void {
  // 1. COMPILER / LINTER HARNESS — type errors, concurrency, version semantics.
  registerOracle({
    id: "oracle.compiler", kind: "compiler",
    description: "Compiles/lints extracted code (tsc, rustc, go vet, swiftc, mypy) to catch type/concurrency/version errors regex cannot.",
    appliesTo: (p) => p.codeBlocks.some(b => COMPILED_LANGS.test(b.lang)),
  });

  // 2. SAST — taint/dataflow (SQLi, XSS, SSRF, command injection).
  registerOracle({
    id: "oracle.sast", kind: "sast",
    description: "Static analysis (Semgrep/CodeQL) for taint flows — full dataflow that single-function regex cannot trace.",
    appliesTo: (p) => p.codeBlocks.length > 0,
  });

  // 3. SCA / CVE — known-vulnerable dependencies + slopsquat existence check.
  registerOracle({
    id: "oracle.sca-cve", kind: "sca-cve",
    description: "Software Composition Analysis: queries OSV/NVD for CVEs and verifies package existence (anti-slopsquat) in detected manifests.",
    appliesTo: (p) => (p.manifests?.length ?? 0) > 0 || /\b(npm|pip|cargo|go)\s+(install|add|get)\b/i.test(p.answer),
  });

  // 4. LICENSE — dependency license policy conflicts.
  registerOracle({
    id: "oracle.license", kind: "license",
    description: "License compliance scan against a policy (e.g. no GPL in proprietary).",
    appliesTo: (p) => (p.manifests?.length ?? 0) > 0,
  });

  // 5. NLI — cross-paragraph semantic contradiction / entailment.
  registerOracle({
    id: "oracle.nli", kind: "nli",
    description: "Natural Language Inference model for non-adjacent contradiction / multi-hop logical invalidity beyond regex.",
    appliesTo: (_p, ctx: ScanContext) => ctx.answer.length > 400,
  });

  // 6. SPAN-FABRICATION — quote/citation fabrication vs retrieved sources.
  registerOracle({
    id: "oracle.span-fabrication", kind: "span-fabrication",
    description: "Fuzzy span-match of quoted text against retrieved source documents to detect fabricated quotes.",
    appliesTo: (p) => /"[^"]{20,}"/.test(p.answer) && (p.sources?.length ?? 0) > 0,
  });

  // 7. SANDBOX — execution effects (FS writes, process spawn, network egress).
  registerOracle({
    id: "oracle.sandbox", kind: "sandbox",
    description: "Sandboxed execution + ASAN/TSAN for memory safety, data races, unauthorized FS/network effects.",
    appliesTo: (p) => p.codeBlocks.some(b => /^(c|cpp|c\+\+|rust|rs|go)$/i.test(b.lang)),
  });

  // 8. FORMAL — bounded model checking / theorem proving for safety properties.
  registerOracle({
    id: "oracle.formal", kind: "formal",
    description: "Bounded model checker (CBMC/KLEE) or SMT (Z3) to verify stated safety invariants on critical paths.",
    appliesTo: (_p, ctx: ScanContext) => /\b(invariant|safety property|must never|formally verif|prove that|assert)\b/i.test(ctx.prompt),
  });
}
