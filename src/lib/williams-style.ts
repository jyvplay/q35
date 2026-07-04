/**
 * Williams Style Persona System
 * ─────────────────────────────
 * A randomized-deterministic system encoding EVERY concept from Joseph M.
 * Williams' "Style: Toward Clarity and Grace" (University of Chicago Press).
 *
 * Williams' framework does not prescribe one correct style. It describes
 * DIMENSIONS along which clear prose can legitimately vary. A writer who
 * favors periodic sentences over cumulative ones, or who uses more
 * metadiscourse, or who strategically employs nominalizations for
 * abstraction — these are all valid choices under the framework, as long
 * as the writer makes them consciously and for the reader's benefit.
 *
 * This system uses a seeded PRNG to set each dimension, producing a
 * unique but reproducible stylistic persona. Every persona is valid
 * under Williams' principles. The seed changes per session so the
 * voice is never static.
 *
 * Concepts encoded (by lesson):
 *
 *   L1  Understanding Style — style as conscious choice, not accident
 *   L2  Correctness — real rules vs. folklore; register awareness
 *   L3  Actions — verbs for actions vs. nominalizations
 *   L4  Characters — agents as grammatical subjects
 *   L5  Cohesion & Coherence — topic strings, thematic strings,
 *       old-before-new information flow
 *   L6  Emphasis — stress position, periodic vs. cumulative sentences,
 *       short-to-long sequencing
 *   L7  Concision — cutting meaningless words, redundant pairs, empty
 *       metadiscourse, wordy phrases
 *   L8  Shape — coordination, subordination, balance, symmetry,
 *       climactic ordering, managing sentence length
 *   L9  Elegance — balance, climax, extended metaphor, artful
 *       disruption, length variation
 *   L10 Motivating Coherence — introductions, point sentences,
 *       issue-discussion-conclusion, conclusions
 *   L11 Global Coherence — paragraph structure, section transitions,
 *       thematic unity across the whole
 *   L12 Ethics of Style — clarity vs. obscurantism, manipulative
 *       complexity, honest framing, reader respect
 */

