/**
 * §B THE 7 OMEGA AI-NATIVE MASTER TEMPLATES + §C OVERRIDE REGISTRY
 * 1:1 with the research doc. Additive: when a template is selected its
 * section skeleton + style-modulation hooks inject into the synthesis
 * prompt. The anti-hallucination stack still wraps every stage.
 */

export type OmegaArchetype =
  | "OMEGA-STRATEGY"
  | "OMEGA-DILIGENCE"
  | "OMEGA-DISCOVERY"
  | "OMEGA-COMPLIANCE"
  | "OMEGA-BUILD"
  | "OMEGA-SCIENCE"
  | "OMEGA-CRISIS"
  | "NIH-GRANT-SRF";

export interface OmegaSection {
  id: string;
  title: string;
  hint: string;
  pages?: string;
}

export interface OmegaTemplate {
  id: string;
  name: string;
  tagline: string;
  replaces: string;
  sections: OmegaSection[];
  styleHooks: string[];
  custom?: boolean;
}

export interface StyleOverride {
  token: string;
  legacy: string;
  mapsTo: OmegaArchetype;
  hooks: string;
}

export function unifiedHeaderBlock(opts: {
  title: string; audience: string; date: string; classification: string;
  sscpHash: string; evidenceTier: string; model: string; cutoff: string; styleMode: string;
}): string {
  return [
    "╔══════════════════════════════════════════════════════════════╗",
    `║ ${opts.title} | ${opts.audience} | ${opts.date}`,
    `║ Classification: ${opts.classification}`,
    `║ SSCP Receipt: ${opts.sscpHash} | Evidence Tier: ${opts.evidenceTier}`,
    `║ AI Disclosure: ${opts.model} | Cutoff: ${opts.cutoff}`,
    `║ Style Mode: ${opts.styleMode}`,
    "╚══════════════════════════════════════════════════════════════╝",
  ].join("\n");
}

