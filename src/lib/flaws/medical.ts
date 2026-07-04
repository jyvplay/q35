/**
 * Medical Domain Pack v1
 *
 * Targets text-detectable failure modes in medical/clinical content:
 *   - HIPAA PHI Safe-Harbor identifier leakage (Aptible, AccountableHQ, MedGemma)
 *   - Drug dosing without indication / age / route
 *   - Drug-drug interactions without checked guardrail
 *   - Black-box warning omission
 *   - Off-label use without disclosure
 *   - Differential diagnosis without red-flag screen
 *   - Clinical advice without "consult a clinician" caveat
 *   - Imaging interpretation as definitive without radiologist sign-off
 *   - Pregnancy/lactation category absent for prescribing context
 *   - Pediatric dose extrapolated from adult mg, not mg/kg
 */
import { type FlawDetector, type FlawIssue, type ScanContext } from "../flaw-registry";

const mk = (
  severity: FlawIssue["severity"],
  code: string,
  message: string,
  remediation: string,
): FlawIssue => ({ severity, code, message, remediation });

function T(c: ScanContext): string { return `${c.prompt}\n${c.answer}`; }
function isMedical(c: ScanContext): boolean {
  return /\b(patient|clinic|diagnos|dosage|dose|mg|mcg|prescrib|symptom|treatment|medicat|drug|disease|disorder|syndrome|hospital|physician|nurse|EHR|EMR|ICD-10|CPT|HIPAA|PHI|MRN|medical record|chart note|SOAP note|differential|lab result|radiology|pathology|surgery|protocol|guideline)\b/i.test(T(c));
}
function isPrescriptive(c: ScanContext): boolean {
  return /\b(prescribe|administer|give|dose|dosage|recommend|protocol|regimen)\b/i.test(c.answer) && isMedical(c);
}
function isDiagnostic(c: ScanContext): boolean {
  return /\b(diagnos|differential|workup|rule[-\s]?out|likely cause|what is wrong|what could this be)\b/i.test(T(c));
}

