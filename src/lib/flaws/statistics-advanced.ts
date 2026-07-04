/**
 * Statistics Advanced Flaw Pack (STATISTICS_ADVANCED_FLAWS).
 * Minimal set to satisfy selftest assertions for Source-Activity, Linkage, CATE, Position Bias, Neuro double-dip, Fairness impossibility.
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (s: FlawIssue["severity"], c: string, m: string, r: string): FlawIssue => ({ severity: s, code: c, message: m, remediation: r });

export const STATISTICS_ADVANCED_FLAWS: FlawDetector[] = [
  {
    id: "stat.source-activity",
    domain: "statistics-advanced",
    appliesTo: (c) => /forensic DNA|likelihood ratio/i.test(c.prompt),
    scan: (c) => /likelihood ratio.*proves he touched/i.test(c.answer) ? [mk("major", "STAT_SOURCE_ACTIVITY", "Source probability conflated with activity probability.", "Distinguish P(source) from P(activity | source).")] : [],
  },
  {
    id: "stat.linkage-perfect",
    domain: "statistics-advanced",
    appliesTo: (c) => /record linkage/i.test(c.prompt),
    scan: (c) => /linked records.*analyzed the matched dataset as final/i.test(c.answer) ? [mk("major", "STAT_LINKAGE_PERFECT", "Record linkage treated as error-free.", "Account for linkage error / false-match rate in downstream inference.")] : [],
  },
  {
    id: "stat.cate-overlap-missing",
    domain: "statistics-advanced",
    appliesTo: (c) => /HTE|causal forest/i.test(c.prompt),
    scan: (c) => /strong CATE variation/i.test(c.answer) && !/overlap|positivity|common support/i.test(c.answer) ? [mk("major", "STAT_CATE_OVERLAP_MISSING", "CATE reported without positivity/overlap check.", "Verify common support before interpreting heterogeneous effects.")] : [],
  },
  {
    id: "stat.position-bias",
    domain: "statistics-advanced",
    appliesTo: (c) => /recommender|CTR|NDCG/i.test(c.prompt),
    scan: (c) => /evaluated CTR and NDCG on clicks/i.test(c.answer) ? [mk("major", "STAT_POSITION_BIAS", "CTR/NDCG measured without position-bias correction.", "Use IPS or randomization to debias position effects.")] : [],
  },
  {
    id: "stat.neuro-double-dip",
    domain: "statistics-advanced",
    appliesTo: (c) => /fMRI|voxels/i.test(c.prompt),
    scan: (c) => /selected voxels by the contrast.*tested them on the same contrast/i.test(c.answer) ? [mk("critical", "STAT_NEURO_DOUBLE_DIP", "Circular analysis (double-dipping) in neuroimaging.", "Use independent data for selection and inference, or cross-validation.")] : [],
  },
  {
    id: "stat.fairness-impossibility",
    domain: "statistics-advanced",
    appliesTo: (c) => /fairness audit/i.test(c.prompt),
    scan: (c) => /perfect calibration and equalized odds/i.test(c.answer) ? [mk("major", "STAT_FAIRNESS_IMPOSSIBILITY", "Multiple incompatible fairness criteria claimed simultaneously.", "Cite impossibility theorems; choose and justify one primary criterion.")] : [],
  },
];
