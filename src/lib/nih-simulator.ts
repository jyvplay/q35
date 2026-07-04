/**
 * NIH Grant Reviewer Simulator (Additive Module)
 * Implements the Jan 2025 NIH Simplified Review Framework.
 */

export interface ReviewerPersona {
  id: string;
  name: string;
  focus: string;
  attackVector: string;
  defenseProtocol: string;
}

export const NIH_REVIEWERS: ReviewerPersona[] = [
  {
    id: "skeptical_methodologist",
    name: "The Skeptical Methodologist",
    focus: "Factor 2: Rigor & Feasibility",
    attackVector: "Confounding variables, lack of power analysis, improper handling of missing data, failure to account for Biological Variables (SABV).",
    defenseProtocol: "Every aim must have a dedicated 'Pitfalls, Alternatives, and Statistical Rigor' subsection. Sample sizes must reference a specific effect size justified by preliminary data.",
  },
  {
    id: "field_gatekeeper",
    name: "The Field Gatekeeper",
    focus: "Factor 1: Importance (Significance/Innovation)",
    attackVector: "'Incremental science.' Claims the work is an obvious next step rather than a paradigm shift.",
    defenseProtocol: "Force the 'Premise/Rigor of Prior Research' paragraph to explicitly pinpoint the flaw in current dogma. Use abductive reasoning to show how the hypothesis explains a documented anomaly.",
  },
  {
    id: "institutional_cynic",
    name: "The Institutional Cynic",
    focus: "Factor 3: Expertise & Resources",
    attackVector: "Assesses whether the grant matches the mechanism (R01 vs R03 vs R21 vs R15).",
    defenseProtocol: "If R15: generate a 'Student Involvement Plan' explicitly mapping student tasks to authorship. If R21: ensure preliminary data doesn't cross into 'already done' territory.",
  },
];

export function runNIHAdversarial(query: string, strategy: string) {
  void query;
  // Return simulated red-team critique based on mechanism detection
  const isR01 = strategy.includes("R01");
  const isR21 = strategy.includes("R21");
  
  return NIH_REVIEWERS.map(reviewer => {
    let specificAttack = reviewer.attackVector;
    if (isR01 && reviewer.id === "institutional_cynic") specificAttack = "Questioning if 3 synergistic aims are truly independent.";
    if (isR21 && reviewer.id === "skeptical_methodologist") specificAttack = "Critiquing the lack of preliminary data despite R21 rules.";
    
    return {
      persona: reviewer.name,
      factor: reviewer.focus,
      critique: specificAttack,
      remediation: reviewer.defenseProtocol,
    };
  });
}