export const OMEGA_TEMPLATES: OmegaTemplate[] = [
  {
    id: "OMEGA-STRATEGY",
    name: "OMEGA-STRATEGY",
    tagline: "Strategic Recommendation",
    replaces: "McKinsey Strategy Deck, BCG T-Model, Bain Corporate Strategy, Strategy& CDS, Roland Berger, L.E.K., Kearney, Market Entry",
    sections: [
      { id: "§1", title: "BLUF", hint: "Decision trigger, value at stake ($NPV/IRR + confidence), top 3 action-titled MECE findings, recommendation + deadline", pages: "1 page" },
      { id: "§2", title: "Situation (SCQA)", hint: "Baseline state, complication, decision question, preview of answer", pages: "1-2 pages" },
      { id: "§3", title: "Diagnostic (T-Bar)", hint: "Market dynamics (TAM/SAM/SOM cited), competitive position, root-cause issue tree (MECE)", pages: "3-5 pages" },
      { id: "§4", title: "Options Tournament", hint: "≥4 paths incl. rejected naive default, weighted rubric, exclusion proofs (falsification gate), winning path + utility score", pages: "2-3 pages" },
      { id: "§5", title: "Recommendation & Value Bridge", hint: "3-5 bold moves, value bridge entry→exit by lever, quantified impact, capability requirements", pages: "2 pages" },
      { id: "§6", title: "Implementation (Wave Architecture)", hint: "Wave 1 (0-6mo) / Wave 2 (6-18mo) / Wave 3 (18mo+), RACI, resource ask, KPI dashboard", pages: "2 pages" },
      { id: "§7", title: "Risk Register & Assumption Ledger", hint: "Top 5-10 risks P×I with mitigants, [ASSUM] flags + sensitivity analysis", pages: "1 page" },
      { id: "§A", title: "Appendix (T-Body)", hint: "Data exhibits, methodology, interview list, model" },
    ],
    styleHooks: ["Action titles ON (McKinsey)", "Red/black palette (Bain)", "NPS section (Bain PE)", "European stakeholder layer (Roland Berger)", "Bottom-up sizing model (L.E.K.)", "TCO/Procurement depth (Kearney)"],
  },
  {
    id: "OMEGA-DILIGENCE",
    name: "OMEGA-DILIGENCE",
    tagline: "Investment & Transaction Analysis",
    replaces: "Bain PE Due Diligence, EY-Parthenon Transaction, Commercial DD, Quality of Earnings",
    sections: [
      { id: "§0", title: "Scope & Reliance Statement", hint: "Procedures performed, data cutoff, limitations, privilege status", pages: "0.5 page" },
      { id: "§1", title: "Investment Thesis", hint: "Bull/bear case (2 sentences), verdict PROCEED/CONDITIONAL/PASS, red-flags ledger, open items", pages: "1 page" },
      { id: "§2", title: "Market Attractiveness", hint: "Size/growth/profitability (sourced), Porter 5F, tailwinds vs disruption", pages: "2 pages" },
      { id: "§3", title: "Competitive Position & Moat", hint: "Share trajectory, relative cost, pricing power, concentration, switching costs, defensibility", pages: "2 pages" },
      { id: "§4", title: "Commercial Diligence", hint: "Customer interview synthesis (n=, methodology), NPS/retention, challenge of mgmt plan", pages: "3 pages" },
      { id: "§5", title: "Financial Diligence & QofE", hint: "Adjusted EBITDA bridge, revenue quality, working capital, CapEx, net debt, off-balance-sheet", pages: "3 pages" },
      { id: "§6", title: "Value Creation Plan", hint: "5yr EBITDA bridge, growth + margin levers quantified, multiple expansion, IRR/MOIC scenarios", pages: "2 pages" },
      { id: "§7", title: "Risk Register", hint: "Top 10 risks ranked P×I with structural mitigants", pages: "1 page" },
      { id: "§A", title: "Appendix", hint: "Model, anonymized transcripts, comparables, market sources" },
    ],
    styleHooks: ["NPS deep-dive (Bain)", "Customer interview-heavy (EY-P)", "QofE adjustment tables (Big 4)", "Sponsor-specific value creation (PE)"],
  },
  {
    id: "OMEGA-DISCOVERY",
    name: "OMEGA-DISCOVERY",
    tagline: "Research, Thought Leadership & Surveys",
    replaces: "McKinsey MGI, BCG Perspectives, Deloitte Regulatory Outlook, PwC CEO Survey, EY Sector Outlook, KPMG CEO Outlook, Accenture Tech Vision, Academic Policy Brief",
    sections: [
      { id: "§0", title: "Foreword", hint: "Why this report, why now (timeliness anchor), from [leader]", pages: "0.5 page" },
      { id: "§1", title: "Methodology Note", hint: "Sample size, respondent profile, field dates, weighting, source hierarchy, citations + reproducibility", pages: "1 page" },
      { id: "§2", title: "Executive Summary", hint: "5 headline findings (≤30 words each, data-anchored), infographic summary", pages: "2 pages" },
      { id: "§3", title: "The Big Idea / Central Thesis", hint: "The provocation (striking stat/paradox), what changed, why prior consensus fails", pages: "1 page" },
      { id: "§4", title: "Thematic Deep Dives (3-7 chapters)", hint: "Per chapter: synthesis paragraph, evidence base, leader-vs-laggard, quantified impact, disconfirming evidence (steelman)", pages: "4-8 pages each" },
      { id: "§5", title: "Regional / Sector Cuts", hint: "Americas/EMEA/APAC, sector heatmap (FS/Health/Industrial/TMT/Energy)", pages: "2-3 pages" },
      { id: "§6", title: "Horizon Scan", hint: "Near-term (12mo) / medium (1-3yr) / long-term wildcards, what would change our view", pages: "1 page" },
      { id: "§7", title: "Implications by Stakeholder", hint: "Business leaders / policymakers / workers / investors / regulators", pages: "2 pages" },
      { id: "§A", title: "Appendix", hint: "Full methodology, cross-tabs, regulatory tracker, glossary, bibliography (DOIs)" },
    ],
    styleHooks: ["Long-form 80-150pp (MGI)", "Punchy 8-20pp (BCG Perspectives)", "Survey-heavy (PwC/KPMG)", "Regulatory tracker tables (Deloitte)", "Practitioner-architectural (Accenture Tech Vision)"],
  },
  {
    id: "OMEGA-COMPLIANCE",
    name: "OMEGA-COMPLIANCE",
    tagline: "Audit, Risk, Governance & ESG",
    replaces: "Deloitte Strategy & Ops, KPMG Advisory, GAO Audit, GAO PAR, Government Consulting, Oliver Wyman FinServ, ERM Assessment, ESG/Sustainability",
    sections: [
      { id: "§0", title: "Transmittal Letter", hint: "Addressed to committee/board, scope restatement, limitations, signature", pages: "0.5 page" },
      { id: "§1", title: "Highlights Page (GAO-style)", hint: "LEFT: why this study | CENTER: key exhibit | RIGHT: what we found + recommend", pages: "1 page" },
      { id: "§2", title: "Background & Regulatory Context", hint: "Framework (COSO ERM 2017 / ISO 31000 / CSRD / GAGAS), prior work, materiality", pages: "2 pages" },
      { id: "§3", title: "Methodology", hint: "Evidence categories, GAGAS sufficiency, interviews, methods", pages: "1 page" },
      { id: "§4", title: "Findings (numbered)", hint: "Per finding: observation, impact, root cause, criterion violated, mgmt response", pages: "3-8 pages" },
      { id: "§5", title: "Risk Inventory & Heat Map", hint: "Risk register (ID, P×I inherent, controls, residual, owner), 5×5 heat map, emerging risks", pages: "2 pages" },
      { id: "§6", title: "Maturity Assessment", hint: "1-5 scale across 5-10 dimensions, heatmap vs peer benchmark, gap analysis", pages: "1 page" },
      { id: "§7", title: "Recommendations", hint: "Numbered, owner-assigned, priority + timeline + investment + metric", pages: "2-4 pages" },
      { id: "§8", title: "Agency/Management Response", hint: "Verbatim response letter, auditor reply, agree/disagree per rec", pages: "1 page" },
      { id: "§9", title: "Implementation Roadmap", hint: "Short/medium/long-term + governance structure", pages: "1 page" },
      { id: "§A", title: "Appendices", hint: "Risk register full, control matrix, GHG inventory (ESG), independence statement" },
    ],
    styleHooks: ["GAO Highlights format", "Finding→Impact→Root Cause→Rec (KPMG)", "Actuarial models (Oliver Wyman)", "CSRD/ESRS double-materiality (ESG)", "COSO ERM framing (Risk)", "Federal Yellow Book GAGAS (GAO)"],
  },
  {
    id: "OMEGA-BUILD",
    name: "OMEGA-BUILD",
    tagline: "Transformation, Architecture & Implementation",
    replaces: "Accenture Digital Transformation, IBM Consulting, Capgemini, Digital Transformation Assessment, Healthcare Strategy",
    sections: [
      { id: "§1", title: "Executive Summary", hint: "Transformation scope, value case, key decisions, digital maturity score (current→aspirational)", pages: "1 page" },
      { id: "§2", title: "Current State Architecture", hint: "App landscape inventory, tech debt, data/integration/security architecture, cloud status, capability maturity", pages: "3 pages" },
      { id: "§3", title: "Maturity Assessment", hint: "Scored: CX/Data&Analytics/Cloud/AI&Automation/Cybersec/Org&Talent/Op Model, heat map vs peers", pages: "2 pages" },
      { id: "§4", title: "Opportunity Portfolio", hint: "CX / operational efficiency / new business model / data monetization — each: size × feasibility × investment × timeline", pages: "2 pages" },
      { id: "§5", title: "Future State Architecture", hint: "Target landscape, cloud strategy, data & AI platform, security & compliance (GDPR/NIS2/AI Act/HIPAA/FedRAMP)", pages: "3 pages" },
      { id: "§6", title: "AI & Automation Roadmap", hint: "Use-case portfolio (100-day → long-term), GenAI opportunities, data-readiness gates, AI governance", pages: "2 pages" },
      { id: "§7", title: "Transformation Roadmap (Waves)", hint: "Wave 1 quick wins, Wave 2 scale, Wave 3 differentiation, milestone gates, investment by wave", pages: "2 pages" },
      { id: "§8", title: "Business Case", hint: "TCO categories, benefits (efficiency/revenue/risk), NPV/IRR/payback, sensitivity", pages: "2 pages" },
      { id: "§9", title: "Operating Model & Governance", hint: "Agile/DevOps/MLOps, product teams, vendor ecosystem, build vs buy vs partner", pages: "1 page" },
      { id: "§10", title: "Change Management", hint: "Stakeholder map, comms plan, training, adoption metrics", pages: "1 page" },
      { id: "§A", title: "Appendix", hint: "Architecture diagrams, vendor comparison matrix, financial model, security/compliance trace" },
    ],
    styleHooks: ["Hyperscaler-neutral default", "Google Cloud-tilt (Capgemini)", "watsonx-tilt (IBM)", "AI Refinery-tilt (Accenture)", "Healthcare HEDIS/CMS Stars overlay"],
  },
  {
    id: "OMEGA-SCIENCE",
    name: "OMEGA-SCIENCE",
    tagline: "Scientific & Academic (IMRAD)",
    replaces: "IMRAD Empirical Article, PRISMA Systematic Review, Dissertation, Narrative Review",
    sections: [
      { id: "§0", title: "Administrative Front Matter", hint: "Title, authors + ORCID, affiliations, funding, COI, AI Use Disclosure (Model/Version/Scope)" },
      { id: "§1", title: "Structured Abstract", hint: "Background | Methods | Results | Conclusions, 3-6 MeSH/Keywords", pages: "250 words" },
      { id: "§2", title: "Introduction", hint: "Problem magnitude, knowledge gap (niche), study rationale, central hypotheses", pages: "1-2 pages" },
      { id: "§3", title: "Methods", hint: "Design, setting, sample, measures, statistical plan (effect size, correction, missing data), ethics/IRB", pages: "3-5 pages" },
      { id: "§4", title: "Results", hint: "Aim-by-aim findings, descriptive stats, all inferential stats (p, effect size, 95% CI), tables/figures", pages: "3-5 pages" },
      { id: "§5", title: "Discussion", hint: "Findings summary, comparison to prior lit, mechanisms, strengths/limitations, implications", pages: "2-3 pages" },
      { id: "§6", title: "Conclusions", hint: "Final contribution, future directions, field-shaping summary", pages: "0.5 page" },
      { id: "§A", title: "Appendices", hint: "References (DOIs), supplementary tables, data/code availability statement" },
    ],
    styleHooks: ["IMRAD pure", "PRISMA 2020 (Flow diagram)", "Cochrane Review", "APA JARS (Psych/Social)"],
  },
  {
    id: "NIH-GRANT-SRF",
    name: "NIH-GRANT-SRF",
    tagline: "NIH Simplified Review Framework (2025+)",
    replaces: "NIH R01, R03, R15, R21 Proposals after Jan 25, 2025",
    sections: [
      { id: "§0", title: "Specific Aims", hint: "Long-term goal, objective, central hypothesis, 3 independent/synergistic aims, expected outcomes, impact", pages: "1 page" },
      { id: "§1", title: "Factor 1: Importance of the Research", hint: "Significance and Innovation. Establishing high impact likelihood. Rigor of prior research assessment.", pages: "2-2.5 pages" },
      { id: "§2", title: "Factor 2: Rigor and Feasibility of the Approach", hint: "Detailed methodology, unbiased robust data, sample size (ICC-adjusted), controls, pitfalls & alternatives, SABV", pages: "8.5-9 pages" },
      { id: "§3", title: "Human Subjects / Vertebrate Animals", hint: "Protection, inclusion across lifespan, recruitment, clinical trial timeline if relevant" },
      { id: "§4", title: "Data Management and Sharing (DMS)", hint: "Data types, standards, preservation/access, oversight, institutional support" },
      { id: "§A", title: "Appendices", hint: "References cited, facilities, resources, biosketch logic, budget justification" },
    ],
    styleHooks: ["Factor 1 Importance", "Factor 2 Rigor", "Factor 3 Expertise/Resources (Acceptable/Unacceptable)", "SimplerNOFO era"],
  },
  {
    id: "OMEGA-CRISIS",
    name: "OMEGA-CRISIS",
    tagline: "Restructuring, Federal RFP, Emergency Response",
    replaces: "AlixPartners Restructuring, Federal Government Proposal/RFP Response",
    sections: [
      { id: "§0", title: "Privilege & Scope Notice", hint: "Attorney-client privilege (restructuring), FAR/DFARS clauses (federal RFP), Section 508/WCAG 2.1 AA, document control", pages: "0.5 page" },
      { id: "§1", title: "Situation Overview", hint: "Current condition, liquidity runway (restructuring), understanding of requirement (RFP), crisis triggers, stakeholder map", pages: "1 page" },
      { id: "§2", title: "Immediate-Term Forecast", hint: "13-week cash flow (restructuring) OR 30/60/90-day transition plan (RFP), minimum liquidity/performance threshold" },
      { id: "§3", title: "Operational Assessment", hint: "Business unit performance, cost structure, revenue sustainability, quick-win actions", pages: "2 pages" },
      { id: "§4", title: "Strategic Options", hint: "A: standalone reorg / continue. B: sale/363 / alternate vendor. C: wind-down / withdrawal. Comparative matrix + recommendation", pages: "2 pages" },
      { id: "§5", title: "Execution Plan", hint: "Phased timeline (court filings / contract milestones), workplan by task area (PWS/SOW), resource + key personnel + clearances, QASP", pages: "3 pages" },
      { id: "§6", title: "Governance & Risk", hint: "Steering structure, decision rights, risk register, key dependencies", pages: "1 page" },
      { id: "§7", title: "Past Performance / Track Record", hint: "Contract refs (PIID, agency, value, POC, CPARS) (federal), prior crisis engagements (restructuring)", pages: "2 pages" },
      { id: "§8", title: "Price / Volume IV", hint: "CLIN-structured pricing, labor categories × rates × hours, escalation, pricing narrative (federal)", pages: "1-2 pages" },
      { id: "§A", title: "Appendix", hint: "Financial model, creditor analysis, key personnel resumes (clearances), legal/regulatory trace" },
    ],
    styleHooks: ["Court-exhibit format (AlixPartners)", "4-Volume FAR-compliant (Technical/Past Perf/Personnel/Price)", "Classified markings (TS/SCI/SECRET/CUI)"],
  },
];

