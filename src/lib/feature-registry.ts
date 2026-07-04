export type FeatureStatus = "complete" | "partial" | "inactive" | "remaining";

export interface FeatureEntry {
  id: string;
  area: string;
  title: string;
  status: FeatureStatus;
  note: string;
}

export const FEATURE_LEDGER: FeatureEntry[] = [
  // ── Grounding ─────────────────────────────────────────────────────────
  { id: "grounding-triple-tier", area: "Grounding", title: "PrismaFetch → OG browser scraper → Jina chain", status: "complete", note: "Runtime-ordered with academic API fallback. Jina auto-skipped when no key." },
  { id: "academic-apis", area: "Grounding", title: "PubMed / NIH Reporter / Europe PMC / OpenAlex / CrossRef / arXiv / Wikipedia", status: "complete", note: "7 CORS-safe scholarly APIs + Wikipedia run in parallel with proxy-based engines." },
  { id: "proxy-fleet", area: "Grounding", title: "12-relay CORS proxy fleet with parallel racing", status: "complete", note: "Waves of 4 proxies race; first usable wins. codetabs+Bing confirmed working." },
  { id: "query-normalization", area: "Grounding", title: "Query poisoning prevention", status: "complete", note: "Strips conversational filler; NIH-specific rewrite; relevance filter drops dictionary/music hits." },
  { id: "minimum-source-gate", area: "Grounding", title: "Minimum source count enforcement", status: "complete", note: "Runs targeted expansion searches if source count is below threshold." },

  // ── Reasoning pipeline ────────────────────────────────────────────────
  { id: "4-stage-pipeline", area: "Reasoning", title: "4-Stage micro-agent pipeline", status: "complete", note: "Logic Engine → Copywriter → Adversarial → Sanitizer. Source evidence injected at every stage." },
  { id: "n-deep", area: "Reasoning", title: "N-Deep recursive adversarial refinement", status: "complete", note: "Full-draft critique/redraft with anti-collapse guard. Model rotation strongest first/last." },
  { id: "sloop-runner", area: "Reasoning", title: "Sectioned SLOOP report runner", status: "partial", note: "Active in N-Deep entry path. Not yet the universal default for standard 4-Stage mode." },
  { id: "adversarial-gates", area: "Reasoning", title: "23+ deterministic structural gates", status: "complete", note: "SABV, cluster count, attrition, meta-text leak, delivery contradiction, crisis escalation, etc." },
  { id: "calc-interceptor", area: "Reasoning", title: "CALC-REQUEST interceptor", status: "complete", note: "Detects un-executed calc requests and runs deterministic compute sandbox." },
  { id: "continuation-detector", area: "Reasoning", title: "Truncation detection & auto-continuation", status: "complete", note: "Detects empty sections / mid-sentence truncation and fires a fill pass." },
  { id: "extract-final-answer-guard", area: "Reasoning", title: "Truncation-safe tag extraction", status: "complete", note: "Rejects suspiciously short <final_answer> fragments; uses full raw response instead." },
  { id: "oom-large-draft-guard", area: "Runtime", title: "Large-draft OOM guard in adversarial stage", status: "complete", note: "Drafts >15KB skip LLM red-team; use deterministic gates only to prevent OOM." },

  // ── Compute ───────────────────────────────────────────────────────────
  { id: "compute-sandbox", area: "Compute", title: "Deterministic compute sandbox (26+ functions)", status: "complete", note: "Unit economics, valuation, statistics, cRCT power, attrition check." },
  { id: "crct-power", area: "Compute", title: "cRCT power calculation with attrition", status: "complete", note: "calcClusterRCTPower + calcAttritionAdequacy registered in sandbox." },

  // ── Quality & audit ───────────────────────────────────────────────────
  { id: "quality-score", area: "Quality", title: "5-dimension quality scoring", status: "complete", note: "Science/Method, Math/Numerics, Grounding, Template Fit, Tone/AI-ness." },
  { id: "numeric-audit", area: "Quality", title: "Numeric audit with line/unit metadata", status: "complete", note: "Displayed in quality panel with computed/sourced/unverified badges." },
  { id: "numeric-tooltips", area: "Quality", title: "Inline number tooltips in final answer body", status: "remaining", note: "Numeric audit exists in the quality panel but not yet inline in RichText." },
  { id: "death-ledger-ui", area: "Quality", title: "Death certificate registry UI", status: "complete", note: "Rendered below atomic claim ledger." },
  { id: "claim-atomization", area: "Quality", title: "Abbreviation-safe claim atomizer", status: "complete", note: "Protects vs./e.g./Aim N. from false splits; merges orphan fragments." },

  // ── UI & controls ─────────────────────────────────────────────────────
  { id: "template-selector", area: "UI", title: "Template selector on chat page", status: "complete", note: "Above persona panel." },
  { id: "sloop-page-slider", area: "UI", title: "SLOOP page-count slider", status: "complete", note: "In header + settings panel." },
  { id: "n-deep-slider", area: "UI", title: "N-Deep depth slider (1-20)", status: "complete", note: "With OOM-safe runtime cap." },
  { id: "cluster-search", area: "UI", title: "Cluster search toggle + width slider", status: "complete", note: "Parallel hypothesis search waves." },
  { id: "persona-rarity", area: "UI", title: "23 Williams personas with rarity tiers", status: "complete", note: "Common → Legendary. Export/import via seed." },
  { id: "memory-monitor", area: "Runtime", title: "Live memory monitor", status: "complete", note: "Chrome: exact heap. Others: approximate app-state size estimate." },

  // ── Model management ──────────────────────────────────────────────────
  { id: "model-fallback", area: "Models", title: "Auto model rotation on 429/503", status: "complete", note: "8-model fallback chain cheapest→frontier." },
  { id: "gemma-4-26b", area: "Models", title: "Gemma 4 26B model registered", status: "complete", note: "Available in model selector." },
  { id: "maxOutputTokens", area: "Models", title: "Explicit per-model maxOutputTokens", status: "complete", note: "Gemma 8K, Gemini 2.5/3.x 16K-32K, Claude/Grok/DeepSeek 16K." },
  { id: "rpm-governor", area: "Models", title: "RPM throttle + reset between runs", status: "complete", note: "Prevents deadlocked promise chains." },

  // ── Backend / additive subsystems ─────────────────────────────────────
  { id: "prismafetch-python", area: "Backend", title: "Python PrismaFetch service modules", status: "inactive", note: "Additive under services/prismafetch. Not wired to Vite runtime until backend is running." },
  { id: "src-chat-orchestrator", area: "Frontend", title: "VeritasChatSystem orchestration UI", status: "inactive", note: "Additive under src/chat. Requires backend /api/v1/context/orchestrate endpoint." },
  { id: "prismafetch-rc5", area: "Backend", title: "PrismaFetch RC5 capture-server + Docker", status: "inactive", note: "Full server under prismafetch-rc5/. Requires Docker to run." },

  // ── Governance ────────────────────────────────────────────────────────
  { id: "feature-ledger", area: "Governance", title: "Feature completeness ledger", status: "complete", note: "Rendered in Modules page with status counts." },
  { id: "pi-redaction", area: "Governance", title: "PI name redaction gate", status: "complete", note: "Deterministic regex in output boundary." },
  { id: "verification-plan-leak-guard", area: "Governance", title: "Verification-plan leakage repair", status: "complete", note: "Detects and forces synthesis-only repair." },
];

export function summarizeLedger() {
  const counts = { complete: 0, partial: 0, inactive: 0, remaining: 0 } as Record<FeatureStatus, number>;
  for (const f of FEATURE_LEDGER) counts[f.status]++;
  return counts;
}
