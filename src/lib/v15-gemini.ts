/**
 * Minimal Gemini REST client for V15 calibration.
 * Uses fetch directly — no @google/generative-ai dep needed.
 */

export interface GenerateResult {
  text: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
}

const ENDPOINTS: Record<string, string> = {
  "gemini-3.5-flash": "gemini-3.5-flash",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemma-4-31b-it": "gemma-4-31b-it",
  "gemma-4-26b-it": "gemma-4-26b-it",
  "gemma-3-27b-it": "gemma-3-27b-it",
};

/**
 * In-Memory Rotating API Key Store — Multi-Vendor API key rotation.
 * Allows engineers to register multiple keys per vendor. The system
 * chooses one randomly at call time, multiplying available RPM/RPD quotas.
 */
const apiKeysMap = new Map<string, string[]>();

export function registerApiKey(vendor: string, key: string): void {
  const keys = apiKeysMap.get(vendor) ?? [];
  if (key && !keys.includes(key)) {
    keys.push(key);
    apiKeysMap.set(vendor, keys);
  }
}

export function getRotatedKey(vendor: string, fallbackKey: string): string {
  const keys = apiKeysMap.get(vendor) ?? [];
  if (keys.length === 0) return fallbackKey;
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx] || fallbackKey;
}

export async function geminiGenerate(opts: {
  apiKey: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
}): Promise<GenerateResult> {
  const t0 = Date.now();
  const model = ENDPOINTS[opts.model ?? ""] ?? "gemini-2.5-flash";
  // Additive: rotate key across registered gemini keys if present.
  const activeKey = getRotatedKey("gemini", opts.apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      temperature: 0.7,
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { text: "", ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 240)}`, latencyMs };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
    if (!text) return { text: "", ok: false, error: "Empty response from model", latencyMs };
    return { text, ok: true, latencyMs };
  } catch (err: any) {
    return { text: "", ok: false, error: err?.message ?? "network error", latencyMs: Date.now() - t0 };
  }
}