// ─── §C Style Override Registry (40 legacy templates) ───────────────
export const STYLE_OVERRIDES: StyleOverride[] = [
  { token: "--mckinsey-classic", legacy: "McKinsey Strategy Deck (1A)", mapsTo: "OMEGA-STRATEGY", hooks: "Action titles + Ghost deck + Pyramid Principle + Exhibit numbering" },
  { token: "--mgi-research", legacy: "McKinsey MGI Research (1B)", mapsTo: "OMEGA-DISCOVERY", hooks: "80-150pp + full-page exhibits + 4-6pp standalone ExecSumm" },
  { token: "--bcg-tmodel", legacy: "BCG T-Model Deck (2A)", mapsTo: "OMEGA-STRATEGY", hooks: "T-Bar/T-Body split + Growth-Share Matrix + green palette" },
  { token: "--bcg-perspective", legacy: "BCG Perspectives White Paper (2B)", mapsTo: "OMEGA-DISCOVERY", hooks: "8-20pp + provocation opening + named framework" },
  { token: "--bain-pe", legacy: "Bain PE Due Diligence (3A)", mapsTo: "OMEGA-DILIGENCE", hooks: "NPS section + 55pp narrative + red/black palette" },
  { token: "--bain-strategy", legacy: "Bain Corporate Strategy (3B)", mapsTo: "OMEGA-STRATEGY", hooks: "Full Potential + Results Delivery + bold moves" },
  { token: "--deloitte-engagement", legacy: "Deloitte Strategy & Ops (4A)", mapsTo: "OMEGA-BUILD", hooks: "Document control block + chapter structure + green palette" },
  { token: "--deloitte-regoutlook", legacy: "Deloitte Regulatory Outlook (4B)", mapsTo: "OMEGA-DISCOVERY", hooks: "Regulatory tracker table + jurisdiction × deadline matrix" },
  { token: "--strategy&-cds", legacy: "Strategy& Corporate Strategy (5A)", mapsTo: "OMEGA-STRATEGY", hooks: "Capabilities-Driven Strategy + Way to Play + transmittal letter" },
  { token: "--pwc-ceosurvey", legacy: "PwC Global CEO Survey (5B)", mapsTo: "OMEGA-DISCOVERY", hooks: "4000+ CEO sample + longitudinal trend + regional cross-tabs" },
  { token: "--ey-parthenon", legacy: "EY-Parthenon Transaction (6A)", mapsTo: "OMEGA-DILIGENCE", hooks: "EY yellow accent + commercial diligence-heavy + legal disclaimer" },
  { token: "--ey-sectoroutlook", legacy: "EY Sector Outlook (6B)", mapsTo: "OMEGA-DISCOVERY", hooks: "Survey-heavy + horizon scan + risk framing" },
  { token: "--kpmg-advisory", legacy: "KPMG Advisory (7A)", mapsTo: "OMEGA-COMPLIANCE", hooks: "Finding→Impact→Root Cause→Recommendation + audit traceability" },
  { token: "--kpmg-ceooutlook", legacy: "KPMG CEO Outlook (7B)", mapsTo: "OMEGA-DISCOVERY", hooks: "~1300 CEO sample + Three Horizons + regulatory risk lens" },
  { token: "--olwyman-finserv", legacy: "Oliver Wyman FinServ (8)", mapsTo: "OMEGA-COMPLIANCE", hooks: "Actuarial models + probability distributions + statistical bands" },
  { token: "--rolandberger", legacy: "Roland Berger (9)", mapsTo: "OMEGA-STRATEGY", hooks: "European regulatory + Mittelstand + stakeholder integration" },
  { token: "--lek", legacy: "L.E.K. (10)", mapsTo: "OMEGA-STRATEGY", hooks: "Bottom-up market sizing + rNPV pipeline + physician/payer surveys" },
  { token: "--kearney", legacy: "Kearney (11)", mapsTo: "OMEGA-STRATEGY", hooks: "Procurement Maturity + TCO framework + waterfall savings charts" },
  { token: "--alixpartners", legacy: "AlixPartners Restructuring (12)", mapsTo: "OMEGA-CRISIS", hooks: "13-week cash flow + court exhibit format + attorney-client privilege" },
  { token: "--accenture-transform", legacy: "Accenture Digital Transformation (13A)", mapsTo: "OMEGA-BUILD", hooks: "Architecture diagrams + AI Refinery + Accenture purple" },
  { token: "--accenture-techvision", legacy: "Accenture Tech Vision (13B)", mapsTo: "OMEGA-DISCOVERY", hooks: "5-trends format + ~3000 exec survey + practitioner depth" },
  { token: "--ibm", legacy: "IBM Consulting (14)", mapsTo: "OMEGA-BUILD", hooks: "watsonx-positioned + POC results + hybrid advisory-sales" },
  { token: "--capgemini", legacy: "Capgemini (15)", mapsTo: "OMEGA-BUILD", hooks: "Google Cloud tilt + GDPR/NIS2/AI Act + sovereign cloud" },
  { token: "--gao-audit", legacy: "GAO Audit (16A)", mapsTo: "OMEGA-COMPLIANCE", hooks: "Highlights 1-pager + Yellow Book GAGAS + agency response + numbered recs" },
  { token: "--gao-par", legacy: "GAO PAR (16B)", mapsTo: "OMEGA-COMPLIANCE", hooks: "OMB A-136 + GPRA + 5-part structure + audited financials" },
  { token: "--federal-rfp", legacy: "Federal RFP Response (17)", mapsTo: "OMEGA-CRISIS", hooks: "4-Volume FAR structure + CPARS + Section 508 + DFARS" },
  { token: "--govcon", legacy: "Government Consulting (18)", mapsTo: "OMEGA-COMPLIANCE", hooks: "OMB A-94 cost-benefit + classified markings + agency-specific" },
  { token: "--nih-r01", legacy: "NIH R01 Grant (19A)", mapsTo: "OMEGA-SCIENCE", hooks: "Simplified Review Framework (Factor 1 + Factor 2) + 12pp limit" },
  { token: "--nih-rppr", legacy: "NIH RPPR Progress (19B)", mapsTo: "OMEGA-SCIENCE", hooks: "Sections A-H + Research.gov format + Current & Pending update" },
  { token: "--nsf-pappg", legacy: "NSF Proposal (20)", mapsTo: "OMEGA-SCIENCE", hooks: "PAPPG + Intellectual Merit + Broader Impacts standalone + Safe/Inclusive" },
  { token: "--imrad", legacy: "IMRAD Empirical Article (21A)", mapsTo: "OMEGA-SCIENCE", hooks: "Pure IMRAD + structured abstract + reporting checklist" },
  { token: "--prisma", legacy: "PRISMA Systematic Review (21B)", mapsTo: "OMEGA-SCIENCE", hooks: "PRISMA 2020 + PROSPERO registration + GRADE + flow diagram" },
  { token: "--policybrief", legacy: "Academic Policy Brief (21C)", mapsTo: "OMEGA-DISCOVERY", hooks: "Think tank format + non-specialist audience + working paper number" },
  { token: "--market-entry", legacy: "Market Entry / Assessment (22)", mapsTo: "OMEGA-STRATEGY", hooks: "TAM/SAM/SOM + 4-option entry analysis + 5-year financial ramp" },
  { token: "--cdd", legacy: "Commercial Due Diligence (23)", mapsTo: "OMEGA-DILIGENCE", hooks: "Customer interview chapter + management plan challenge" },
  { token: "--digital-assess", legacy: "Digital Transformation Assessment (24)", mapsTo: "OMEGA-BUILD", hooks: "5-7 dimension maturity heatmap + wave roadmap" },
  { token: "--esg-csrd", legacy: "ESG/Sustainability (25)", mapsTo: "OMEGA-COMPLIANCE", hooks: "Double materiality + Scope 1/2/3 + CSRD/ESRS/ISSB" },
  { token: "--erm-coso", legacy: "ERM Assessment (26)", mapsTo: "OMEGA-COMPLIANCE", hooks: "COSO ERM 2017 + ISO 31000 + 5x5 heat map + 3 lines of defense" },
  { token: "--qofe", legacy: "Quality of Earnings (27)", mapsTo: "OMEGA-DILIGENCE", hooks: "EBITDA bridge + adjustments table + agreed-upon procedures" },
  { token: "--healthcare", legacy: "Healthcare Consulting (28)", mapsTo: "OMEGA-BUILD", hooks: "HEDIS + CMS Stars + payer mix + clinical variation analysis" },
];