// ─── Seeded PRNG (Mulberry32) ──────────────────────────────────────
// Deterministic: same seed → same persona. Different seed → different
// persona. The seed is the single source of variation.

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a float in [lo, hi] from the PRNG. */
function randRange(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Pick one item from an array. */
export function randPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Williams Dimension Schema ─────────────────────────────────────
// Each dimension is a continuous [0,1] parameter. Low and high ends
// are BOTH valid under Williams — they represent different conscious
// choices a skilled writer might make.

export interface WilliamsDimensions {
  // L3: Actions — how strongly the persona favors verbs over nominalizations.
  //   0.0 = permits strategic nominalizations for abstraction and formality
  //   1.0 = aggressively converts every nominalization back to its verb
  actionVerbs: number;

  // L4: Characters — how strongly characters appear as grammatical subjects.
  //   0.0 = permits abstract/institutional subjects ("The analysis showed…")
  //   1.0 = insists on human agents as subjects ("We found…", "Researchers showed…")
  characterSubjects: number;

  // L5a: Topic strings — consistency of sentence-opening subjects.
  //   0.0 = varied openings (more dynamic, less predictable)
  //   1.0 = highly consistent topic strings (same subject family per paragraph)
  topicStringConsistency: number;

  // L5b: Old-before-new — how strictly old information precedes new.
  //   0.0 = sometimes leads with new information for surprise or emphasis
  //   1.0 = rigorous old-to-new flow in every sentence
  oldBeforeNew: number;

  // L5c: Thematic strings — how tightly thematic vocabulary recurs.
  //   0.0 = uses varied synonyms and paraphrases freely
  //   1.0 = repeats key thematic terms for maximum cohesion
  thematicStringDensity: number;

  // L6a: Stress position — how consistently the most important info
  //   lands at the end of the sentence (the "stress position").
  //   0.0 = distributes emphasis; sometimes front-loads key info
  //   1.0 = always saves the punch for the final phrase
  stressPosition: number;

  // L6b: Periodic vs. cumulative sentence structure.
  //   0.0 = cumulative (main clause first, then modifiers — right-branching)
  //   1.0 = periodic (modifiers first, main clause delayed — left-branching)
  periodicStructure: number;

  // L6c: Short-to-long sequencing within sentences and lists.
  //   0.0 = no particular length ordering
  //   1.0 = strict short-to-long climactic build
  shortToLong: number;

  // L7: Concision — how aggressively the persona trims.
  //   0.0 = expansive, discursive, allows breathing room
  //   1.0 = compressed, every word load-bearing, no redundancy
  concision: number;

  // L8a: Coordination and balance — use of parallel structures.
  //   0.0 = asymmetric, subordinating, complex nesting
  //   1.0 = balanced, symmetric, parallel coordinate structures
  coordinationBalance: number;

  // L8b: Sentence length management.
  //   0.0 = tends toward short, punchy sentences
  //   1.0 = tends toward long, flowing compound-complex sentences
  sentenceLength: number;

  // L9a: Elegance devices — metaphor, artful disruption, rhetorical
  //   balance, chiasmus, anaphora, isocolon.
  //   0.0 = plain, functional, no ornament
  //   1.0 = deliberately elegant, uses rhetorical figures
  eleganceDevices: number;

  // L9b: Length variation — how much sentence length varies.
  //   0.0 = uniform sentence lengths (metronomic)
  //   1.0 = dramatic variation (short punches mixed with long builds)
  lengthVariation: number;

  // L2: Register / formality.
  //   0.0 = conversational, contractions, first person
  //   1.0 = formal academic, no contractions, third person
  formality: number;

  // L7 sub: Metadiscourse level — hedging, signposting, framing.
  //   0.0 = minimal metadiscourse ("I will now discuss…" absent)
  //   1.0 = explicit transitions and signposting throughout
  metadiscourse: number;

  // L2/L3: Passive voice rate — strategic use.
  //   0.0 = almost always active voice
  //   1.0 = strategic passive for topic continuity and de-emphasis
  passiveVoice: number;

  // L10: Motivating coherence — intro/conclusion structure.
  //   0.0 = dives straight in, minimal framing
  //   1.0 = full issue → discussion → point structure with intro/conclusion
  motivatingCoherence: number;

  // L11: Global coherence — section-level thematic unity.
  //   0.0 = loose, exploratory, associative structure
  //   1.0 = tight, hierarchical, each section tightly scoped
  globalCoherence: number;

  // L12: Ethical transparency — honest framing vs. persuasive framing.
  //   0.0 = permits persuasive emphasis, strategic word choice
  //   1.0 = maximally transparent, surfaces all uncertainty and caveats
  ethicalTransparency: number;
}

// ─── Persona archetype names ───────────────────────────────────────
// These are memorable labels for the reader. The actual dimensions
// are set by the seed, not the name — the name is the closest
// archetype match after the dimensions are generated.

const ARCHETYPES = [
  // ── Common (≈40% combined) ──────────────────────────────────────
  { name: "The Plain Dealer", desc: "Direct, compressed, agent-driven. Every sentence earns its place.", rarity: 12, tier: "Common" },
  { name: "The Architect", desc: "Precise parallel structures, balanced coordination, climactic ordering.", rarity: 10, tier: "Common" },
  { name: "The Narrator", desc: "Characters as subjects, old-to-new flow, story-like cohesion.", rarity: 10, tier: "Common" },
  { name: "The Explainer", desc: "Strict topic strings, heavy signposting, maximally transparent.", rarity: 8, tier: "Common" },
  // ── Uncommon (≈30% combined) ────────────────────────────────────
  { name: "The Scholar", desc: "Formal register, strategic nominalizations, explicit metadiscourse.", rarity: 7, tier: "Uncommon" },
  { name: "The Surgeon", desc: "Extreme concision, short sentences, no ornament.", rarity: 6, tier: "Uncommon" },
  { name: "The Advocate", desc: "Stress-position mastery, persuasive emphasis, climactic cadence.", rarity: 6, tier: "Uncommon" },
  { name: "The Diagnostician", desc: "Issue-discussion-point structure, ethical transparency, balanced evidence.", rarity: 6, tier: "Uncommon" },
  { name: "The Conversationalist", desc: "Informal register, first person, contractions, varied openings.", rarity: 5, tier: "Uncommon" },
  // ── Rare (≈18% combined) ────────────────────────────────────────
  { name: "The Essayist", desc: "Elegant variation, periodic builds, artful disruption.", rarity: 5, tier: "Rare" },
  { name: "The Weaver", desc: "Long flowing sentences, subordination, thematic density.", rarity: 4, tier: "Rare" },
  { name: "The Minimalist", desc: "Cumulative sentences, uniform rhythm, minimal metadiscourse.", rarity: 4, tier: "Rare" },
  { name: "The Cartographer", desc: "Maps complex domains via precise spatial metaphors and structural clarity.", rarity: 3, tier: "Rare" },
  { name: "The Dialectician", desc: "Thesis-antithesis-synthesis. Surfaces tension before resolving it.", rarity: 2, tier: "Rare" },
  // ── Epic (≈8% combined) ─────────────────────────────────────────
  { name: "The Crystallographer", desc: "Faceted precision. Each paragraph is a cut gem — dense, refractive, complete.", rarity: 2, tier: "Epic" },
  { name: "The Counselor", desc: "Warm ethical transparency, compassionate directness, reader-as-partner.", rarity: 2, tier: "Epic" },
  { name: "The Polymath", desc: "Cross-domain analogies, structural elegance, high register with accessibility.", rarity: 1.5, tier: "Epic" },
  { name: "The Sentinel", desc: "Watchful, cautious, surfaces every uncertainty and caveat before proceeding.", rarity: 1.5, tier: "Epic" },
  // ── Legendary (≈4% combined) ────────────────────────────────────
  { name: "The Oracle", desc: "Periodic mastery, delayed revelation, every clause builds to the decisive final phrase.", rarity: 1, tier: "Legendary" },
  { name: "The Alchemist", desc: "Transforms complex jargon into vivid, accessible insight without losing rigor.", rarity: 1, tier: "Legendary" },
  { name: "The Strategist", desc: "Military-grade concision. Situation-mission-execution-assessment. Zero wasted words.", rarity: 0.8, tier: "Legendary" },
  { name: "The Philosopher", desc: "First-principles reasoning, Socratic structure, elegant abstraction.", rarity: 0.7, tier: "Legendary" },
  { name: "The Provocateur", desc: "Opens with the conclusion that challenges the reader, then proves it irrefutably.", rarity: 0.5, tier: "Legendary" },
] as const;

function closestArchetype(d: WilliamsDimensions): typeof ARCHETYPES[number] {
  // Simple heuristic matching based on dominant dimensions.
  const scores = ARCHETYPES.map((a) => {
    let s = 0;
    if (a.name === "The Plain Dealer") s = d.concision + d.actionVerbs + (1 - d.eleganceDevices);
    else if (a.name === "The Architect") s = d.coordinationBalance + d.shortToLong + d.globalCoherence;
    else if (a.name === "The Narrator") s = d.characterSubjects + d.oldBeforeNew + d.topicStringConsistency;
    else if (a.name === "The Essayist") s = d.eleganceDevices + d.periodicStructure + d.lengthVariation;
    else if (a.name === "The Scholar") s = d.formality + (1 - d.actionVerbs) + d.metadiscourse;
    else if (a.name === "The Explainer") s = d.topicStringConsistency + d.metadiscourse + d.ethicalTransparency;
    else if (a.name === "The Surgeon") s = d.concision + (1 - d.sentenceLength) + (1 - d.eleganceDevices);
    else if (a.name === "The Advocate") s = d.stressPosition + d.shortToLong + (1 - d.ethicalTransparency) * 0.5;
    else if (a.name === "The Conversationalist") s = (1 - d.formality) + (1 - d.topicStringConsistency) + d.lengthVariation;
    else if (a.name === "The Weaver") s = d.sentenceLength + (1 - d.concision) + d.thematicStringDensity;
    else if (a.name === "The Diagnostician") s = d.motivatingCoherence + d.ethicalTransparency + d.coordinationBalance;
    else if (a.name === "The Minimalist") s = (1 - d.periodicStructure) + (1 - d.lengthVariation) + (1 - d.metadiscourse);
    return { archetype: a, score: s };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0].archetype;
}

// ─── Persona generation ────────────────────────────────────────────

export interface WilliamsPersona {
  seed: number;
  dimensions: WilliamsDimensions;
  archetype: typeof ARCHETYPES[number];
  systemPromptFragment: string;
  dimensionLabels: Array<{ name: string; lesson: string; value: number; lowLabel: string; highLabel: string }>;
  /** Approximate % chance of rolling this archetype. */
  rarityPercent: number;
  /** Rarity tier label (Common / Uncommon / Rare / Epic / Legendary). */
  rarityTier: string;
}

export function generatePersona(seed: number): WilliamsPersona {
  const rng = mulberry32(seed);

  const dimensions: WilliamsDimensions = {
    actionVerbs:            randRange(rng, 0.25, 0.95),
    characterSubjects:      randRange(rng, 0.15, 0.90),
    topicStringConsistency: randRange(rng, 0.20, 0.90),
    oldBeforeNew:           randRange(rng, 0.35, 0.95),
    thematicStringDensity:  randRange(rng, 0.20, 0.85),
    stressPosition:         randRange(rng, 0.30, 0.95),
    periodicStructure:      randRange(rng, 0.10, 0.80),
    shortToLong:            randRange(rng, 0.15, 0.85),
    concision:              randRange(rng, 0.25, 0.95),
    coordinationBalance:    randRange(rng, 0.20, 0.90),
    sentenceLength:         randRange(rng, 0.15, 0.85),
    eleganceDevices:        randRange(rng, 0.05, 0.80),
    lengthVariation:        randRange(rng, 0.15, 0.90),
    formality:              randRange(rng, 0.10, 0.90),
    metadiscourse:          randRange(rng, 0.10, 0.80),
    passiveVoice:           randRange(rng, 0.05, 0.55),
    motivatingCoherence:    randRange(rng, 0.25, 0.90),
    globalCoherence:        randRange(rng, 0.30, 0.95),
    ethicalTransparency:    randRange(rng, 0.40, 0.95),
  };

  const archetype = closestArchetype(dimensions);

  const dimensionLabels = [
    { name: "Action verbs",           lesson: "L3 Actions",             value: dimensions.actionVerbs,            lowLabel: "strategic nominalizations", highLabel: "strong verbs always" },
    { name: "Character subjects",     lesson: "L4 Characters",          value: dimensions.characterSubjects,      lowLabel: "abstract subjects",         highLabel: "human agents as subjects" },
    { name: "Topic string consistency",lesson: "L5 Cohesion",           value: dimensions.topicStringConsistency,  lowLabel: "varied openings",           highLabel: "consistent topic strings" },
    { name: "Old-before-new",         lesson: "L5 Cohesion",            value: dimensions.oldBeforeNew,           lowLabel: "new-first for surprise",    highLabel: "strict old→new flow" },
    { name: "Thematic string density",lesson: "L5 Coherence",           value: dimensions.thematicStringDensity,   lowLabel: "synonymic variety",         highLabel: "key term repetition" },
    { name: "Stress position",        lesson: "L6 Emphasis",            value: dimensions.stressPosition,         lowLabel: "distributed emphasis",      highLabel: "punch at sentence end" },
    { name: "Periodic structure",     lesson: "L6 Emphasis",            value: dimensions.periodicStructure,      lowLabel: "cumulative (main first)",   highLabel: "periodic (delay main)" },
    { name: "Short-to-long",          lesson: "L6 Emphasis",            value: dimensions.shortToLong,            lowLabel: "no length ordering",        highLabel: "climactic build" },
    { name: "Concision",              lesson: "L7 Concision",           value: dimensions.concision,              lowLabel: "expansive, discursive",     highLabel: "every word load-bearing" },
    { name: "Coordination balance",   lesson: "L8 Shape",              value: dimensions.coordinationBalance,    lowLabel: "asymmetric subordination",  highLabel: "parallel balance" },
    { name: "Sentence length",        lesson: "L8 Shape",              value: dimensions.sentenceLength,         lowLabel: "short punchy sentences",    highLabel: "long flowing sentences" },
    { name: "Elegance devices",       lesson: "L9 Elegance",           value: dimensions.eleganceDevices,        lowLabel: "plain functional prose",    highLabel: "metaphor, chiasmus, anaphora" },
    { name: "Length variation",        lesson: "L9 Elegance",           value: dimensions.lengthVariation,        lowLabel: "uniform rhythm",            highLabel: "dramatic variation" },
    { name: "Formality",              lesson: "L2 Correctness",        value: dimensions.formality,              lowLabel: "conversational, contractions", highLabel: "formal academic register" },
    { name: "Metadiscourse",          lesson: "L7 Concision",          value: dimensions.metadiscourse,          lowLabel: "minimal signposting",       highLabel: "explicit transitions" },
    { name: "Passive voice",          lesson: "L3/L4 Actions+Characters",value: dimensions.passiveVoice,         lowLabel: "always active voice",       highLabel: "strategic passive" },
    { name: "Motivating coherence",   lesson: "L10 Motivating Coherence",value: dimensions.motivatingCoherence,  lowLabel: "dives straight in",         highLabel: "full issue→discussion→point" },
    { name: "Global coherence",       lesson: "L11 Global Coherence",  value: dimensions.globalCoherence,        lowLabel: "loose, exploratory",        highLabel: "tight hierarchical sections" },
    { name: "Ethical transparency",   lesson: "L12 Ethics of Style",   value: dimensions.ethicalTransparency,    lowLabel: "persuasive emphasis",       highLabel: "maximally transparent" },
  ];

  const systemPromptFragment = buildPromptFragment(dimensions, archetype);

  const totalWeight = ARCHETYPES.reduce((sum, a) => sum + a.rarity, 0);
  const rarityPercent = Math.round((archetype.rarity / totalWeight) * 1000) / 10;
  const rarityTier = archetype.tier;

  return { seed, dimensions, archetype, systemPromptFragment, dimensionLabels, rarityPercent, rarityTier };
}

// ─── Prompt fragment builder ───────────────────────────────────────
// Translates continuous dimension values into concrete prose instructions.

function describeLevel(val: number): "rarely" | "sometimes" | "often" | "consistently" {
  if (val < 0.3) return "rarely";
  if (val < 0.55) return "sometimes";
  if (val < 0.75) return "often";
  return "consistently";
}

function buildPromptFragment(d: WilliamsDimensions, arch: typeof ARCHETYPES[number]): string {
  const lines: string[] = [];

  lines.push(`STYLE PERSONA: "${arch.name}" — ${arch.desc}`);
  lines.push("");
  lines.push("Adopt the following stylistic profile. These are DIMENSIONS of clear prose under Joseph Williams' framework — all positions are valid conscious choices.");
  lines.push("");

  // L3: Actions
  if (d.actionVerbs > 0.65) {
    lines.push("ACTIONS (L3): Use strong, specific verbs for all actions. Convert nominalizations back to their verbs. Write 'We analyzed' not 'We performed an analysis of.' Write 'The temperature rose' not 'There was a rise in temperature.'");
  } else if (d.actionVerbs > 0.4) {
    lines.push("ACTIONS (L3): Prefer verbs for actions but permit nominalizations when they serve as familiar shorthand or refer to a concept already introduced. 'The analysis showed' is fine if 'analysis' was established earlier.");
  } else {
    lines.push("ACTIONS (L3): Use nominalizations strategically for abstraction, formality, and conceptual reference. 'The investigation of the phenomenon' is appropriate when discussing it as an object of study.");
  }

  // L4: Characters
  if (d.characterSubjects > 0.65) {
    lines.push("CHARACTERS (L4): Make the characters — the agents doing things — the grammatical subjects of sentences. Prefer 'Researchers found' over 'It was found.' Put people and named entities in the subject position.");
  } else if (d.characterSubjects > 0.4) {
    lines.push("CHARACTERS (L4): Use a mix of human agents and abstract subjects. Institutional subjects are fine ('The study examined…') but avoid long chains of sentences where no human agent ever appears.");
  } else {
    lines.push("CHARACTERS (L4): Permit abstract and institutional subjects when the topic is a process, system, or concept rather than a person. 'The framework enables…' or 'This approach yields…' are natural.");
  }

  // L5: Cohesion and Coherence
  if (d.topicStringConsistency > 0.65) {
    lines.push("COHESION (L5): Maintain consistent topic strings — begin most sentences in a paragraph with the same subject or a closely related one. This creates a strong thematic thread the reader can follow.");
  } else {
    lines.push("COHESION (L5): Vary sentence openings. While some consistency helps, shift subjects to show different facets of the topic.");
  }

  if (d.oldBeforeNew > 0.65) {
    lines.push("INFORMATION FLOW (L5): " + describeLevel(d.oldBeforeNew) + " place familiar (old) information at the beginning of each sentence and save new, complex, or surprising information for the end.");
  }

  if (d.thematicStringDensity > 0.6) {
    lines.push("THEMATIC STRINGS (L5): Repeat key thematic terms rather than substituting synonyms. Repetition aids coherence more than elegant variation.");
  } else {
    lines.push("THEMATIC STRINGS (L5): Use varied vocabulary — synonyms, near-synonyms, and paraphrases — to avoid monotony while maintaining coherence through context.");
  }

  // L6: Emphasis
  if (d.stressPosition > 0.65) {
    lines.push("STRESS POSITION (L6): " + describeLevel(d.stressPosition) + " place the most important, complex, or newest information at the END of the sentence — the stress position. The final words carry the most weight.");
  }

  if (d.periodicStructure > 0.55) {
    lines.push("PERIODIC SENTENCES (L6): Build toward the main clause. Open with subordinate clauses, conditions, or modifiers, and delay the main point for emphasis: 'Although X, and despite Y, the result was Z.'");
  } else {
    lines.push("CUMULATIVE SENTENCES (L6): Lead with the main clause, then add modifiers and qualifications: 'The result was Z, although X, and despite Y.' This is more direct and easier to process.");
  }

  if (d.shortToLong > 0.6) {
    lines.push("CLIMACTIC ORDERING (L6): In lists and coordinate structures, arrange items from shortest to longest. Build toward the most complex or important item.");
  }

  // L7: Concision
  if (d.concision > 0.7) {
    lines.push("CONCISION (L7): Be tightly compressed. Cut meaningless words (kind of, basically, actually, generally). Eliminate redundant pairs (each and every, first and foremost). Replace wordy phrases with single words ('due to the fact that' → 'because'). Every word must earn its place.");
  } else if (d.concision > 0.45) {
    lines.push("CONCISION (L7): Be reasonably concise. Cut obvious padding but allow some discursive space for the reader to absorb complex ideas. Not every sentence needs to be minimal.");
  } else {
    lines.push("CONCISION (L7): Allow an expansive, unhurried pace. Use qualifying phrases and elaborations to let the reader ease into difficult material. Compression is not always clarity.");
  }

  // L7 sub: Metadiscourse
  if (d.metadiscourse > 0.55) {
    lines.push("METADISCOURSE (L7): Use explicit transitions and signposting ('First,' 'In contrast,' 'The key point is'). Guide the reader through the structure of the argument.");
  } else {
    lines.push("METADISCOURSE (L7): Minimize overt signposting. Let the logical structure speak through the arrangement of ideas rather than explicit labels.");
  }

  // L8: Shape
  if (d.coordinationBalance > 0.6) {
    lines.push("SHAPE (L8): Favor balanced, parallel coordinate structures. When listing or comparing, use grammatically parallel forms: 'not only X but also Y,' 'both A and B.' Symmetry creates clarity.");
  } else {
    lines.push("SHAPE (L8): Use subordination and nesting. Let some ideas be syntactically subordinate to others, reflecting their logical subordination. Complex ideas sometimes need complex structures.");
  }

  if (d.sentenceLength > 0.65) {
    lines.push("SENTENCE LENGTH (L8): Favor longer, compound-complex sentences that develop ideas fully within a single syntactic structure. Connect related ideas with semicolons, colons, and subordinating conjunctions.");
  } else if (d.sentenceLength < 0.35) {
    lines.push("SENTENCE LENGTH (L8): Favor short, direct sentences. Break complex ideas into separate sentences. A sentence should do one thing clearly.");
  }

  // L9: Elegance
  if (d.eleganceDevices > 0.55) {
    lines.push("ELEGANCE (L9): Employ rhetorical devices where they serve meaning: balanced antithesis, chiasmus, anaphora (deliberate repetition at sentence starts), isocolon (clauses of equal length), and occasional extended metaphor. Make the sound of the prose reinforce its sense.");
  } else {
    lines.push("ELEGANCE (L9): Keep the prose plain and functional. Ornament should not compete with content. Clarity is the highest form of elegance.");
  }

  if (d.lengthVariation > 0.6) {
    lines.push("RHYTHM (L9): Vary sentence length dramatically. Follow a long, complex sentence with a short, punchy one. The contrast creates emphasis and keeps the reader alert.");
  } else {
    lines.push("RHYTHM (L9): Maintain a steady, even rhythm. Consistency in sentence length creates a measured, professional tone.");
  }

  // L2: Register
  if (d.formality > 0.65) {
    lines.push("REGISTER (L2): Maintain a formal academic register. Avoid contractions, colloquialisms, and first person singular. Use precise technical vocabulary where appropriate.");
  } else if (d.formality < 0.35) {
    lines.push("REGISTER (L2): Write conversationally. Use contractions (it's, don't, can't). First person is natural. Address the reader directly when it helps.");
  } else {
    lines.push("REGISTER (L2): Use a moderate register — neither stiffly formal nor casually conversational. Professional but approachable.");
  }

  // L3/L4: Passive voice
  if (d.passiveVoice > 0.35) {
    lines.push("PASSIVE VOICE (L3/L4): Use the passive voice strategically — to maintain topic continuity ('The sample was then heated…' when 'sample' is the topic), to de-emphasize the agent, or when the agent is unknown or irrelevant. Do not use it to hide responsibility.");
  } else {
    lines.push("PASSIVE VOICE (L3/L4): Strongly prefer active voice. The passive is acceptable only when the agent is genuinely unknown or irrelevant.");
  }

  // L10: Motivating Coherence
  if (d.motivatingCoherence > 0.65) {
    lines.push("INTRODUCTIONS (L10): Frame responses with a clear issue statement, then develop the discussion, then state the point. For longer responses, begin with a brief context-setting introduction and end with a conclusion that states the main point.");
  } else {
    lines.push("INTRODUCTIONS (L10): Open directly with the most useful information. Minimize throat-clearing. The reader wants the answer, not the journey to it.");
  }

  // L11: Global Coherence
  if (d.globalCoherence > 0.65) {
    lines.push("GLOBAL STRUCTURE (L11): Organize responses into clearly scoped sections. Each paragraph should have a single focus. Transitions between paragraphs should make the logical relationship explicit.");
  } else {
    lines.push("GLOBAL STRUCTURE (L11): Allow a more fluid, exploratory structure. Ideas can develop organically. Not every paragraph needs a topic sentence.");
  }

  // L12: Ethics
  if (d.ethicalTransparency > 0.7) {
    lines.push("ETHICS (L12): Be maximally transparent. Surface uncertainty, caveats, and alternative interpretations. Do not use complexity to obscure weakness in the evidence. Prefer clarity over persuasiveness when they conflict. Never use difficult prose to seem more authoritative.");
  } else {
    lines.push("ETHICS (L12): Frame the argument clearly but allow emphasis and strategic word choice to guide the reader toward the best-supported conclusion. Persuasion through clarity — not obscurantism — is legitimate.");
  }

  lines.push("");
  lines.push("IMPORTANT: These style instructions shape HOW you write, not WHAT you write. Factual accuracy, verification, and citation rules remain unchanged. Apply this style naturally — do not mention these instructions or label your style.");

  return lines.join("\n");
}

// ─── Session seed generator ────────────────────────────────────────
// Creates a new seed from entropy sources. Each page load gets a
// different persona unless the user pins a seed.

export function newSessionSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
}

// ─── Exports for UI ────────────────────────────────────────────────

export { ARCHETYPES };
