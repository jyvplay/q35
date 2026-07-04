// Gemini + Gemma 4 connectors via Google AI Studio REST API (generativelanguage.googleapis.com)
// Docs: https://ai.google.dev/api/generate-content
// Both Gemini and open Gemma checkpoints are routed through the same v1beta endpoint.

export type GeminiModel =
  | "gemini-3.5-flash"
  | "gemini-3.1-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  | "gemma-3-27b-it"
  | "gemma-3-12b-it"
  | "gemma-3-4b-it"
  | "gemma-3n-e4b-it"
  | "gemma-4-26b-a4b-it"
  | "gemma-4-31b-it";

export const GEMINI_MODELS: { id: GeminiModel; label: string; family: "gemini" | "gemma" }[] = [
  { id: "gemini-3.5-flash",      label: "Gemini 3.5 Flash",       family: "gemini" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite",  family: "gemini" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", family: "gemini" },
  { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",         family: "gemini" },
  { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",       family: "gemini" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite",  family: "gemini" },
  { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash",       family: "gemini" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite",  family: "gemini" },
  { id: "gemma-3-27b-it",        label: "Gemma 3 27B (IT)",       family: "gemma" },
  { id: "gemma-3-12b-it",        label: "Gemma 3 12B (IT)",       family: "gemma" },
  { id: "gemma-3-4b-it",         label: "Gemma 3 4B (IT)",        family: "gemma" },
  { id: "gemma-3n-e4b-it",       label: "Gemma 3n E4B (IT)",      family: "gemma" },
  { id: "gemma-4-26b-a4b-it",    label: "Gemma 4 26B A4B (IT)",   family: "gemma" },
  { id: "gemma-4-31b-it",        label: "Gemma 4 31B (IT)",       family: "gemma" },
];

export interface GenerateOptions {
  model: GeminiModel;
  apiKey: string;
  maxOutputTokens?: number;
  temperature?: number;
  systemInstruction?: string;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: GeminiModel;
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function geminiGenerate(prompt: string, opts: GenerateOptions): Promise<GenerateResult> {
  const url = `${BASE}/${opts.model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { role: "system", parts: [{ text: opts.systemInstruction }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const u = data.usageMetadata ?? {};
  return {
    text,
    promptTokens: u.promptTokenCount ?? 0,
    completionTokens: u.candidatesTokenCount ?? 0,
    totalTokens: u.totalTokenCount ?? 0,
    model: opts.model,
  };
}

// Convenience: generate strict JSON and parse it. Returns the parsed value or
// null if parsing fails (caller is responsible for fallback).
export async function geminiGenerateJSON<T = unknown>(
  prompt: string,
  opts: GenerateOptions,
): Promise<{ value: T | null; raw: string; usage: GenerateResult }> {
  const wrapped = prompt + "\n\nRespond with VALID JSON ONLY. No prose, no code fences.";
  const usage = await geminiGenerate(wrapped, { ...opts, temperature: opts.temperature ?? 0.1 });
  const cleaned = usage.text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return { value: JSON.parse(cleaned) as T, raw: usage.text, usage };
  } catch {
    // Try to extract first {...} or [...] block.
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return { value: JSON.parse(m[0]) as T, raw: usage.text, usage };
      } catch {
        /* fall through */
      }
    }
    return { value: null, raw: usage.text, usage };
  }
}
