export interface FailureMode {
  id: string;
  name: string;
  superclass: string;
  superclassName: string;
  solution: string;
}

export const FAILURE_MODES: FailureMode[] = [
  // A: Citation & Reference Fabrication (12)
  { id:'A1', name:'Total fabrication', superclass:'A', superclassName:'Citation Fabrication', solution:'Only show real URLs returned by Jina Search — never generate URLs' },
  { id:'A2', name:'Partial attribute corruption', superclass:'A', superclassName:'Citation Fabrication', solution:'Display source title + URL + snippet exactly as returned by Jina' },
  { id:'A3', name:'Identifier hijacking', superclass:'A', superclassName:'Citation Fabrication', solution:'Jina Reader resolves URLs — dead links detected automatically' },
  { id:'A4', name:'Placeholder hallucination', superclass:'A', superclassName:'Citation Fabrication', solution:'Empty source arrays displayed honestly as CANNOT_VERIFY' },
  { id:'A5', name:'Semantic misrepresentation', superclass:'A', superclassName:'Citation Fabrication', solution:'Show verbatim snippet from source — user compares to claim' },
  { id:'A6', name:'Compound citation failure', superclass:'A', superclassName:'Citation Fabrication', solution:'Each claim verified independently — compound errors decomposed' },
  { id:'A7', name:'Retraction blindness', superclass:'A', superclassName:'Citation Fabrication', solution:'Jina searches current web — retraction notices appear in results' },
  { id:'A8', name:'Review laundering', superclass:'A', superclassName:'Citation Fabrication', solution:'Source type classified by domain (.edu, .gov, news, etc.)' },
  { id:'A9', name:'Post-rationalized citation', superclass:'A', superclassName:'Citation Fabrication', solution:'Sources retrieved AFTER generation — no post-hoc citation fitting' },
  { id:'A10', name:'Recursive citation chain', superclass:'A', superclassName:'Citation Fabrication', solution:'Each source independently retrieved via Jina' },
  { id:'A11', name:'Preprint confusion', superclass:'A', superclassName:'Citation Fabrication', solution:'arxiv.org domains tagged as preprint in source badges' },
  { id:'A12', name:'Non-English citation loss', superclass:'A', superclassName:'Citation Fabrication', solution:'Jina Search returns multilingual results' },

  // B: Code Generation (20)
  { id:'B1', name:'Requirement conflicting', superclass:'B', superclassName:'Code Generation', solution:'System prompt requires restating requirements before code' },
  { id:'B2', name:'Wrong problem mapping', superclass:'B', superclassName:'Code Generation', solution:'Task restatement in system prompt' },
  { id:'B3', name:'Semantic misunderstanding', superclass:'B', superclassName:'Code Generation', solution:'Behavior description required before implementation' },
  { id:'B4', name:'Correctness vs functionality', superclass:'B', superclassName:'Code Generation', solution:'Property test generation encouraged in system prompt' },
  { id:'B5', name:'Security vulnerability', superclass:'B', superclassName:'Code Generation', solution:'OWASP checklist in system prompt constraints' },
  { id:'B6', name:'Non-existent package/API', superclass:'B', superclassName:'Code Generation', solution:'Package names verified via Jina Search against registries' },
  { id:'B7', name:'Instruction inconsistency', superclass:'B', superclassName:'Code Generation', solution:'Requirement echo before solving' },
  { id:'B8', name:'Factual code fabrication', superclass:'B', superclassName:'Code Generation', solution:'[VERIFY API] marker on uncertain API calls' },
  { id:'B9', name:'Version drift', superclass:'B', superclassName:'Code Generation', solution:'Jina Search checks current package versions' },
  { id:'B10', name:'Repository integration failure', superclass:'B', superclassName:'Code Generation', solution:'File tree + integration points required' },
  { id:'B11', name:'State/migration bug', superclass:'B', superclassName:'Code Generation', solution:'Migration + rollback scripts included' },
  { id:'B12', name:'Concurrency/race condition', superclass:'B', superclassName:'Code Generation', solution:'Concurrency analysis in system prompt' },
  { id:'B13', name:'Resource leak', superclass:'B', superclassName:'Code Generation', solution:'Lifecycle cleanup audit' },
  { id:'B14', name:'Edge-case failure', superclass:'B', superclassName:'Code Generation', solution:'Edge case enumeration required' },
  { id:'B15', name:'Fake test results', superclass:'B', superclassName:'Code Generation', solution:'Explicit "NOT EXECUTED" declaration' },
  { id:'B16', name:'Supply chain attack', superclass:'B', superclassName:'Code Generation', solution:'Registry verification via Jina + license check' },
  { id:'B17', name:'Numerical precision error', superclass:'B', superclassName:'Code Generation', solution:'Units + magnitude sanity check' },
  { id:'B18', name:'Algorithm selection error', superclass:'B', superclassName:'Code Generation', solution:'Complexity + alternatives stated' },
  { id:'B19', name:'Comment/doc fabrication', superclass:'B', superclassName:'Code Generation', solution:'Docstring reflects actual code' },
  { id:'B20', name:'Formatting/parsing failure', superclass:'B', superclassName:'Code Generation', solution:'Output format specified explicitly' },

  // C: Contextual (7)
  { id:'C1', name:'Lost-in-the-middle', superclass:'C', superclassName:'Context Failures', solution:'Key constraints front-loaded + echoed in system prompt' },
  { id:'C2', name:'Recency bias / token decay', superclass:'C', superclassName:'Context Failures', solution:'Coherence checkpoint every 500 tokens' },
  { id:'C3', name:'Irreversible early commitment', superclass:'C', superclassName:'Context Failures', solution:'Early verification gate before committing' },
  { id:'C4', name:'Context override by parametric', superclass:'C', superclassName:'Context Failures', solution:'Jina sources override model parametric knowledge' },
  { id:'C5', name:'Conflicting context confusion', superclass:'C', superclassName:'Context Failures', solution:'CONFLICTING_SOURCES status when sources disagree' },
  { id:'C6', name:'Primacy bias in structured output', superclass:'C', superclassName:'Context Failures', solution:'Source order not used for ranking' },
  { id:'C7', name:'Temporal context decay', superclass:'C', superclassName:'Context Failures', solution:'Re-anchor to original task in long conversations' },

  // D: Temporal (4)
  { id:'D1', name:'Knowledge cutoff blindness', superclass:'D', superclassName:'Temporal Cutoff', solution:'Jina Search returns current web data — bypasses cutoff' },
  { id:'D2', name:'Recency projection', superclass:'D', superclassName:'Temporal Cutoff', solution:'Jina results include page dates for temporal grounding' },
  { id:'D3', name:'Training data temporal imbalance', superclass:'D', superclassName:'Temporal Cutoff', solution:'Live search inherently favors recent results' },
  { id:'D4', name:'Concept drift', superclass:'D', superclassName:'Temporal Cutoff', solution:'Current definitions from live web' },

  // E: Sycophancy (5)
  { id:'E1', name:'Helpfulness-override of logic', superclass:'E', superclassName:'Sycophancy', solution:'System prompt: "say I do not know" over fabrication' },
  { id:'E2', name:'False confirmation bias', superclass:'E', superclassName:'Sycophancy', solution:'Jina sources may contradict user — surfaced honestly' },
  { id:'E3', name:'User authority amplification', superclass:'E', superclassName:'Sycophancy', solution:'System prompt: challenge incorrect premises' },
  { id:'E4', name:'Emotional tone capture', superclass:'E', superclassName:'Sycophancy', solution:'Factual tone maintained regardless of user emotion' },
  { id:'E5', name:'Pushback capitulation', superclass:'E', superclassName:'Sycophancy', solution:'Sources persist across turns — evidence does not change' },

  // F: Reasoning (10)
  { id:'F1', name:'Confabulation (stochastic)', superclass:'F', superclassName:'Reasoning', solution:'Every claim cross-checked against Jina sources' },
  { id:'F2', name:'Causal inversion', superclass:'F', superclassName:'Reasoning', solution:'Causal claims require source backing' },
  { id:'F3', name:'Scope inflation', superclass:'F', superclassName:'Reasoning', solution:'Overgeneralization detected in claim classification' },
  { id:'F4', name:'Premise smuggling', superclass:'F', superclassName:'Reasoning', solution:'System prompt: surface all assumptions' },
  { id:'F5', name:'Confidence inflation', superclass:'F', superclassName:'Reasoning', solution:'Confidence = 0 without external sources' },
  { id:'F6', name:'Logic inconsistency', superclass:'F', superclassName:'Reasoning', solution:'Coherence checker scans for contradictions' },
  { id:'F7', name:'CoT drift', superclass:'F', superclassName:'Reasoning', solution:'Output verified independent of reasoning trace' },
  { id:'F8', name:'Geometric/wrong-cluster', superclass:'F', superclassName:'Reasoning', solution:'Question restated before answering' },
  { id:'F9', name:'Compositional error', superclass:'F', superclassName:'Reasoning', solution:'Each sub-claim verified independently via Jina' },
  { id:'F10', name:'Reference resolution failure', superclass:'F', superclassName:'Reasoning', solution:'Source snippet displayed verbatim' },

  // G: Output Format (8)
  { id:'G1', name:'Silent truncation', superclass:'G', superclassName:'Completeness', solution:'Gemini max_tokens not artificially limited' },
  { id:'G2', name:'Brevity substitution', superclass:'G', superclassName:'Completeness', solution:'System prompt: no "etc." as content substitute' },
  { id:'G3', name:'Placeholder pollution', superclass:'G', superclassName:'Completeness', solution:'System prompt: no TODOs, stubs, or pass' },
  { id:'G4', name:'Mock/substitution', superclass:'G', superclassName:'Completeness', solution:'All data from real APIs — no mock data' },
  { id:'G5', name:'Structure without substance', superclass:'G', superclassName:'Completeness', solution:'Content verification beyond format checks' },
  { id:'G6', name:'Assumed context omission', superclass:'G', superclassName:'Completeness', solution:'Self-contained responses required' },
  { id:'G7', name:'Partial requirement coverage', superclass:'G', superclassName:'Completeness', solution:'Completion checklist in system prompt' },
  { id:'G8', name:'Format consistency decay', superclass:'G', superclassName:'Completeness', solution:'Coherence checkpoints maintain rigor' },

  // H: Scientific (10)
  { id:'H1', name:'Summarization faithfulness', superclass:'H', superclassName:'Academic', solution:'Source snippet shown verbatim' },
  { id:'H2', name:'Post-cutoff research gap', superclass:'H', superclassName:'Academic', solution:'Jina searches current literature databases' },
  { id:'H3', name:'Statistical misinterpretation', superclass:'H', superclassName:'Academic', solution:'Numbers verified against source snippets' },
  { id:'H4', name:'Methodology conflation', superclass:'H', superclassName:'Academic', solution:'Study design verified in source content' },
  { id:'H5', name:'Authority fabrication', superclass:'H', superclassName:'Academic', solution:'Author/org names verified via Jina Search' },
  { id:'H6', name:'Retraction blindness', superclass:'H', superclassName:'Academic', solution:'Retraction databases searchable via Jina' },
  { id:'H7', name:'Definitional drift', superclass:'H', superclassName:'Academic', solution:'Definitions anchored to source text' },
  { id:'H8', name:'Spurious convergence', superclass:'H', superclassName:'Academic', solution:'Each source measured independently' },
  { id:'H9', name:'Systematic-review theater', superclass:'H', superclassName:'Academic', solution:'Search query displayed — user sees what was searched' },
  { id:'H10', name:'Evidence omission', superclass:'H', superclassName:'Academic', solution:'Multiple sources shown — disconfirming included' },

  // I: Prompt Eng (6)
  { id:'I1', name:'Opportunistic prompting gap', superclass:'I', superclassName:'Prompt Eng', solution:'Task type auto-classified from claim content' },
  { id:'I2', name:'Task misclassification', superclass:'I', superclassName:'Prompt Eng', solution:'Claim type detected and tagged' },
  { id:'I3', name:'Over-generalization from benchmarks', superclass:'I', superclassName:'Prompt Eng', solution:'Tested against live web' },
  { id:'I4', name:'Self-evaluation unreliability', superclass:'I', superclassName:'Prompt Eng', solution:'External Jina verification — not self-eval' },
  { id:'I5', name:'Primacy bias', superclass:'I', superclassName:'Prompt Eng', solution:'Source order not used for ranking' },
  { id:'I6', name:'Vague prompt amplification', superclass:'I', superclassName:'Prompt Eng', solution:'Claim decomposition before verification' },

  // J: RAG (6)
  { id:'J1', name:'Bad retrieval', superclass:'J', superclassName:'RAG', solution:'Show search query + results — transparent retrieval' },
  { id:'J2', name:'Context stuffing', superclass:'J', superclassName:'RAG', solution:'Max 5 sources per claim — no stuffing' },
  { id:'J3', name:'Citation post-rationalization', superclass:'J', superclassName:'RAG', solution:'Sources retrieved AFTER generation — not fitted' },
  { id:'J4', name:'Faithfulness violation', superclass:'J', superclassName:'RAG', solution:'Source snippet displayed — user checks faithfulness' },
  { id:'J5', name:'Stale retrieval', superclass:'J', superclassName:'RAG', solution:'Jina fetches live web — always current' },
  { id:'J6', name:'Retrieval poisoning', superclass:'J', superclassName:'RAG', solution:'Source domain displayed — user judges trust' },

  // K: Tool-Use (6)
  { id:'K1', name:'Fabricated tool outputs', superclass:'K', superclassName:'Tool-Use', solution:'Jina API responses shown raw — not rewritten' },
  { id:'K2', name:'Wrong tool selection', superclass:'K', superclassName:'Tool-Use', solution:'Only Jina Search used — no tool confusion' },
  { id:'K3', name:'State drift across turns', superclass:'K', superclassName:'Tool-Use', solution:'Coherence checker tracks cross-turn consistency' },
  { id:'K4', name:'Action-before-verification', superclass:'K', superclassName:'Tool-Use', solution:'Verify via Jina BEFORE presenting as fact' },
  { id:'K5', name:'Config file injection', superclass:'K', superclassName:'Tool-Use', solution:'No config files processed — API keys via UI only' },
  { id:'K6', name:'Memory poisoning', superclass:'K', superclassName:'Tool-Use', solution:'Session-local state — no persistent memory' },

  // L: Structural (3)
  { id:'L1', name:'Open-world impossibility', superclass:'L', superclassName:'Structural', solution:'CANNOT_VERIFY status — honest about limits' },
  { id:'L2', name:'Incentive-driven bluffing', superclass:'L', superclassName:'Structural', solution:'System prompt penalizes unsupported specificity' },
  { id:'L3', name:'Training contamination', superclass:'L', superclassName:'Structural', solution:'External Jina verification mandatory' },

  // M: Injection (9)
  { id:'M1', name:'Direct injection', superclass:'M', superclassName:'Injection', solution:'Regex detection: "ignore previous", etc. — blocked' },
  { id:'M2', name:'Indirect injection', superclass:'M', superclassName:'Injection', solution:'Regex detection: "you are now", role-switch — blocked' },
  { id:'M3', name:'Hidden-text injection', superclass:'M', superclassName:'Injection', solution:'Regex detection: <|tokens|>, [INST] — blocked' },
  { id:'M4', name:'HTML/ARIA injection', superclass:'M', superclassName:'Injection', solution:'Regex detection: HTML comments, aria attrs — blocked' },
  { id:'M5', name:'Retrieval poisoning', superclass:'M', superclassName:'Injection', solution:'Jina sources treated as DATA — instructions ignored' },
  { id:'M6', name:'Tool-metadata injection', superclass:'M', superclassName:'Injection', solution:'Tool outputs treated as DATA' },
  { id:'M7', name:'Memory poisoning', superclass:'M', superclassName:'Injection', solution:'No persistent memory — session-only state' },
  { id:'M8', name:'Multimodal injection', superclass:'M', superclassName:'Injection', solution:'Text-only processing — no OCR/image input' },
  { id:'M9', name:'Config-file injection', superclass:'M', superclassName:'Injection', solution:'No config files loaded — API keys via UI input' },

  // N: CoT (5)
  { id:'N1', name:'Verbalization failure', superclass:'N', superclassName:'CoT', solution:'Output verified against sources, not reasoning trace' },
  { id:'N2', name:'Hint non-verbalization', superclass:'N', superclassName:'CoT', solution:'External verification — CoT irrelevant' },
  { id:'N3', name:'Faithfulness decreasing', superclass:'N', superclassName:'CoT', solution:'Jina verification independent of difficulty' },
  { id:'N4', name:'Outcome-based RL failure', superclass:'N', superclassName:'CoT', solution:'Each claim step verified independently' },
  { id:'N5', name:'CoT-inference inconsistency', superclass:'N', superclassName:'CoT', solution:'Claims extracted from output, not from CoT' },

  // O: Judge (6)
  { id:'O1', name:'Position bias', superclass:'O', superclassName:'Judge', solution:'Sources not ranked by position' },
  { id:'O2', name:'Verbosity bias', superclass:'O', superclassName:'Judge', solution:'Verification based on content, not length' },
  { id:'O3', name:'Provenance hierarchy bias', superclass:'O', superclassName:'Judge', solution:'All sources displayed equally — user decides trust' },
  { id:'O4', name:'Self-preference bias', superclass:'O', superclassName:'Judge', solution:'Verification done by Jina — not by generating model' },
  { id:'O5', name:'Single-judge insufficiency', superclass:'O', superclassName:'Judge', solution:'Multiple Jina sources (up to 5) per claim' },
  { id:'O6', name:'Benchmarks ≠ real-world', superclass:'O', superclassName:'Judge', solution:'Tested against live web — not benchmarks' },

  // P: Multilingual (4)
  { id:'P1', name:'Translation hallucination', superclass:'P', superclassName:'Multilingual', solution:'Jina returns multilingual results' },
  { id:'P2', name:'Low-resource language degradation', superclass:'P', superclassName:'Multilingual', solution:'Jina coverage across languages' },
  { id:'P3', name:'Image-text alignment failure', superclass:'P', superclassName:'Multilingual', solution:'Text-only — no image hallucination possible' },
  { id:'P4', name:'Multimodal reasoning gap', superclass:'P', superclassName:'Multilingual', solution:'Single-modality verification only' },

  // Q: Factuality (5)
  { id:'Q1', name:'Intrinsic hallucination', superclass:'Q', superclassName:'Factuality', solution:'Context primacy — Jina sources override model' },
  { id:'Q2', name:'Extrinsic hallucination', superclass:'Q', superclassName:'Factuality', solution:'All ungrounded claims tagged UNVERIFIED' },
  { id:'Q3', name:'Factuality violation', superclass:'Q', superclassName:'Factuality', solution:'External Jina verification for every claim' },
  { id:'Q4', name:'Faithfulness violation', superclass:'Q', superclassName:'Factuality', solution:'Source snippet vs claim — user comparison' },
  { id:'Q5', name:'Compliant but unfaithful', superclass:'Q', superclassName:'Factuality', solution:'Verification independent of format compliance' },

  // R: Compositional (4)
  { id:'R1', name:'Compound claim hallucination', superclass:'R', superclassName:'Compositional', solution:'Each sub-claim verified independently via Jina' },
  { id:'R2', name:'Recursive citation chain', superclass:'R', superclassName:'Compositional', solution:'Each source independently retrieved' },
  { id:'R3', name:'Numerical cascade error', superclass:'R', superclassName:'Compositional', solution:'Numbers verified against source snippets' },
  { id:'R4', name:'Multi-source misattribution', superclass:'R', superclassName:'Compositional', solution:'Per-claim source attribution — no merging' },

  // S: Numerical (6)
  { id:'S1', name:'Wrong number', superclass:'S', superclassName:'Numerical', solution:'Numerical claims tagged + verified via Jina' },
  { id:'S2', name:'Wrong unit', superclass:'S', superclassName:'Numerical', solution:'Source snippet includes original units' },
  { id:'S3', name:'Wrong magnitude', superclass:'S', superclassName:'Numerical', solution:'Source numbers compared to claim numbers' },
  { id:'S4', name:'Wrong precision', superclass:'S', superclassName:'Numerical', solution:'Source precision preserved in snippet' },
  { id:'S5', name:'Wrong calculation', superclass:'S', superclassName:'Numerical', solution:'Calculation results verified against sources' },
  { id:'S6', name:'Plausibility illusion', superclass:'S', superclassName:'Numerical', solution:'Numbers that "sound right" still require source' },

  // T: Domain (6)
  { id:'T1', name:'Physics hallucination', superclass:'T', superclassName:'Domain', solution:'Domain claims verified against authoritative sources' },
  { id:'T2', name:'Chemistry/bio hallucination', superclass:'T', superclassName:'Domain', solution:'Verified against .edu/.gov sources via Jina Search' },
  { id:'T3', name:'Engineering domain error', superclass:'T', superclassName:'Domain', solution:'Standards verified via Jina Search' },
  { id:'T4', name:'Medical hallucination', superclass:'T', superclassName:'Domain', solution:'Medical claims checked against .gov health sources' },
  { id:'T5', name:'Historical fact error', superclass:'T', superclassName:'Domain', solution:'Historical claims verified via encyclopedia sources' },
  { id:'T6', name:'Legal citation error', superclass:'T', superclassName:'Domain', solution:'Legal claims verified via legal databases' },

  // U: Compliance (4)
  { id:'U1', name:'Superficial instruction following', superclass:'U', superclassName:'Compliance', solution:'Content verified — not just format compliance' },
  { id:'U2', name:'Checklist theater', superclass:'U', superclassName:'Compliance', solution:'External Jina verification — not self-checklist' },
  { id:'U3', name:'Label without substance', superclass:'U', superclassName:'Compliance', solution:'Status labels backed by actual API results' },
  { id:'U4', name:'Format ≠ accuracy', superclass:'U', superclassName:'Compliance', solution:'Content audit runs independently of formatting' },

  // V: Overtrust (3)
  { id:'V1', name:'Output regurgitation loop', superclass:'V', superclassName:'Overtrust', solution:'External verification breaks regurgitation loop' },
  { id:'V2', name:'Benchmark disconnect', superclass:'V', superclassName:'Overtrust', solution:'Tested against live web — not benchmarks' },
  { id:'V3', name:'Emergent capability overclaim', superclass:'V', superclassName:'Overtrust', solution:'Capabilities not claimed — demonstrated via results' },

  // W: Decoherence (4)
  { id:'W1', name:'Coherence decay', superclass:'W', superclassName:'Decoherence', solution:'Coherence checker runs on every response' },
  { id:'W2', name:'Tone drift', superclass:'W', superclassName:'Decoherence', solution:'System prompt maintains consistent rigor' },
  { id:'W3', name:'Status blur', superclass:'W', superclassName:'Decoherence', solution:'Status re-computed per claim — never inherited' },
  { id:'W4', name:'Contradiction tolerance creep', superclass:'W', superclassName:'Decoherence', solution:'Cross-turn contradiction scan active' },

  // X: Cascades (3)
  { id:'X1', name:'Claim cascade', superclass:'X', superclassName:'Cascades', solution:'Each claim verified independently — cascade broken' },
  { id:'X2', name:'Confidence cascade', superclass:'X', superclassName:'Cascades', solution:'Confidence = 0 until external source confirms' },
  { id:'X3', name:'Remediation paradox', superclass:'X', superclassName:'Cascades', solution:'Multiple Jina sources prevent single-point failure' },

  // Y: Ontological (4)
  { id:'Y1', name:'Fake entity', superclass:'Y', superclassName:'Ontological', solution:'Entity names searched via Jina — existence verified' },
  { id:'Y2', name:'Fake framework', superclass:'Y', superclassName:'Ontological', solution:'Framework/methodology names searched via Jina' },
  { id:'Y3', name:'Fake taxonomy', superclass:'Y', superclassName:'Ontological', solution:'Taxonomy terms verified against web sources' },
  { id:'Y4', name:'Fake standard', superclass:'Y', superclassName:'Ontological', solution:'Standard names verified against registries via Jina' },

  // Z: Temporal Logic (4)
  { id:'Z1', name:'Chronological error', superclass:'Z', superclassName:'Temporal Logic', solution:'Date claims verified against source timestamps' },
  { id:'Z2', name:'Temporal state confusion', superclass:'Z', superclassName:'Temporal Logic', solution:'Current data from Jina — not stale training data' },
  { id:'Z3', name:'Date hallucination', superclass:'Z', superclassName:'Temporal Logic', solution:'Dates in claims verified against source content' },
  { id:'Z4', name:'Retroactive attribution', superclass:'Z', superclassName:'Temporal Logic', solution:'Source timestamps visible — temporal ordering checked' },

  // AA: Attribution Drift (3)
  { id:'AA1', name:'Source misattribution', superclass:'AA', superclassName:'Attribution Drift', solution:'Attribution locked to source URL — no drift possible' },
  { id:'AA2', name:'Self-attribution creep', superclass:'AA', superclassName:'Attribution Drift', solution:'Sources always from Jina — never from model memory' },
  { id:'AA3', name:'Memory contamination', superclass:'AA', superclassName:'Attribution Drift', solution:'No persistent memory — session-only state' },

  // BB: Quote (3)
  { id:'BB1', name:'Fake direct quote', superclass:'BB', superclassName:'Quote', solution:'Quotes verified against source snippet content' },
  { id:'BB2', name:'Paraphrase misattribution', superclass:'BB', superclassName:'Quote', solution:'Source text shown verbatim for comparison' },
  { id:'BB3', name:'Composite quote', superclass:'BB', superclassName:'Quote', solution:'Each source displayed separately — no merging' },

  // CC: Data (4)
  { id:'CC1', name:'Fabricated table', superclass:'CC', superclassName:'Data', solution:'Data claims verified against source content' },
  { id:'CC2', name:'Fabricated figure description', superclass:'CC', superclassName:'Data', solution:'Figure claims checked against source pages' },
  { id:'CC3', name:'Fabricated dataset stats', superclass:'CC', superclassName:'Data', solution:'Statistics verified against source numbers' },
  { id:'CC4', name:'Fabricated result', superclass:'CC', superclassName:'Data', solution:'Results verified against source snippets' },

  // DD: Supplementary (4)
  { id:'DD1', name:'Fake supplementary file', superclass:'DD', superclassName:'Supplementary', solution:'File claims verified via Jina Reader URL check' },
  { id:'DD2', name:'Fake code repository', superclass:'DD', superclassName:'Supplementary', solution:'GitHub URLs verified via Jina Reader' },
  { id:'DD3', name:'Fake dataset', superclass:'DD', superclassName:'Supplementary', solution:'Dataset URLs verified via Jina Reader' },
  { id:'DD4', name:'Fake appendix', superclass:'DD', superclassName:'Supplementary', solution:'Paper structure verified via Jina Reader' },

  // EE: Cross-Modal (4)
  { id:'EE1', name:'Text-from-image hallucination', superclass:'EE', superclassName:'Cross-Modal', solution:'No image input — text-only processing' },
  { id:'EE2', name:'Text-from-audio hallucination', superclass:'EE', superclassName:'Cross-Modal', solution:'No audio input — text-only processing' },
  { id:'EE3', name:'Image-from-text hallucination', superclass:'EE', superclassName:'Cross-Modal', solution:'No image generation — text-only output' },
  { id:'EE4', name:'Multimodal reasoning hallucination', superclass:'EE', superclassName:'Cross-Modal', solution:'Single-modality only — no cross-modal errors' },

  // FF: Simulacrum (4)
  { id:'FF1', name:'Fake registry check', superclass:'FF', superclassName:'Simulacrum', solution:'Real Jina API call — HTTP response shown' },
  { id:'FF2', name:'Fake DOI resolution', superclass:'FF', superclassName:'Simulacrum', solution:'Real Jina Reader resolves URLs' },
  { id:'FF3', name:'Fake test execution', superclass:'FF', superclassName:'Simulacrum', solution:'No test execution claimed — only search results' },
  { id:'FF4', name:'Fake source retrieval', superclass:'FF', superclassName:'Simulacrum', solution:'Jina API call is real HTTP — result is real' },
];

export const SUPERCLASS_SUMMARY: Record<string, { name: string; count: number }> = {};
for (const fm of FAILURE_MODES) {
  if (!SUPERCLASS_SUMMARY[fm.superclass]) {
    SUPERCLASS_SUMMARY[fm.superclass] = { name: fm.superclassName, count: 0 };
  }
  SUPERCLASS_SUMMARY[fm.superclass].count++;
}