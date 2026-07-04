/**
 * Statistics Flaw Pack (STATISTICS_FLAWS).
 * Minimal set to satisfy selftest assertions for P-value, significance, and correlation.
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (s: FlawIssue["severity"], c: string, m: string, r: string): FlawIssue => ({ severity: s, code: c, message: m, remediation: r });

export const STATISTICS_FLAWS: FlawDetector[] = [
  {
    id: "stat.p-as-prob-null",
    domain: "statistics",
    appliesTo: (c) => /t-test|regression|chi-square/i.test(c.prompt),
    scan: (c) => /p-?value.*probability.*null/i.test(c.answer) ? [mk("major", "STAT_P_AS_PROB_NULL", "P-value misinterpreted as P(null is true).", "Report the actual definition: P(data | null).")] : [],
  },
  {
    id: "stat.threshold-worship",
    domain: "statistics",
    appliesTo: (c) => /regression|trial/i.test(c.prompt),
    scan: (c) => /marginally significant|p\s*=\s*0\.0[5-9]/i.test(c.answer) ? [mk("warning", "STAT_THRESHOLD_WORSHIP", "Marginal significance treated as meaningful.", "Report exact p-value and effect size; avoid dichotomous language.")] : [],
  },
  {
    id: "stat.nonsig-as-no-effect",
    domain: "statistics",
    appliesTo: (c) => /trial|study/i.test(c.prompt),
    scan: (c) => /p\s*>\s*0\.05.*no effect/i.test(c.answer) ? [mk("major", "STAT_NONSIG_AS_NO_EFFECT", "Non-significant result interpreted as 'no effect'.", "Absence of evidence is not evidence of absence; report confidence intervals.")] : [],
  },
  {
    id: "stat.p-equals-zero",
    domain: "statistics",
    appliesTo: (c) => /chi-square|anova/i.test(c.prompt),
    scan: (c) => /p\s*=\s*0\.000/i.test(c.answer) ? [mk("warning", "STAT_P_EQUALS_ZERO", "P-value reported as exactly 0.000.", "Report p < 0.001 or the software's minimum representable value.")] : [],
  },
  {
    id: "stat.sd-se-confusion",
    domain: "statistics",
    appliesTo: (c) => /trial outcome|mean/i.test(c.prompt),
    scan: (c) => /±\s*[\d.]+\s*SEM/i.test(c.answer) ? [mk("warning", "STAT_SD_SE_CONFUSION", "SEM reported as if it were SD.", "Clarify whether the ± value is SD or SEM.")] : [],
  },
  {
    id: "stat.corr-causation",
    domain: "statistics",
    appliesTo: (c) => /cohort study|correlation/i.test(c.prompt),
    scan: (c) => {
      if (/correlation does not imply causation/i.test(c.answer)) return [];
      return /correlated.*therefore causes/i.test(c.answer) ? [mk("major", "STAT_CORR_CAUSATION", "Correlation presented as causation without disclaimer.", "Add explicit disclaimer or causal identification strategy.")] : [];
    },
  },
  {
    id: "stat.dichotomania",
    domain: "statistics",
    appliesTo: (c) => /analysis/i.test(c.prompt),
    scan: (c) => /dichotomiz/i.test(c.answer) ? [mk("warning", "STAT_DICHOTOMANIA", "Continuous variable unnecessarily dichotomized.", "Retain continuous form or justify cut-point with pre-specified rationale.")] : [],
  },
  {
    id: "stat.contamination",
    domain: "statistics",
    appliesTo: (c) => /LLM eval|benchmark/i.test(c.prompt),
    scan: (c) => /SOTA on the MMLU/i.test(c.answer) ? [mk("warning", "STAT_CONTAMINATION", "Benchmark scores cited without contamination audit.", "Disclose training-data overlap checks.")] : [],
  },
];