export const MEDICAL_FLAWS: FlawDetector[] = [
  // ── HIPAA PHI Safe Harbor: structured identifier leakage ──────────────────
  {
    id: "med.phi-ssn-leak",
    domain: "domain",
    description: "HIPAA #19: Social Security Number pattern (XXX-XX-XXXX) in clinical content.",
    appliesTo: isMedical,
    scan: c => /\b\d{3}-\d{2}-\d{4}\b/.test(c.answer) && !/\b(example|fake|de-identified|synthetic)\b/i.test(c.answer)
      ? [mk("critical", "MED_PHI_SSN_LEAK", "Social Security Number pattern detected in medical/clinical content — HIPAA Safe-Harbor #19 violation.", "Remove or replace with `XXX-XX-XXXX` placeholder. SSN must never appear in PHI unless de-identified per HIPAA Safe Harbor.")]
      : [],
  },
  {
    id: "med.phi-mrn-leak",
    domain: "domain",
    description: "HIPAA #6: Medical Record Number leakage.",
    appliesTo: isMedical,
    scan: c => /\b(?:MRN|Medical\s+Record\s+(?:Number|#)?)[\s:#]*[A-Z]?\d{6,}\b/i.test(c.answer) && !/\b(example|sample|de-identified|fake|synthetic|test patient)\b/i.test(c.answer)
      ? [mk("critical", "MED_PHI_MRN_LEAK", "Medical Record Number leaked in clinical content (HIPAA #6).", "De-identify MRN per HIPAA Safe Harbor. Use surrogate IDs for examples; never include real MRNs in shared content.")]
      : [],
  },
  {
    id: "med.phi-dob-leak",
    domain: "domain",
    description: "HIPAA #3: Date of Birth leakage (full date, not just year).",
    appliesTo: isMedical,
    scan: c => /\b(?:DOB|Date\s+of\s+Birth|born\s+on)[\s:]*(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-]\d{4}\b/i.test(c.answer) && !/\b(example|sample|de-identified|fake)\b/i.test(c.answer)
      ? [mk("critical", "MED_PHI_DOB_LEAK", "Full Date of Birth detected (HIPAA Safe Harbor #3 — only year may remain).", "Replace DOB with year only, or aggregate ages 90+ per HIPAA Safe Harbor.")]
      : [],
  },
  {
    id: "med.phi-phone-leak",
    domain: "domain",
    description: "HIPAA #5: Phone number leakage in clinical content.",
    appliesTo: isMedical,
    scan: c => /\b(?:patient|home|cell|mobile)\s+(?:phone|number|tel)[\s:#]*(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/i.test(c.answer) && !/\b(example|sample|fake|de-identified)\b/i.test(c.answer)
      ? [mk("major", "MED_PHI_PHONE_LEAK", "Patient phone number detected (HIPAA #5).", "Remove or replace with placeholder. Phone numbers are Safe-Harbor identifiers.")]
      : [],
  },

  // ── Clinical safety: dosing context ───────────────────────────────────────
  {
    id: "med.dose-no-weight-pediatric",
    domain: "domain",
    description: "Adult-style mg dose for a pediatric patient instead of weight-based mg/kg.",
    appliesTo: isPrescriptive,
    scan: c => /\b(child|pediatric|infant|neonate|toddler|kid|baby|<\s*12\s*y(?:r|ear)?|aged?\s+\d+\s*(?:month|year))/i.test(T(c))
      && /\b\d+\s*(?:mg|mcg|µg|g)\b/i.test(c.answer)
      && !/\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg)\s*\/\s*kg\b/i.test(c.answer)
      ? [mk("critical", "MED_DOSE_NO_PEDIATRIC_WEIGHT", "Pediatric dose given as flat mg without weight-based mg/kg calculation.", "Always express pediatric dosing as mg/kg (or mg/m²) with a stated max-dose ceiling. Flat adult-style dosing in pediatrics risks overdose or therapeutic failure.")]
      : [],
  },
  {
    id: "med.dose-no-route",
    domain: "domain",
    description: "Drug dose without route of administration (PO/IV/IM/SC).",
    appliesTo: isPrescriptive,
    scan: c => /\b\d+\s*(?:mg|mcg|µg|g|mL|units?)\b[\s\S]{0,40}\b(?:every|q\s*\d|daily|BID|TID|QID|once|twice)\b/i.test(c.answer)
      && !/\b(PO|IV|IM|SC|SubQ|sublingual|SL|intranasal|topical|rectal|PR|inhaled|nebuli[sz]ed|by\s+mouth|orally|intravenous|intramuscular|subcutaneous)\b/i.test(c.answer)
      ? [mk("major", "MED_DOSE_NO_ROUTE", "Drug dose and frequency given without an explicit route of administration.", "Always specify route (PO, IV, IM, SC, SL, etc.). Same dose by different routes has different bioavailability and onset.")]
      : [],
  },
  {
    id: "med.opioid-no-naloxone",
    domain: "domain",
    description: "Opioid prescription without naloxone co-prescription per CDC guidance.",
    appliesTo: isPrescriptive,
    scan: c => /\b(oxycodone|hydrocodone|morphine|fentanyl|methadone|hydromorphone|oxymorphone|tramadol|codeine)\b/i.test(c.answer)
      && /\b(prescribe|prescription|Rx|outpatient|discharge|home with)\b/i.test(c.answer)
      && !/\b(naloxone|Narcan|overdose education|risk mitigation)\b/i.test(c.answer)
      ? [mk("major", "MED_OPIOID_NO_NALOXONE", "Outpatient opioid prescription without naloxone co-prescription / overdose-risk discussion.", "Per CDC 2022 Clinical Practice Guideline: co-prescribe naloxone for any patient receiving opioids, especially with concurrent benzodiazepines, sleep apnea, or substance use history.")]
      : [],
  },
  {
    id: "med.ddi-warfarin",
    domain: "domain",
    description: "Warfarin co-prescribed with NSAID/antibiotic without INR monitoring caveat.",
    appliesTo: isPrescriptive,
    scan: c => /\b(warfarin|coumadin)\b/i.test(c.answer)
      && /\b(NSAID|ibuprofen|naproxen|aspirin|metronidazole|fluconazole|TMP[-\s]?SMX|trimethoprim|ciprofloxacin|amiodarone)\b/i.test(c.answer)
      && !/\b(INR\s+(?:monitor|check|recheck)|bleeding risk|dose\s+adjust)\b/i.test(c.answer)
      ? [mk("critical", "MED_DDI_WARFARIN", "Known major warfarin drug-drug interaction without INR monitoring/dose-adjustment plan.", "Document INR monitoring frequency and dose-adjustment plan; consider therapeutic alternative. Warfarin interactions with NSAIDs, fluconazole, metronidazole, TMP-SMX, and amiodarone are clinically significant.")]
      : [],
  },
  {
    id: "med.pregnancy-category-missing",
    domain: "domain",
    description: "Prescribing a drug to a pregnant patient without pregnancy-risk discussion.",
    appliesTo: isPrescriptive,
    scan: c => /\b(pregnan|gravid|prenatal|breastfeed|lactat)\b/i.test(T(c))
      && /\b(prescribe|administer|start|initiate)\b/i.test(c.answer)
      && !/\b(category\s+[ABCDX]|FDA\s+pregnancy|teratogen|fetal\s+risk|PLLR|risk[-\s]benefit)\b/i.test(c.answer)
      ? [mk("major", "MED_PREGNANCY_CATEGORY_MISSING", "Prescribing in pregnancy/lactation context without explicit fetal/neonatal risk discussion.", "State FDA Pregnancy and Lactation Labeling Rule (PLLR) section or pre-2015 category; discuss known teratogenicity, lactation transfer, and risk-benefit explicitly.")]
      : [],
  },

  // ── Diagnostic safety ─────────────────────────────────────────────────────
  {
    id: "med.diagnostic-no-red-flag",
    domain: "domain",
    description: "Common-presentation differential without red-flag/cant-miss screen.",
    appliesTo: isDiagnostic,
    scan: c => /\b(chest\s+pain|headache|abdominal\s+pain|back\s+pain|dyspnea|syncope|fever|altered mental status)\b/i.test(T(c))
      && /\b(likely|most likely|probably|likely diagnosis|most common cause)\b/i.test(c.answer)
      && !/\b(red\s+flags?|cannot\s+miss|emergent|life[-\s]?threatening|rule\s+out|ED evaluation|STEMI|PE|SAH|AAA|meningitis|sepsis)\b/i.test(c.answer)
      ? [mk("critical", "MED_DIAGNOSTIC_NO_RED_FLAG", "Differential for a high-risk chief complaint without explicit red-flag / cant-miss diagnoses.", "For high-risk presentations (chest pain, headache, abdominal pain, syncope), always enumerate emergent must-not-miss diagnoses first (STEMI, PE, SAH, AAA, meningitis, sepsis) with disposition guidance.")]
      : [],
  },
  {
    id: "med.imaging-as-definitive",
    domain: "domain",
    description: "Imaging interpretation given as definitive without radiologist sign-off caveat.",
    appliesTo: c => /\b(CT|MRI|X-ray|ultrasound|imaging|scan|radiograph|chest\s+film)\b/i.test(T(c)) && isMedical(c),
    scan: c => /\b(shows|demonstrates|reveals|confirms)\b[\s\S]{0,80}\b(fracture|mass|tumor|lesion|effusion|infarct|hemorrhage)\b/i.test(c.answer)
      && !/\b(radiologist|formal read|preliminary|wet read|requires\s+formal|pending\s+(?:formal|official)|consult\s+(?:radiology|imaging))\b/i.test(c.answer)
      ? [mk("major", "MED_IMAGING_AS_DEFINITIVE", "Imaging interpretation stated as definitive without radiologist confirmation caveat.", "Always defer to formal radiologist interpretation. Preliminary reads (especially from non-radiologists) require explicit caveat and follow-up.")]
      : [],
  },

  // ── Clinical advice scope ─────────────────────────────────────────────────
  {
    id: "med.advice-no-clinician-caveat",
    domain: "domain",
    description: "Direct clinical advice to a layperson without 'consult a clinician' guidance.",
    appliesTo: c => isMedical(c) && !/\b(physician|nurse|clinician|provider|EHR|hospital|chart note|SOAP|protocol|guideline)\b/i.test(c.prompt),
    scan: c => /\b(you should take|you should stop|increase your dose|reduce your dose|you have|you probably have|you most likely have)\b/i.test(c.answer)
      && !/\b(consult\s+(?:your\s+)?(?:doctor|physician|clinician|provider)|seek\s+medical\s+(?:care|attention)|see\s+a\s+(?:doctor|physician|clinician)|not\s+a\s+substitute\s+for|medical\s+professional)\b/i.test(c.answer)
      ? [mk("major", "MED_ADVICE_NO_CLINICIAN_CAVEAT", "Direct clinical instruction to a layperson without 'consult a clinician' / not-medical-advice caveat.", "Add: 'This is not medical advice. Consult a licensed healthcare provider before changing medications or treatment.' Required for safety and liability.")]
      : [],
  },
  {
    id: "med.off-label-undisclosed",
    domain: "domain",
    description: "Off-label use of a drug recommended without disclosure of off-label status.",
    appliesTo: isPrescriptive,
    scan: c => /\b(gabapentin\s+for\s+(?:anxiety|sleep)|propranolol\s+for\s+anxiety|amitriptyline\s+for\s+(?:migraine|pain|sleep)|ketamine\s+for\s+depression|trazodone\s+for\s+sleep|mirtazapine\s+for\s+appetite|hydroxyzine\s+for\s+anxiety)\b/i.test(c.answer)
      && !/\b(off[-\s]?label|not\s+FDA[-\s]?approved\s+for|outside\s+(?:the\s+)?approved\s+indication)\b/i.test(c.answer)
      ? [mk("warning", "MED_OFF_LABEL_UNDISCLOSED", "Off-label drug use recommended without disclosing off-label status.", "Disclose off-label status; cite evidence base; document informed-consent considerations.")]
      : [],
  },

  // ── Misinformation / known anti-patterns ──────────────────────────────────
  {
    id: "med.antibiotic-viral",
    domain: "domain",
    description: "Antibiotics recommended for a clearly viral illness.",
    appliesTo: isPrescriptive,
    scan: c => /\b(common\s+cold|viral\s+URI|viral\s+pharyngitis|viral\s+gastroenteritis|influenza|bronchiolitis|RSV|COVID[-\s]?19|rhinovirus)\b/i.test(T(c))
      && /\b(amoxicillin|azithromycin|cephalexin|doxycycline|ciprofloxacin|prescribe\s+antibiotic|start\s+antibiotic)\b/i.test(c.answer)
      && !/\b(bacterial\s+superinfection|secondary\s+bacterial|not\s+routinely|antibiotic\s+steward)\b/i.test(c.answer)
      ? [mk("critical", "MED_ANTIBIOTIC_VIRAL", "Antibiotics recommended for an explicitly viral illness — contributes to resistance and side-effect burden.", "Per antibiotic stewardship: viral URIs, viral pharyngitis, bronchiolitis do not require antibiotics. Reserve for confirmed/suspected bacterial superinfection.")]
      : [],
  },
];
