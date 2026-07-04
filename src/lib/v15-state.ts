/**
 * V15 Pipeline state — isolated from npm package's app-state.
 * Uses localStorage + event dispatch for cross-component sync.
 *
 * Namespace 'veritas.v15.*' avoids ANY collision with the npm package's
 * 'veritas.*' keys. The V15 toggle default is FALSE — the original app runs
 * unchanged unless the engineer explicitly enables V15.
 */

const K_ENABLED = "veritas.v15.enabled";
const K_KEYS = "veritas.keys.v3"; // Same key the npm package uses — read-only
const EVT = "veritas:v15:change";

export function getV15Enabled(): boolean {
  try { return localStorage.getItem(K_ENABLED) === "true"; } catch { return false; }
}

export function setV15Enabled(on: boolean): void {
  try { localStorage.setItem(K_ENABLED, String(on)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: { enabled: on } })); } catch { /* ignore */ }
}

export function subscribeV15(cb: (on: boolean) => void): () => void {
  const handler = () => cb(getV15Enabled());
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

import { registerApiKey } from "./v15-gemini";

/** Read the Gemini API key the npm package stored (never overwrite it). */
export function getGeminiKey(): string {
  try {
    const raw = localStorage.getItem(K_KEYS);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const primary = typeof parsed?.gemini === "string" ? parsed.gemini : "";
    if (primary) registerApiKey("gemini", primary);
    return primary;
  } catch { return ""; }
}

const K_ROTATION_KEYS = "veritas.v15.rotationKeys";

export function getAuxiliaryGeminiKeys(): string[] {
  try {
    const raw = localStorage.getItem(K_ROTATION_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveAuxiliaryGeminiKeys(keys: string[]): void {
  try {
    localStorage.setItem(K_ROTATION_KEYS, JSON.stringify(keys));
    // Eagerly register keys to the active pool
    keys.forEach(k => registerApiKey("gemini", k));
    const primary = getGeminiKey();
    if (primary) registerApiKey("gemini", primary);
  } catch { /* ignore */ }
}

// Auto-register keys at module load
try {
  getAuxiliaryGeminiKeys().forEach(k => registerApiKey("gemini", k));
  const primary = getGeminiKey();
  if (primary) registerApiKey("gemini", primary);
} catch { /* ignore */ }

const K_ALLOWED_MODELS = "veritas.v15.allowedModels";

export function getAllowedModels(): string[] {
  try {
    const raw = localStorage.getItem(K_ALLOWED_MODELS);
    if (!raw) return []; // Empty means ALL allowed by default
    return JSON.parse(raw);
  } catch { return []; }
}

export function saveAllowedModels(models: string[]): void {
  try {
    localStorage.setItem(K_ALLOWED_MODELS, JSON.stringify(models));
  } catch { /* ignore */ }
}
