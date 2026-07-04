import type { ComputeRecord } from "./compute-sandbox";

export interface QualityScoreItem {
  name: string;
  score: number;
  note: string;
}

export interface NumericAuditItem {
  value: string;
  status: "computed" | "sourced" | "unverified";
  rationale: string;
  unit?: string;
  line?: number;
}

export interface QualityReport {
  overall: number;
  items: QualityScoreItem[];
  numericAudit: NumericAuditItem[];
  triggeredKernels: string[];
  mythos: string;
}

const clamp10 = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

function hasAny(text: string, terms: RegExp[]) {
  return terms.some((re) => re.test(text));
}

function numericAudit(answer: string, computeRecords: ComputeRecord[]): NumericAuditItem[] {
  const computedText = computeRecords
    .flatMap((r) => r.result ? Object.values(r.result).map(String) : [])
    .join(" ");
  const numbers = Array.from(new Set(answer.match(/\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|trillion|k|M|B|clusters?|sites?|participants?|adults?|months?|years?|QALYs?|ROI|ICC|IAC|β|alpha|α)?\b/gi) ?? []))
    .slice(0, 32);
  const lines = answer.split(/\n/);
  return numbers.map((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nearSource = new RegExp(`${escaped}[\\s\\S]{0,80}(?:Source|source|citation|NIH|NOFO|NOT-)`, "i").test(answer) ||
      new RegExp(`(?:Source|source|citation|NIH|NOFO|NOT-)[\\s\\S]{0,80}${escaped}`, "i").test(answer);
    const computed = computedText.includes(value.replace(/\s+/g, "")) || computeRecords.some((r) => JSON.stringify(r.result ?? {}).includes(value.replace(/\s+/g, "")));
    const unitMatch = value.match(/(%|percent|million|billion|trillion|k|M|B|clusters?|sites?|participants?|adults?|months?|years?|QALYs?|ROI|ICC|IAC|β|alpha|α)$/i);
    const line = lines.findIndex(l => l.includes(value));
    const base = { value, unit: unitMatch?.[1], line: line >= 0 ? line + 1 : undefined };
    if (computed) return { ...base, status: "computed" as const, rationale: "Matches deterministic compute sandbox output." };
    if (nearSource) return { ...base, status: "sourced" as const, rationale: "Appears adjacent to source/citation language." };
    return { ...base, status: "unverified" as const, rationale: "Not linked to a compute record or nearby citation; treat as load-bearing only if externally verified." };
  });
}

export function scoreAnswer(opts: {
  query: string;
  answer: string;
  sourceCount: number;
  verifiedClaims: number;
  totalClaims: number;
  computeRecords: ComputeRecord[];
  activeTemplateId?: string;
}): QualityReport {
  const a = opts.answer;
  const lower = a.toLowerCase();
  const nums = numericAudit(a, opts.computeRecords);
  const unverifiedNums = nums.filter((n) => n.status === "unverified").length;
  const refusal = /\b(provided data|retrieved sources|source context|available evidence)\b[\s\S]{0,160}\b(does not contain|insufficient|cannot|unable)\b/i.test(a)
    || /A defensible answer can be built from the retrieved evidence/i.test(a)
    || a.trim().length < 200;
  const placeholder = /\[(?:list of|description of|insert|tbd|placeholder|source\s*\d+(?:\s*,\s*(?:source\s*)?\d+)+)[^\]]*\]/i.test(a);
  const journalAbstract = /\bmethods\b[\s\S]{0,80}\bresults\b[\s\S]{0,80}\bconclusions\b/i.test(a) && /\banticipated|projected|we hypothesize|expected reduction\b/i.test(a);
  const templateFit = opts.activeTemplateId ? !placeholder && !journalAbstract && a.length > 600 : a.length > 250;
  const coverage = opts.totalClaims > 0 ? opts.verifiedClaims / opts.totalClaims : opts.sourceCount > 0 ? 0.5 : 0.2;

  const items: QualityScoreItem[] = [
    { name: "Science / Method", score: clamp10(6 + (hasAny(lower, [/specific aims/i, /approach/i, /analytic/i, /mechanism/i]) ? 2 : 0) - (journalAbstract ? 4 : 0)), note: journalAbstract ? "Journal-style abstract structure detected." : "Method structure appears bounded by current gates." },
    { name: "Math / Numerics", score: clamp10(10 - unverifiedNums * 2), note: unverifiedNums ? `${unverifiedNums} number(s) lack compute/source linkage.` : "No unsupported load-bearing numbers detected." },
    { name: "Grounding", score: clamp10(4 + Math.round(coverage * 6) - (refusal && opts.sourceCount >= 8 ? 5 : 0)), note: refusal ? "Source-rich refusal pattern detected." : `${opts.verifiedClaims}/${opts.totalClaims || 1} claims verified with ${opts.sourceCount} source(s).` },
    { name: "Template Fit", score: clamp10(templateFit ? 9 : 4), note: templateFit ? "Output appears to follow a substantive structure." : "Template or section completeness risk detected." },
    { name: "Tone / AI-ness", score: clamp10(9 - (hasAny(lower, [/as an ai/i, /i cannot/i, /provided data does not/i]) ? 4 : 0)), note: hasAny(lower, [/as an ai/i, /provided data does not/i]) ? "AI/metadiscourse leakage detected." : "Plain-English output without obvious AI disclaimers." },
  ];
  const overall = clamp10(items.reduce((s, x) => s + x.score, 0) / items.length);
  const triggeredKernels = [
    "K27 Atomic claim extraction",
    "K28 Claim-source entailment",
    "GATE-SOURCE-RICH-REFUSAL",
    "GATE-CITATION-BLEED",
    unverifiedNums ? "GATE-L NUMERICAL DETERMINISM" : "GATE-L NUMERICAL DETERMINISM PASS",
    opts.activeTemplateId ? `Template:${opts.activeTemplateId}` : "Template:none",
  ];
  return {
    overall,
    items,
    numericAudit: nums,
    triggeredKernels,
    mythos: overall >= 9 ? "Stable: answer, evidence, and style form a coherent report object." : "Needs review: at least one quality dimension remains below frontier-grade threshold.",
  };
}