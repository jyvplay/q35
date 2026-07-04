/**
 * Legal Domain Pack v1
 *
 * Targets text-detectable failure modes in legal/regulatory content:
 *   - "This is legal advice" without attorney-disclaimer
 *   - Jurisdiction-agnostic statutory citation
 *   - Citation to fabricated case law (Mata v. Avianca pattern)
 *   - Statute citation without title/section/year
 *   - Contract clauses without governing-law/venue/severability
 *   - Privilege/confidentiality leakage indicators
 *   - "Always" / "Never" legal absolutes
 *   - GDPR/CCPA conflation
 *   - Misstatement of statutes of limitations
 *   - UPL (Unauthorized Practice of Law) markers
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (
  severity: FlawIssue["severity"],
  code: string,
  message: string,
  remediation: string,
): FlawIssue => ({ severity, code, message, remediation });

function T(c: ScanContext): string { return `${c.prompt}\n${c.answer}`; }
function isLegal(c: ScanContext): boolean {
  return /\b(law|legal|statute|regulation|attorney|lawyer|counsel|court|judge|plaintiff|defendant|contract|clause|agreement|liability|damages|tort|criminal|civil|jurisdiction|appellate|supreme court|circuit|district|prosecut|sue|lawsuit|judgment|sentenc|verdict|breach|negligen|due process|GDPR|CCPA|HIPAA|SEC|FTC|DOJ|EEOC|OSHA|U\.S\.C\.|C\.F\.R\.|§)\b/i.test(T(c));
}
function isAdvisoryLegal(c: ScanContext): boolean {
  return isLegal(c) && /\b(you should|you can|you must|your rights|you are entitled|file a|sue for|recover|claim|enforce)\b/i.test(c.answer);
}

export const LEGAL_FLAWS: FlawDetector[] = [
  // ── UPL / disclaimer ──────────────────────────────────────────────────────
  {
    id: "legal.no-attorney-disclaimer",
    domain: "domain",
    description: "Direct legal advisory content without 'not legal advice / consult attorney' disclaimer.",
    appliesTo: isAdvisoryLegal,
    scan: c => /\b(you should|you can|you must|you are entitled|file a|sue for|recover damages)\b/i.test(c.answer)
      && !/\b(not\s+legal\s+advice|consult\s+(?:an?\s+)?(?:attorney|lawyer)|seek\s+legal\s+counsel|licensed\s+attorney|jurisdiction[-\s]?specific|this\s+is\s+general\s+information)\b/i.test(c.answer)
      ? [mk("major", "LEGAL_NO_ATTORNEY_DISCLAIMER", "Direct legal advisory content without 'not legal advice / consult licensed attorney' disclaimer.", "Add: 'This is general information and not legal advice. Consult a licensed attorney in your jurisdiction for advice on your specific situation.' Failing to do so risks Unauthorized Practice of Law (UPL) exposure.")]
      : [],
  },

  // ── Jurisdiction precision ────────────────────────────────────────────────
  {
    id: "legal.jurisdiction-agnostic",
    domain: "domain",
    description: "Statute/rule cited without jurisdiction (federal vs state, which state, which country).",
    appliesTo: isLegal,
    scan: c => /\b(statute of limitations|filing deadline|burden of proof|sentencing|damages cap|minimum wage|right to)\b/i.test(c.answer)
      && /\b(is|are|requires|allows|prohibits)\b\s+\d/i.test(c.answer)
      && !/\b(federal|state\s+of|under\s+(?:U\.S\.\s+law|California|New York|Texas|EU\s+law|GDPR|UK\s+law|Canadian|Australian)|in\s+(?:most|all|some)\s+(?:states|jurisdictions)|varies\s+by\s+(?:state|jurisdiction))\b/i.test(c.answer)
      ? [mk("major", "LEGAL_JURISDICTION_AGNOSTIC", "Statute / legal rule cited as universal without naming a jurisdiction.", "Specify jurisdiction (federal U.S., specific state, EU GDPR, UK, etc.). Statutes of limitations, damages caps, and procedural rules vary materially across jurisdictions.")]
      : [],
  },

  // ── Case citation integrity ───────────────────────────────────────────────
  {
    id: "legal.citation-no-reporter",
    domain: "domain",
    description: "Case cited without reporter / year — likely hallucinated (Mata v. Avianca pattern).",
    appliesTo: isLegal,
    scan: c => {
      // Case name followed by v., but NO reporter cite within 80 chars
      const cases = [...c.answer.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+v\.\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g)];
      for (const m of cases) {
        const tail = c.answer.slice(m.index! + m[0].length, m.index! + m[0].length + 120);
        const hasReporter = /\b\d+\s+(?:U\.S\.|F\.\s?\d?d?|F\.\s?Supp\.?\s?\d?d?|S\.\s?Ct\.|L\.\s?Ed\.\s?\d?d?|Cal\.|N\.Y\.|N\.E\.\s?\d?d?|S\.W\.\s?\d?d?|P\.\s?\d?d?|A\.\s?\d?d?|So\.\s?\d?d?)\s+\d/i.test(tail);
        const hasYear = /\(\s*(?:1[89]\d{2}|20\d{2})\s*\)/.test(tail);
        if (!hasReporter && !hasYear) {
          return [mk("critical", "LEGAL_CITATION_NO_REPORTER", `Case citation "${m[0]}" lacks reporter and year — likely hallucinated (Mata v. Avianca pattern).`, "Provide full Bluebook citation: case name, reporter volume, reporter abbreviation, page, court, year. Verify the case exists in Westlaw/LexisNexis before citing.")];
        }
      }
      return [];
    },
  },
  {
    id: "legal.statute-no-section",
    domain: "domain",
    description: "Statute referenced (e.g. U.S.C., C.F.R.) without title and section.",
    appliesTo: isLegal,
    scan: c => /\b(?:U\.S\.\s+Code|United\s+States\s+Code|Code\s+of\s+Federal\s+Regulations|federal\s+statute|federal\s+regulation)\b/i.test(c.answer)
      && !/\b\d{1,2}\s+(?:U\.S\.C\.|C\.F\.R\.)\s+§?\s*\d+/i.test(c.answer)
      ? [mk("major", "LEGAL_STATUTE_NO_SECTION", "Statute referenced without Title and §section — citation is unverifiable.", "Use Bluebook format: `<title> U.S.C. § <section>` (e.g. `42 U.S.C. § 1983`). For regulations: `<title> C.F.R. § <section>`.")]
      : [],
  },

  // ── Contract drafting completeness ────────────────────────────────────────
  {
    id: "legal.contract-no-governing-law",
    domain: "domain",
    description: "Drafted contract / clause without governing-law clause.",
    appliesTo: c => /\b(contract|agreement|MOU|terms of service|TOS|EULA|NDA|MSA)\b/i.test(T(c)) && /\b(draft|write|generate|create|sample)\b/i.test(c.prompt),
    scan: c => /\b(this\s+agreement|the\s+parties|whereas|hereby\s+agree)\b/i.test(c.answer)
      && !/\b(governing\s+law|governed\s+by\s+the\s+laws?\s+of|venue|choice\s+of\s+law|jurisdiction)\b/i.test(c.answer)
      ? [mk("major", "LEGAL_CONTRACT_NO_GOVERNING_LAW", "Drafted contract lacks a governing-law / venue clause.", "Always include a governing-law clause (e.g. 'This Agreement shall be governed by the laws of [State], without regard to its conflict-of-laws principles.') and a forum-selection / venue clause.")]
      : [],
  },
  {
    id: "legal.contract-no-severability",
    domain: "domain",
    description: "Drafted contract without severability clause.",
    appliesTo: c => /\b(contract|agreement|MOU|terms|EULA|NDA|MSA)\b/i.test(T(c)) && /\b(draft|write|generate|create|sample)\b/i.test(c.prompt),
    scan: c => /\b(this\s+agreement|the\s+parties|whereas|hereby\s+agree)\b/i.test(c.answer)
      && !/\b(severability|severable|unenforceable[\s\S]{0,80}remaining\s+provisions)\b/i.test(c.answer)
      ? [mk("warning", "LEGAL_CONTRACT_NO_SEVERABILITY", "Drafted contract lacks a severability clause.", "Add a severability provision so that invalidation of one clause does not invalidate the entire agreement.")]
      : [],
  },

  // ── Privacy law confusion ─────────────────────────────────────────────────
  {
    id: "legal.gdpr-ccpa-conflation",
    domain: "domain",
    description: "GDPR and CCPA conflated as equivalent (they are not).",
    appliesTo: c => /\b(GDPR|CCPA|CPRA|privacy\s+law|data\s+protection)\b/i.test(T(c)),
    scan: c => /\b(GDPR\s+and\s+CCPA\s+(?:are|both)\s+(?:the\s+same|equivalent|similar)|like\s+GDPR,\s+CCPA|CCPA\s+is\s+the\s+(?:US|American)\s+GDPR)\b/i.test(c.answer)
      ? [mk("major", "LEGAL_GDPR_CCPA_CONFLATION", "GDPR and CCPA conflated as equivalent — they differ materially in scope, basis, and remedies.", "GDPR uses lawful-basis framework with broad data-subject rights; CCPA/CPRA is consumer-rights opt-out model with narrow scope. Differentiate explicitly: definitions of 'personal data', territorial scope, consent vs opt-out, fines, private rights of action.")]
      : [],
  },
  {
    id: "legal.privacy-no-dpia",
    domain: "domain",
    description: "GDPR high-risk processing without DPIA mention.",
    appliesTo: c => /\b(GDPR)\b/i.test(T(c)),
    scan: c => /\b(profil|automated decision|large[-\s]scale|systematic monitoring|special category|biometric|health data)\b/i.test(c.answer)
      && /\b(GDPR)\b/i.test(c.answer)
      && !/\b(DPIA|Data\s+Protection\s+Impact\s+Assessment|Article\s+35)\b/i.test(c.answer)
      ? [mk("warning", "LEGAL_GDPR_NO_DPIA", "GDPR high-risk processing discussed without Data Protection Impact Assessment (Article 35) requirement.", "Article 35 GDPR requires a DPIA for processing likely to result in a high risk (profiling, large-scale special-category data, systematic monitoring). Disclose this obligation.")]
      : [],
  },

  // ── Absolutes / overstatement ─────────────────────────────────────────────
  {
    id: "legal.absolute-rules",
    domain: "domain",
    description: "Absolute legal statements ('always', 'never') without exceptions.",
    appliesTo: isLegal,
    scan: c => /\b(always|never|in all cases|in every state|without exception)\b[\s\S]{0,80}\b(is\s+illegal|is\s+legal|is\s+required|is\s+prohibited|wins|loses)\b/i.test(c.answer)
      && !/\b(generally|typically|usually|in most|exception|except\s+for|caveat|varies)\b/i.test(c.answer)
      ? [mk("warning", "LEGAL_ABSOLUTE_RULES", "Absolute legal statement without acknowledging jurisdictional or factual exceptions.", "Hedge with 'generally', 'typically', or 'in most jurisdictions'. Legal rules almost always have exceptions, defenses, or jurisdictional carve-outs.")]
      : [],
  },

  // ── Statute of limitations precision ──────────────────────────────────────
  {
    id: "legal.sol-no-jurisdiction",
    domain: "domain",
    description: "Statute of limitations stated without naming jurisdiction.",
    appliesTo: c => /\b(statute of limitations|SOL|time[-\s]?bar|filing deadline)\b/i.test(T(c)),
    scan: c => /\bstatute\s+of\s+limitations\s+(?:is|of)\s+\d+\s+(?:year|month|day)\b/i.test(c.answer)
      && !/\b(under\s+(?:U\.S\.|federal|California|New York|Texas|Florida)\s+law|federal\s+statute|state\s+law|jurisdiction[-\s]?specific|varies\s+by)/i.test(c.answer)
      ? [mk("major", "LEGAL_SOL_NO_JURISDICTION", "Statute of limitations stated without naming the jurisdiction and cause of action.", "SOL varies by cause of action (personal injury, contract, fraud, etc.) AND by jurisdiction. Always specify both.")]
      : [],
  },
];