// ─── §D Selection decision matrix ───────────────────────────────────
export const SELECTION_MATRIX: { task: string; def: OmegaArchetype; override: string }[] = [
  { task: "Recommend a strategy", def: "OMEGA-STRATEGY", override: "PE due diligence depth → --bain-pe" },
  { task: "Should we invest / acquire?", def: "OMEGA-DILIGENCE", override: "Only earnings quality → --qofe" },
  { task: "What's happening in [field]?", def: "OMEGA-DISCOVERY", override: "CEO survey longitudinal → --pwc-ceosurvey" },
  { task: "Audit / find gaps / assess risk", def: "OMEGA-COMPLIANCE", override: "Federal Yellow Book → --gao-audit" },
  { task: "Build / transform / modernize", def: "OMEGA-BUILD", override: "IBM stack → --ibm" },
  { task: "Scientific publication", def: "OMEGA-SCIENCE", override: "Systematic review → --prisma" },
  { task: "NIH Grant Application", def: "NIH-GRANT-SRF", override: "R01 Full Project → --nih-r01" },
  { task: "Restructuring / federal bid", def: "OMEGA-CRISIS", override: "Court-filed → --alixpartners" },
];

// ─── Auto-pick a template from a query (deterministic keyword routing) ──
const ROUTES: { re: RegExp; id: OmegaArchetype }[] = [
  { re: /\b(invest|acquir|due diligence|valuation|ebitda|earnings quality|target company|m&a|buyout)\b/i, id: "OMEGA-DILIGENCE" },
  { re: /\b(audit|compliance|risk register|governance|esg|csrd|coso|gao|control|materiality)\b/i, id: "OMEGA-COMPLIANCE" },
  { re: /\b(transform|modernize|architecture|migration|cloud|platform|implementation|roadmap|devops)\b/i, id: "OMEGA-BUILD" },
  { re: /\b(nih|r01|r03|r15|r21|grant application|simplified review|specific aims)\b/i, id: "NIH-GRANT-SRF" },
  { re: /\b(grant|hypothesis|study|trial|systematic review|prisma|nsf|imrad|p-?value|methodology)\b/i, id: "OMEGA-SCIENCE" },
  { re: /\b(restructur|bankrupt|liquidity|rfp|federal bid|chapter 11|wind-down|13-week|insolvenc)\b/i, id: "OMEGA-CRISIS" },
  { re: /\b(what.?s happening|trend|outlook|survey|thought leadership|landscape|horizon scan|state of)\b/i, id: "OMEGA-DISCOVERY" },
  { re: /\b(strateg|recommend|should we|market entry|competitive|grow|options|decision)\b/i, id: "OMEGA-STRATEGY" },
];

export function autoPickTemplate(query: string): OmegaArchetype {
  for (const r of ROUTES) if (r.re.test(query)) return r.id;
  return "OMEGA-STRATEGY";
}

export function findTemplate(list: OmegaTemplate[], id: string): OmegaTemplate | undefined {
  return list.find((t) => t.id === id);
}

/** Build the synthesis-prompt skeleton injected when a template is active. */
export function buildTemplatePrompt(t: OmegaTemplate, styleMode: string): string {
  const sections = t.sections
    .map((s) => `  ${s.id} ${s.title}${s.pages ? ` (${s.pages})` : ""} — ${s.hint}`)
    .join("\n");
  return [
    `OUTPUT TEMPLATE: ${t.name} — ${t.tagline}`,
    "Produce the answer using EXACTLY these sections, in order. Begin with the unified header block.",
    "Omit a section ONLY if it is genuinely inapplicable, and say so in one line.",
    sections,
    `STYLE MODE: ${styleMode}`,
    "Apply the relevant style-modulation hooks silently; never print the hook names.",
  ].join("\n");
}
