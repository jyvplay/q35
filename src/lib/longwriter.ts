/**
 * LongWriter — Decomposes ultra-long generation into subtasks.
 * Enables small-context models (e.g. 4k-8k) to produce coherent 10,000+ word papers.
 */

export interface LongWriterPlan {
  totalTargetWords: number;
  sections: Array<{
    id: string;
    title: string;
    targetWords: number;
    requiredPoints: string[];
    dependsOn: string[];
  }>;
}

export function generateLongWriterPlan(query: string, targetWords = 2000): LongWriterPlan {
  void query;
  // Deterministic section planner
  const sections = [
    {
      id: "intro",
      title: "Introduction & BLUF",
      targetWords: Math.round(targetWords * 0.15),
      requiredPoints: ["Problem definition", "Direct answer", "Impact magnitude"],
      dependsOn: [],
    },
    {
      id: "context",
      title: "Market / Field Context",
      targetWords: Math.round(targetWords * 0.20),
      requiredPoints: ["Prior state", "Disruptive complication"],
      dependsOn: ["intro"],
    },
    {
      id: "analysis",
      title: "Deep Diagnostic Analysis",
      targetWords: Math.round(targetWords * 0.35),
      requiredPoints: ["Evidence grounding", "Causal mechanism"],
      dependsOn: ["context"],
    },
    {
      id: "recommendation",
      title: "Strategic Recommendations",
      targetWords: Math.round(targetWords * 0.20),
      requiredPoints: ["Option set", "Implementation roadmap"],
      dependsOn: ["analysis"],
    },
    {
      id: "risk",
      title: "Risk & Falsification Matrix",
      targetWords: Math.round(targetWords * 0.10),
      requiredPoints: ["Top 3 risks", "What would reverse conclusion"],
      dependsOn: ["recommendation"],
    },
  ];

  return { totalTargetWords: targetWords, sections };
}

/**
 * Fragment-based generation protocol.
 * For each section, the controller provides:
 * 1. Global report capsule
 * 2. Section specific evidence
 * 3. Preceding section summary (virtual context)
 */
export function buildFragmentPrompt(
  section: LongWriterPlan["sections"][0],
  capsule: any,
  precedingSummary: string
) {
  return `DRAFTING SECTION: ${section.title}
TARGET: ${section.targetWords} words.
REQUIRED: ${section.requiredPoints.join(", ")}

REPORT CAPSULE:
${JSON.stringify(capsule)}

VIRTUAL CONTEXT (Preceding summary):
${precedingSummary}

Write the section prose directly. No preamble.`;
}
