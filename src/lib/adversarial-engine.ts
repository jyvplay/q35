/**
 * Adversarial Engine — LLM-driven Tournament + Falsification + Structural Gates.
 *
 * Unlike the legacy templated ATLAS-DR (static strings, ran AFTER the answer and
 * never influenced it), this engine runs a REAL study-section red-team on a draft
 * and returns concrete, actionable defects that the synthesis loop must repair
 * BEFORE the answer is shown. All critique sub-tasks are batched into ONE LLM
 * call to respect the RPM ceiling.
 */

import type { GenerateParams } from "./models";
import { generateSynthesizedResponse } from "./models";
import { batchPrompts, parseBatchReply, throttle } from "./rpm-governor";

export interface Defect {
  id: string;
  severity: "critical" | "major" | "minor";
  category: string;
  detail: string;
}

export interface AdversarialReport {
  defects: Defect[];
  verdict: "pass" | "revise";
  rawCritique: string;
}

// ── Deterministic structural gates (no tokens) ────────────────────────────
// These catch the exact failure classes the user flagged (SABV mislabel,
// placeholder leakage, GLMM-under-wrong-heading) WITHOUT spending an LLM call.

const PLACEHOLDER_RE = /\[(?:list of|description of|insert|tbd|placeholder|add |your |relevant citations|available facilities|e\.g\.,?)[^\]]*\]/gi;

