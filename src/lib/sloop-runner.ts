/**
 * Adaptive SLOOP Runner — v2
 *
 * Strategy selection based on model intelligence (Arena Elo-aligned):
 *
 *  NATIVE MODE (intel ≥ NATIVE_THRESHOLD, default 85):
 *    One single LLM call produces the entire report with SLOOP section
 *    structure preserved (## headings). Fast, lowest memory overhead.
 *    N-Deep can still process it section-by-section via the digest path.
 *
 *  SECTIONED MODE (intel < NATIVE_THRESHOLD):
 *    Original streaming section-per-call approach. Each section is
 *    generated independently; prior summaries provide continuity.
 *    Memory: O(max_section_size) peak per call vs O(full_report) for native.
 *
 * The choice is transparent — callers always receive { finalText, trace, calls }.
 * N-Deep downstream uses buildDraftDigest() regardless of how the draft was
 * produced, so the two modes are fully interchangeable as N-Deep input.
 */
import { generateSynthesizedResponse, type GenerateParams } from "./models";
import { buildReportSpec } from "./sloop";
import type { PipelineTrace } from "./pipeline";
import { settleHeap } from "./memory-governor";
import { intelligenceOf } from "./model-intelligence";

export interface SloopRunResult {
  finalText: string;
  trace: PipelineTrace[];
  calls: number;
  mode: "native" | "sectioned";
}

/** Models at or above this score produce the full report in one call. */
const NATIVE_THRESHOLD = 85;

/**
 * Hard ceiling on pages for native single-call mode. Frontier models have an
 * 8192 token output limit; 8 pages is the upper bound where native can still
 * succeed on strong models. A completeness gate below catches truncation and
 * falls back to sectioned mode if native output returns only late sections.
 */
const NATIVE_PAGE_CEILING = 8;

function compactSources(sources: { title: string; url: string; content: string }[], sectionIndex: number) {
  if (sources.length === 0) return [];
  const start = (sectionIndex * 3) % Math.max(1, sources.length);
  const rotated = [...sources.slice(start), ...sources.slice(0, start)];
  return rotated.slice(0, 8).map(s => ({ title: s.title, url: s.url, content: (s.content || "").slice(0, 700) }));
}

function allSources(sources: { title: string; url: string; content: string }[]) {
  // For native mode: provide all sources but cap content more aggressively
  // to prevent the single prompt from blowing up the context window.
  return sources.slice(0, 16).map(s => ({
    title: s.title, url: s.url,
    content: (s.content || "").slice(0, 1500),
  }));
}

type SloopSection = ReturnType<typeof buildReportSpec>["sections"][number];

function sectionCoverage(text: string, sections: SloopSection[]): { hits: number; required: number; firstOk: boolean } {
  const lower = text.toLowerCase();
  const hits = sections.filter(s => lower.includes(s.name.toLowerCase())).length;
  const required = Math.max(3, Math.ceil(sections.length * 0.7));
  const firstIdx = lower.indexOf(sections[0]?.name.toLowerCase() ?? "");
  return { hits, required, firstOk: firstIdx >= 0 && firstIdx < 1200 };
}

function chooseArchetype(templateId?: string): string {
  if (templateId === "NIH-GRANT-SRF" || templateId === "OMEGA-SCIENCE") return "scientific-academic";
  if (templateId === "OMEGA-DILIGENCE") return "audit-assurance";
  if (templateId === "OMEGA-BUILD") return "implementation-tech";
  if (templateId === "OMEGA-DISCOVERY") return "market-commercial";
  if (templateId === "OMEGA-COMPLIANCE") return "audit-assurance";
  return "decision-strategy";
}

// ─── Native mode: one call, full report ───────────────────────────────────────

async function runNativeReport(opts: {
  query: string;
  baseParams: GenerateParams;
  sources: { title: string; url: string; content: string }[];
  templateId?: string;
  pages: number;
  onTrace?: (t: PipelineTrace) => void;
  onDebug?: (msg: string) => void;
}): Promise<SloopRunResult> {
  const spec = buildReportSpec(chooseArchetype(opts.templateId), opts.templateId ?? null);
  const targetSections = spec.sections.slice(0, Math.max(4, Math.min(spec.sections.length, opts.pages + 2)));
  const sectionList = targetSections.map((s, i) => `${i + 1}. ## ${s.name}`).join("\n");
  const wordTarget = Math.max(300, opts.pages * 650);

  const prompt = [
    `Produce a COMPLETE, FULLY WRITTEN ${opts.pages}-page report using the SLOOP structure below.`,
    `Use EXACTLY these section headings (## prefix). Do not add, rename, or merge sections.`,
    `Target total length: ~${wordTarget} words. Write each section with full substance — no stubs, no placeholders, no meta-commentary.`,
    `Use evidence from the retrieved sources. Where gaps exist, write professional investigator-owned analysis.`,
    ``,
    `SLOOP SECTIONS (generate all of them):`,
    sectionList,
    ``,
    `USER ASK: ${opts.query}`,
  ].filter(Boolean).join("\n");

  opts.onDebug?.(`[SLOOP native] single-call for ${targetSections.length} sections (~${wordTarget} words)`);
  const text = await generateSynthesizedResponse({
    ...opts.baseParams,
    userMessage: prompt,
    retrievedWebData: allSources(opts.sources),
    conversationHistory: [],
  });

  const cleaned = text.trim();
  const coverage = sectionCoverage(cleaned, targetSections);
  const minChars = Math.max(1200, opts.pages * 1500);
  if (coverage.hits < coverage.required || !coverage.firstOk || cleaned.length < minChars) {
    opts.onDebug?.(`[SLOOP native] incomplete/truncated (${coverage.hits}/${targetSections.length} headings, firstOk=${coverage.firstOk}, chars=${cleaned.length}) — falling back to sectioned mode`);
    const fallback = await runSectionedReport(opts);
    return { ...fallback, calls: fallback.calls + 1 };
  }
  const t: PipelineTrace = {
    stage: 4,
    label: `SLOOP native: ${targetSections.length} sections, ${cleaned.length} chars`,
    ts: Date.now(),
    ok: cleaned.length > 200,
    data: { chars: cleaned.length, sections: targetSections.length, mode: "native" },
  };
  opts.onTrace?.(t);
  opts.onDebug?.(`[SLOOP native] complete: ${cleaned.length} chars`);

  return { finalText: String(cleaned), trace: [t], calls: 1, mode: "native" };
}

