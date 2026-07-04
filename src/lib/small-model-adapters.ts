import type { DriverId } from "./resource-estimator";

export interface AdapterDescriptor {
  id: DriverId;
  label: string;
  role: string;
  anchorRequirement: "optional" | "preferred" | "required";
  context: string;
  toolMode: string;
  degradePath: string[];
  bestFor: string;
  caveat: string;
}

export const ADAPTERS: AdapterDescriptor[] = [
  {
    id: "frontier",
    label: "Frontier cloud model",
    role: "Full federation lead, synthesis judge, and fallback worker.",
    anchorRequirement: "optional",
    context: "Large enough for broad briefs; still benefits from anchor-first retrieval.",
    toolMode: "Native or API-level tool routing, model-dependent.",
    degradePath: ["full", "verified-lite", "anchor-only"],
    bestFor: "Tier 4-5 exhaustive runs and high-stakes synthesis.",
    caveat: "External verification is still required; self-evaluation is not treated as proof.",
  },
  {
    id: "gemma4-31b",
    label: "Gemma 4 31B",
    role: "Primary small-frontier orchestrator with high-context synthesis.",
    anchorRequirement: "preferred",
    context: "Designed in this app as a long-context anchor-brief reader.",
    toolMode: "Gemini API generateContent path, with model availability checked per API key.",
    degradePath: ["full", "lite", "anchor-only-rag"],
    bestFor: "Tier 2-4 chat and dashboard runs when a Google AI key supports the model.",
    caveat: "The app wires the requested model id. Runtime availability is confirmed by the provider response/model list.",
  },
  {
    id: "qwen3.6",
    label: "Qwen 3.6 class adapter",
    role: "Reasoning-heavy worker and falsification specialist.",
    anchorRequirement: "preferred",
    context: "Configured as a large-brief worker when available behind a compatible gateway.",
    toolMode: "Structured JSON harness if native function calling is unavailable.",
    degradePath: ["worker", "sequential-worker", "anchor-only-rag"],
    bestFor: "Hard verification plans, contradiction analysis, and boundary searches.",
    caveat: "No direct connector is installed yet; descriptor is ready for an OpenAI-compatible gateway.",
  },
  {
    id: "gemma4-e4b",
    label: "Gemma 4 E4B class adapter",
    role: "Laptop or browser worker for low-cost anchor-grounded runs.",
    anchorRequirement: "required",
    context: "Uses chunked baseline briefs rather than broad free-recall.",
    toolMode: "Constrained JSON harness, one worker at a time.",
    degradePath: ["lite", "single-worker", "anchor-only-rag"],
    bestFor: "Tier 0-2 local/private research with Kiwix/Wikidata anchors.",
    caveat: "Small models must not assert unsupported technical facts.",
  },
  {
    id: "apple-ondevice",
    label: "Apple on-device class adapter",
    role: "Private-data handler and offline worker.",
    anchorRequirement: "required",
    context: "Local files and local anchor store first; cloud optional.",
    toolMode: "No remote tool calls unless user explicitly enables cloud access.",
    degradePath: ["private-worker", "anchor-only-rag", "abstain"],
    bestFor: "Sensitive notes, local documents, and privacy-first summaries.",
    caveat: "Exact model capability is treated as runtime-probed, not assumed.",
  },
  {
    id: "bonsai-8b",
    label: "Bonsai 8B class adapter",
    role: "Extreme-edge retrieval shell over a verified anchor.",
    anchorRequirement: "required",
    context: "Tiny context strategy: search, read one chunk, verify, then synthesize.",
    toolMode: "Strict extractor mode; no free-form factual recall.",
    degradePath: ["extractor", "anchor-only-rag", "abstain"],
    bestFor: "Phone-sized/offline fact lookup and short anchored answers.",
    caveat: "Full-power quality comes from the anchor and verifiers, not from parametric recall.",
  },
];