export function runStructuralGates(draft: string, opts?: { domain?: string }): Defect[] {
  const defects: Defect[] = [];
  const text = draft || "";
  const lower = text.toLowerCase();

  // Gate 1 — unpopulated boilerplate placeholders (VULN-02 class)
  const placeholders = text.match(PLACEHOLDER_RE);
  if (placeholders && placeholders.length > 0) {
    defects.push({
      id: "GATE-PLACEHOLDER",
      severity: "critical",
      category: "Template leakage",
      detail: `Unpopulated boilerplate placeholders present (${[...new Set(placeholders)].slice(0, 4).join("; ")}). Every bracketed slot must be filled with real, specific content or removed.`,
    });
  }

  // Gate 2 — SABV semantic mislabel (VULN-01 class). If "SABV" appears but the
  // text does not actually discuss biological sex / sex stratification, it is
  // being misused as a data-structure acronym.
  if (/\bSABV\b/.test(text)) {
    const discussesSex = /(sex as a biological variable|biological sex|sex[- ]?stratif|male and female|sex differences|disaggregat\w* by sex)/i.test(text);
    if (!discussesSex) {
      defects.push({
        id: "GATE-SABV",
        severity: "critical",
        category: "Federal policy compliance",
        detail: "The acronym 'SABV' is used but the design does not address Sex as a Biological Variable (NIH mandate). Either provide a genuine sex-stratification / sex-as-variable plan under an SABV heading, or stop labeling unrelated content (e.g., statistical nesting) as SABV.",
      });
    }
  }

  // Gate 3 — clustered/multilevel design under a wrong heading. If GLMM/HLM/
  // nesting language sits inside an SABV block, flag the cross-contamination.
  if (/(GLMM|hierarchical linear model|random intercept|nested within|multi-?level model)/i.test(text) && /\bSABV\b/.test(text)) {
    const sabvIdx = text.search(/\bSABV\b/);
    const nestIdx = text.search(/(GLMM|random intercept|nested within|hierarchical linear)/i);
    if (sabvIdx !== -1 && nestIdx !== -1 && Math.abs(sabvIdx - nestIdx) < 600) {
      defects.push({
        id: "GATE-HEADING",
        severity: "major",
        category: "Section mislabel",
        detail: "Statistical clustering / GLMM content appears under or beside an SABV heading. Multilevel modeling belongs under 'Statistical Analysis', not 'Sex as a Biological Variable'. Separate the two sections.",
      });
    }
  }

  // Gate 4 — journal-style "Results" block in a grant abstract
  if ((opts?.domain === "science" || /\b(grant|aims|nih|sf424)\b/i.test(lower)) &&
      /\bResults\s*\(?\s*(quantified|preliminary)?\s*\)?\s*[:\-]/i.test(text) &&
      /\bwe hypothesize|we expect|projected|anticipated|anticipated reduction/i.test(lower)) {
    defects.push({
      id: "GATE-RESULTS-BLOCK",
      severity: "critical",
      category: "Document structure",
      detail: "A 'Results' block contains future/hypothetical projections — that mimics a journal article abstract. In an NIH SF424 Project Summary, hypothetical outcomes belong under 'Expected Outcomes / Impact'. Remove the 'Results' sub-header entirely and use Specific Aims / Significance / Innovation / Approach.",
    });
  }

  // Gate 5 — raw pipeline citation placeholders ([Source N], [Source N, M])
  const rawCitations = text.match(/\[Source\s*\d+(?:\s*,\s*(?:Source\s*)?\d+)*\s*\]/gi);
  if (rawCitations && rawCitations.length > 0) {
    defects.push({
      id: "GATE-CITATION-BLEED",
      severity: "critical",
      category: "Pipeline artifact",
      detail: `Raw pipeline citation placeholders found (${[...new Set(rawCitations)].slice(0, 4).join("; ")}). Replace every [Source N] with inline prose citations or named references. Never expose pipeline markers in output.`,
    });
  }

  // Gate 6 — cRCT with unspecified cluster count
  if (/cluster[- ]?randomiz/i.test(lower) && !/\b\d+\s*(cluster|site|housing|complex|communit)/i.test(lower)) {
    defects.push({
      id: "GATE-CLUSTER-COUNT",
      severity: "major",
      category: "Statistical design",
      detail: "Cluster-randomized design mentioned but the number of clusters/sites is unspecified. In a cRCT, statistical power depends on the number of independent clusters, not just individual N. State the cluster count explicitly and confirm the design effect / ICC in the power calculation.",
    });
  }

  // Gate 6b — ATTRITION ADEQUACY: detect a recruitment plan that fails after dropout.
  // Looks for "N clusters per arm", "M participants per cluster", "X% attrition",
  // and a stated "required ... evaluable" target; flags if post-attrition < required.
  {
    const clustersM = text.match(/(\d+)\s*clusters?\s*(?:per arm|\/arm)/i);
    const perClusterM = text.match(/(\d+)\s*participants?\s*per cluster/i);
    const attritM = text.match(/(\d+)\s*%\s*attrition|attrition[^.\d]{0,12}(\d+)\s*%/i);
    const requiredM = text.match(/require[sd]?\s*(\d+)\s*evaluable|(\d+)\s*evaluable participants per arm/i);
    if (clustersM && perClusterM && attritM) {
      const clusters = parseInt(clustersM[1], 10);
      const perCluster = parseInt(perClusterM[1], 10);
      const attrition = parseInt(attritM[1] || attritM[2], 10) / 100;
      const recruited = clusters * perCluster;
      const evaluable = Math.floor(recruited * (1 - attrition));
      const required = requiredM ? parseInt(requiredM[1] || requiredM[2], 10) : null;
      if (required != null && evaluable < required) {
        defects.push({
          id: "GATE-ATTRITION-DEFICIT",
          severity: "critical",
          category: "Statistical power (attrition)",
          detail: `Attrition deficit: ${clusters} clusters/arm × ${perCluster} = ${recruited} recruited; after ${Math.round(attrition*100)}% attrition only ${evaluable} evaluable remain, but ${required} are required → study finishes UNDERPOWERED. Fix: either expand to ${Math.ceil(required / ((1-attrition)*perCluster))} clusters/arm, or over-recruit to ${Math.ceil(perCluster / (1-attrition))} per cluster.`,
        });
      }
    }
  }

  // Gate 7 — blank/empty required sections
  const sectionHeaders = text.match(/^#+\s+.+$/gm) || [];
  for (const hdr of sectionHeaders) {
    const hdrIdx = text.indexOf(hdr);
    const nextHdr = sectionHeaders.find(h => text.indexOf(h) > hdrIdx + hdr.length);
    const sectionBody = nextHdr
      ? text.slice(hdrIdx + hdr.length, text.indexOf(nextHdr))
      : text.slice(hdrIdx + hdr.length);
    if (sectionBody.replace(/\s/g, "").length < 30 && /research strategy|approach|innovation|significance/i.test(hdr)) {
      defects.push({
        id: "GATE-EMPTY-SECTION",
        severity: "critical",
        category: "Completeness",
        detail: `Required section "${hdr.replace(/^#+\s+/, "").trim()}" appears to be blank or stub-only. Fill with substantive content or remove the heading.`,
      });
    }
  }

  // Gate 8 — sunsetted strategic plan reference
  const strategicPlanMatch = text.match(/strategic plan\s*\(?(\d{4})\s*[-–]\s*(\d{4})\)?/i);
  if (strategicPlanMatch) {
    const endYear = parseInt(strategicPlanMatch[2], 10);
    const currentYear = new Date().getFullYear();
    if (endYear < currentYear) {
      defects.push({
        id: "GATE-SUNSETTED-PLAN",
        severity: "major",
        category: "Temporal accuracy",
        detail: `Reference to a strategic plan ending in ${endYear} detected ("${strategicPlanMatch[0]}"). This plan has sunsetted. Align with the current plan cycle (${currentYear}–${currentYear + 4}) or cite the successor document.`,
      });
    }
  }

  // Gate 9 — undefined scientific mechanism (black-boxed intervention)
  if (/precision (nutrition|medicine|health)/i.test(lower) &&
      !/(nutrigenomic|metabolomic|microbiome|gut flora|genotyp|phenotyp|biomarker|proteomic|genomic profil)/i.test(lower)) {
    defects.push({
      id: "GATE-UNDEFINED-MECHANISM",
      severity: "major",
      category: "Scientific rigor",
      detail: "The term 'precision nutrition/medicine' is used but no operational mechanism is defined (nutrigenomics, metabolomics, microbiome sequencing, biomarker profiling, etc.). Specify the exact scientific basis of the intervention.",
    });
  }

  // Gate 10 — source-rich refusal / non-answer collapse.
  if (/\b(provided data|retrieved sources|source context|current source context|available evidence)\b[\s\S]{0,180}\b(does not contain|do not contain|lacks|lack|insufficient|no direct mention|no information regarding|cannot propose|unable to propose)\b/i.test(text)) {
    defects.push({
      id: "GATE-SOURCE-RICH-REFUSAL",
      severity: "critical",
      category: "Answer collapse",
      detail: "The answer collapses into a generic 'the data does not contain...' refusal. If sources were supplied, synthesize a concrete answer from them; if evidence is missing, name the exact missing field rather than rejecting the whole task.",
    });
  }

  // Gate 11 — clinical safety triage for digital behavioral health / NLP.
  if (/(digital|app|mobile|telehealth|nlp|sentiment|linguistic).{0,120}(depression|distress|suicide|self[- ]harm|cbt|behavioral health|mental health)/i.test(lower) &&
      !/(988|suicide & crisis|crisis lifeline|safety protocol|warm handoff|emergency triage|clinical escalation|risk stratification)/i.test(lower)) {
    defects.push({
      id: "GATE-CLINICAL-SAFETY-TRIAGE",
      severity: "critical",
      category: "Clinical safety",
      detail: "Digital/NLP behavioral health intervention lacks a real-time crisis triage protocol. Add escalation logic for severe distress/self-harm ideation, including 988 Suicide & Crisis Lifeline routing and clinical safety monitoring.",
    });
  }

  // Gate 12 — interaction-power fallacy.
  if (/(adequately powered|powered).{0,120}(sex[- ]by[- ](?:treatment|intervention)|interaction|subgroup interaction)/i.test(lower) &&
      /(main effect|primary effect|primary outcome|d\s*=|icc|intraclass)/i.test(lower) &&
      !/(interaction[- ]specific power|powered specifically for interaction|expanded cluster count|inflated sample|underpowered for interaction|exploratory interaction)/i.test(lower)) {
    defects.push({
      id: "GATE-INTERACTION-POWER",
      severity: "critical",
      category: "Statistical power",
      detail: "The draft claims adequate power for an interaction/subgroup effect while only describing a main-effect power calculation. Mark interaction tests as exploratory or provide a separate interaction-specific power calculation.",
    });
  }

  // Gate 13 — preliminary data black box.
  if (/(preliminary data).{0,160}(post[- ]award|after award|will be drawn|will be collected|pilot studies?)/i.test(lower)) {
    defects.push({
      id: "GATE-PRELIM-DATA-BLACKBOX",
      severity: "major",
      category: "Feasibility",
      detail: "Preliminary/feasibility data are deferred until after award. For an R01-scale complex intervention, cite existing feasibility data now or downgrade the proposal scope/mechanism.",
    });
  }

  // Gate 14 — delivery-mechanism contradiction (app-on-personal-phone vs dedicated hardware/kiosk).
  const mentionsApp = /(mobile[- ]delivered|smartphone app|mhealth app|personal smartphone|app[- ]based|on their (?:own )?(?:phone|smartphone)|smartphone penetration|smartphone ownership)/i.test(lower);
  const mentionsHardware = /(dedicated[, ]?(?:low[- ]barrier )?hardware|physical device|kiosk|installed (?:device|terminal)|tablet (?:installed|provided)|on[- ]site (?:device|terminal)|hardware interface)/i.test(lower);
  if (mentionsApp && mentionsHardware) {
    defects.push({
      id: "GATE-DELIVERY-CONTRADICTION",
      severity: "critical",
      category: "Internal consistency",
      detail: "Delivery-mechanism contradiction: the draft describes BOTH a smartphone/app-on-personal-phone deployment AND a dedicated hardware device/kiosk. Pick ONE delivery channel and make every section consistent (a reviewer reads this as a template splice). If a hybrid is intended, state it explicitly with a single coherent rationale.",
    });
  }

  // Gate 15 — non-licensed staff handling acute self-harm escalation (NIMH liability).
  const autoSelfHarmAlert = /(self[- ]harm|suicidal ideation|suicide risk|suicidality|988).{0,200}(alert|notify|notification|route|escalat|flag|monitor|track)/i.test(lower) ||
    /(alert|notify|notification|escalat).{0,120}(self[- ]harm|suicidal|suicide)/i.test(lower);
  const nonClinicalReceiver = /(case manager|shelter staff|housing specialist|navigator|community health worker|chw|coordinator|peer support|social service (?:coordinator|staff)|non[- ]clinical staff)/i.test(lower);
  const hasLicensedPathway = /(licensed (?:clinician|therapist|psychologist|psychiatrist|social worker)|on[- ]call clinician|crisis[- ]trained|independent safety monitor|dsmb|data (?:and )?safety monitoring|clinical escalation pathway|24\/7 clinician)/i.test(lower);
  if (autoSelfHarmAlert && nonClinicalReceiver && !hasLicensedPathway) {
    defects.push({
      id: "GATE-CRISIS-ESCALATION-LIABILITY",
      severity: "critical",
      category: "Clinical safety / regulatory",
      detail: "Acute self-harm/suicide alerts are routed to non-clinical staff (case managers, shelter/housing staff, navigators, CHWs) without a licensed crisis pathway. Under NIMH risk-monitoring guidelines, active self-harm vectors require a dedicated, clinically licensed crisis-escalation pathway and independent safety monitors (on-call licensed clinician + DSMB). For minors (14–18), an IRB will halt the protocol without this. Add a licensed escalation tier and DSMB.",
    });
  }

  // Gate 16 — META-TEXTUAL LEAK: AI error/fallback text left inside the artifact.
  if (/(the retrieved records do not provide|this section cannot be completed|as an ai|i (?:cannot|am unable to)|insufficient (?:retrieved )?(?:data|evidence|context)|machine[- ]generated|generation fallback)/i.test(lower)) {
    defects.push({
      id: "GATE-META-TEXT-LEAK",
      severity: "critical",
      category: "Administrative integrity",
      detail: "A literal AI error/fallback message is embedded in the artifact body (e.g., 'the retrieved records do not provide...', 'this section cannot be completed'). An SRO returns this without review. Replace with real content or an explicit, professionally-worded placeholder owned by the investigator — never an AI fallback sentence.",
    });
  }

  // Gate 17 — STEPPED-WEDGE statistical void.
  if (/(stepped[- ]wedge|sw[- ]crt)/i.test(lower) &&
      !/(\bk\s*=\s*\d+|\d+\s*clusters?|\d+\s*steps?|step durations?|sequences?|icc|intracluster|intraclass|autocorrelation|cluster[- ]?period)/i.test(lower)) {
    defects.push({
      id: "GATE-STEPPED-WEDGE-VOID",
      severity: "critical",
      category: "Statistical design",
      detail: "Stepped-Wedge cRCT chosen but the longitudinal power model is empty: no cluster count (k), step durations, per-step cohort size (m), ICC (ρ), or within-cluster autocorrelation. SW-CRTs are time-confounded; a biostatistics reviewer will read a missing model as lack of methodological expertise. Provide the full SW-CRT power model.",
    });
  }

  // Gate 18 — BARON & KENNY anachronism for nested/binary mediation.
  if (/baron (?:&|and) kenny|causal steps (?:approach|method)/i.test(lower)) {
    defects.push({
      id: "GATE-BARON-KENNY-ANACHRONISM",
      severity: "major",
      category: "Statistical method",
      detail: "Baron & Kenny causal-steps mediation is outdated for modern NIH panels — it has low power and cannot natively handle a binary mediator within nested data without bias. Use a counterfactual/causal mediation framework or generalized multilevel SEM (GSEM) with product-of-coefficients and cluster-bootstrapped CIs.",
    });
  }

  // Gate 19 — LONGITUDINAL subscript mismatch (cross-sectional equation for repeated measures).
  if (/(baseline to \d+\s*month|repeated measures|over time|longitudinal|\d+[- ]month follow[- ]up)/i.test(lower) &&
      /Y_?\{?i\}?_?j\}?\s*=|Y\s*ij\s*=|β0|\\beta_0/i.test(text) &&
      !/Y_?\{?ijt\}?|Y\s*ijt|time subscript|v_?\{?ij\}?|random effect for (?:the )?individual/i.test(text)) {
    defects.push({
      id: "GATE-LONGITUDINAL-SUBSCRIPT",
      severity: "major",
      category: "Statistical model",
      detail: "The stated model is cross-sectional (Y_ij) but the design is longitudinal (repeated measures). Use a 3-level structure (time within individuals within clusters): Y_ijt with a time subscript, a Time_t term, and a random effect for the individual (v_ij) plus the cluster random effect (u_j).",
    });
  }

  // Gate 20 — SABV power paradox (claims full subgroup power under main-effect N).
  if (/(powered for both sexes|appropriately powered for both|sex[- ]stratified targets)/i.test(lower) &&
      /(secondary analys|treatment[- ]by[- ]sex interaction|sex[- ]disaggregated)/i.test(lower) &&
      !/(interaction[- ]powered|sample size (?:doubl|quadrupl)|scaled for interaction|powered for the interaction)/i.test(lower)) {
    defects.push({
      id: "GATE-SABV-POWER-PARADOX",
      severity: "major",
      category: "Statistical power (SABV)",
      detail: "Contradiction: the draft claims the study is powered for BOTH sexes/interaction yet relegates sex-by-treatment to secondary analyses. Powering for a subgroup interaction typically 2–4×'s the sample. State plainly that the study is powered for the main effect with sex as a covariate, and label interaction tests exploratory — or scale N for the interaction.",
    });
  }

  // Gate 21 — ALERT FATIGUE: short urgent-alert window for a slow structural process.
  if (/(\d+)[- ]?hour.{0,80}(alert|follow[- ]up|notification|referral)/i.test(lower) &&
      /(housing placement|housing|structural|eviction|benefits enrollment)/i.test(lower)) {
    defects.push({
      id: "GATE-ALERT-FATIGUE",
      severity: "major",
      category: "Operational feasibility",
      detail: "A short urgent-alert window (e.g., 72-hour) is applied to slow structural processes (housing placement takes weeks/months). This floods case managers and causes alert fatigue → staff ignore the system. Tier alert cadence by referral type (acute food vs. long-horizon housing).",
    });
  }

  // Gate 22 — IMPLEMENTATION SCIENCE identity crisis (tool treated as the strategy).
  if (/implementation (?:science|strategy|research)/i.test(lower) &&
      /(digital (?:tool|platform|decision[- ]support)|app|software)/i.test(lower) &&
      !/(clinical champion|interactive facilitation|audit[- ]and[- ]feedback|implementation strategy (?:is|consists)|erics?|organizational (?:change|mechanism))/i.test(lower)) {
    defects.push({
      id: "GATE-IMPLSCI-IDENTITY",
      severity: "major",
      category: "Implementation science",
      detail: "Implementation-science framing treats the software tool AS the implementation strategy. The tool is the clinical intervention; the implementation strategy is the organizational/behavioral mechanism to get clinicians to adopt and sustain it (clinical champions, interactive facilitation, audit-and-feedback — ERIC taxonomy). Describe the human/organizational adoption methods, not just the software.",
    });
  }

  // Gate 23 — BROADBAND feasibility paradox (digital intervention in low-connectivity area).
  if (/(digital (?:mental health|intervention|platform|tool)|app[- ]based|telehealth)/i.test(lower) &&
      /(broadband (?:availability|deficit|gap|access)|low connectivity|rural (?:internet|connectivity)|technological access (?:issues|barriers))/i.test(lower) &&
      !/(cellular data[- ]?stipend|offline[- ]first|offline caching|progressive web app|pwa|sms fallback|project[- ]provided device|loaner device)/i.test(lower)) {
    defects.push({
      id: "GATE-BROADBAND-PARADOX",
      severity: "major",
      category: "Operational feasibility",
      detail: "The intervention is digital but the target area has acknowledged broadband/connectivity deficits, with no mitigation. Add an operational framework: cellular-data-stipended project devices, offline-first/PWA caching, or SMS fallback — otherwise the primary intervention cannot physically function.",
    });
  }

  return defects;
}