// ─── Sectioned mode: stream section-by-section ────────────────────────────────

async function runSectionedReport(opts: {
  query: string;
  baseParams: GenerateParams;
  sources: { title: string; url: string; content: string }[];
  templateId?: string;
  pages: number;
  onTrace?: (t: PipelineTrace) => void;
  onDebug?: (msg: string) => void;
}): Promise<SloopRunResult> {
  const spec = buildReportSpec(chooseArchetype(opts.templateId), opts.templateId ?? null);
  const targetSections = spec.sections.slice(0, Math.max(4, Math.min(spec.sections.length, opts.pages + 2)));
  const trace: PipelineTrace[] = [];
  let calls = 0;
  let consolidated = "";
  const priorSummaries: string[] = [];

  for (let i = 0; i < targetSections.length; i++) {
    const section = targetSections[i];
    const evidence = compactSources(opts.sources, i);
    const prompt = [
      `Generate ONLY the "${section.name}" section for the report requested by the user.`,
      `This is SLOOP section ${i + 1}/${targetSections.length}; do not generate other sections.`,
      `No placeholders, no meta-commentary, no raw [Source N] tokens.`,
      `Use concrete, specific content from the evidence. If a detail is missing, write a professional investigator-owned note, not an AI refusal.`,
      `Target depth: ${Math.max(250, Math.round((opts.pages * 700) / targetSections.length))} words for this section.`,
      section.requiredFields?.length ? `Required fields: ${section.requiredFields.join(", ")}` : "",
      `Prior section summaries for continuity:\n${priorSummaries.slice(-3).join("\n")}`,
      `USER ASK: ${opts.query}`,
    ].filter(Boolean).join("\n\n");

    opts.onDebug?.(`[SLOOP sectioned] section ${i + 1}/${targetSections.length}: ${section.name}`);
    const text = await generateSynthesizedResponse({
      ...opts.baseParams,
      userMessage: prompt,
      retrievedWebData: evidence,
      conversationHistory: [],
    });
    calls++;
    const cleaned = text.trim();
    const block = `## ${section.name}\n\n${cleaned}`;
    consolidated = consolidated ? `${consolidated}\n\n${block}` : block;
    const preview = String(cleaned.slice(0, 200));
    opts.onDebug?.(`[SLOOP preview ${i + 1}/${targetSections.length}] ${preview}${cleaned.length > 200 ? "..." : ""}`);
    priorSummaries.push(String(`${section.name}: ${cleaned.slice(0, 240).replace(/\s+/g, " ")}`));
    const t: PipelineTrace = {
      stage: 4 + (i + 1) / 100,
      label: `SLOOP section: ${section.name}`,
      ts: Date.now(),
      ok: cleaned.length > 80,
      data: { chars: cleaned.length, preview },
    };
    trace.push(t);
    opts.onTrace?.(t);
    await settleHeap(12);
  }

  return { finalText: String(consolidated), trace, calls, mode: "sectioned" };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runSloopReport(opts: {
  query: string;
  baseParams: GenerateParams;
  sources: { title: string; url: string; content: string }[];
  templateId?: string;
  pages: number;
  onTrace?: (t: PipelineTrace) => void;
  onDebug?: (msg: string) => void;
}): Promise<SloopRunResult> {
  const intel = intelligenceOf(opts.baseParams.model);
  // Native mode requires BOTH (a) strong-enough model AND (b) requested pages
  // within the 8192-token output ceiling. For >NATIVE_PAGE_CEILING pages,
  // ALWAYS fall back to sectioned mode to prevent silent truncation
  // (the "only appendix returned" failure mode observed in field testing).
  const wouldTruncate = opts.pages > NATIVE_PAGE_CEILING;
  const useNative = intel >= NATIVE_THRESHOLD && !wouldTruncate;
  opts.onDebug?.(
    `[SLOOP] model=${opts.baseParams.model} intel=${intel} pages=${opts.pages} → mode=${useNative ? "native (single-call)" : wouldTruncate ? `sectioned (pages ${opts.pages} > ${NATIVE_PAGE_CEILING} native ceiling — avoiding output truncation)` : "sectioned (stream)"}`
  );
  if (useNative) {
    return runNativeReport(opts);
  } else {
    return runSectionedReport(opts);
  }
}