// ── LLM-driven adversarial red-team (batched into ONE call) ───────────────

const RED_TEAM_PERSONAS = [
  "a hostile NIH study-section reviewer hunting for fundability-killing defects",
  "a methodologist verifying every statistical method matches the stated design",
  "a federal-policy compliance officer (SABV, funding-authority, framework attribution)",
];

/**
 * Build ONE batched prompt that asks the model to red-team the draft from
 * multiple adversarial angles and return structured defects. One request total.
 */
export async function runAdversarialRedTeam(
  draft: string,
  userQuery: string,
  baseParams: GenerateParams,
  opts?: { domain?: string; rpm?: number; onDebug?: (m: string) => void },
): Promise<AdversarialReport> {
  // Deterministic gates first (free).
  const structural = runStructuralGates(draft, { domain: opts?.domain });
  opts?.onDebug?.(`Structural gates: ${structural.length} defect(s) [${structural.map((d) => d.id).join(", ") || "none"}]`);

  // Embed the DRAFT + USER ASK ONCE in the shared intro instead of duplicating
  // them once per persona (was 3 × 6000 = 18KB per red-team call). Saves ~12KB
  // of transient string allocation per N-Deep pass.
  const draftSlice = String(draft.slice(0, 6000));
  const intro = `You are running a multi-persona adversarial review of a DRAFT answer. Be ruthless and specific. Only report defects that a frontier reviewer would consider fundability-killing or accuracy-killing.\n\nUSER ASK: ${userQuery}\n\nDRAFT:\n${draftSlice}`;
  const sections = RED_TEAM_PERSONAS.map((p, i) => ({
    key: `critic_${i + 1}`,
    prompt: `As ${p}, list the 1-3 most serious concrete defects in the DRAFT above. For each: severity (critical|major|minor), category, and a one-sentence fix. If none, return "NONE".`,
  }));
  const prompt = batchPrompts(intro, sections);

  let raw = "";
  try {
    raw = await throttle(
      () => generateSynthesizedResponse({ ...baseParams, userMessage: prompt, retrievedWebData: undefined, conversationHistory: [] }),
      { rpm: opts?.rpm, onWait: (ms) => opts?.onDebug?.(`RPM throttle: waiting ${ms}ms before red-team call`) },
    );
    raw = String(raw.slice(0, 12_000));
  } catch (e) {
    opts?.onDebug?.(`Adversarial red-team call failed (${(e as Error).message}) — relying on structural gates only`);
    return { defects: structural, verdict: structural.some((d) => d.severity === "critical") ? "revise" : "pass", rawCritique: "" };
  }

  const parsed = parseBatchReply(raw, sections.map((s) => s.key));
  const llmDefects: Defect[] = [];
  for (const [key, val] of Object.entries(parsed)) {
    if (!val || /^\s*none\s*$/i.test(val)) continue;
    const sev: Defect["severity"] = /critical/i.test(val) ? "critical" : /major/i.test(val) ? "major" : "minor";
    llmDefects.push({ id: `LLM-${key}`, severity: sev, category: "Adversarial review", detail: val.slice(0, 400) });
  }
  opts?.onDebug?.(`LLM red-team: ${llmDefects.length} defect(s) across ${RED_TEAM_PERSONAS.length} critics (1 batched call)`);

  const defects = [...structural, ...llmDefects];
  const verdict = defects.some((d) => d.severity === "critical" || d.severity === "major") ? "revise" : "pass";
  return { defects, verdict, rawCritique: String(raw.slice(0, 4_000)) };
}

/** Render defects as a repair instruction block for the next synthesis pass. */
export function buildRepairBlock(defects: Defect[]): string {
  if (defects.length === 0) return "";
  const lines = defects.map((d, i) => `${i + 1}. [${d.severity.toUpperCase()} · ${d.category}] ${d.detail}`);
  return `ADVERSARIAL DEFECTS TO FIX (a hostile reviewer found these in your prior draft — fix EVERY one, do not acknowledge this list in the output):\n${lines.join("\n")}`;
}
