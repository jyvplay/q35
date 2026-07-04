/**
 * V15 Advanced Gate Testbed.
 *
 * Experimental, opt-in layer for discovering candidate lexical gates from LLM
 * reviewer observations. It is OFF by default and never mutates the canonical
 * registry. Proposed gates are stored as testbed records in localStorage and
 * can be applied only when Advanced Gate Testbed is enabled in the calibration UI.
 */
import { geminiGenerate } from "./v15-gemini";

const K_ENABLED = "veritas.v15.advancedGates.enabled";
const K_GATES = "veritas.v15.advancedGates.rules";

export interface TestbedGate {
  id: string;
  code: string;
  severity: "warning" | "major" | "critical";
  message: string;
  remediation: string;
  regex: string;
  flags?: string;
  createdAt: number;
  hits: number;
  sourceModel?: string;
}

export interface TestbedGateIssue {
  severity: "warning" | "major" | "critical";
  code: string;
  message: string;
  remediation: string;
  gateId: string;
}

export function getAdvancedGatesEnabled(): boolean {
  try { return localStorage.getItem(K_ENABLED) === "true"; } catch { return false; }
}

export function setAdvancedGatesEnabled(on: boolean): void {
  try { localStorage.setItem(K_ENABLED, String(on)); } catch { /* ignore */ }
}

export function listTestbedGates(): TestbedGate[] {
  try {
    const raw = localStorage.getItem(K_GATES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveTestbedGates(gates: TestbedGate[]): void {
  try { localStorage.setItem(K_GATES, JSON.stringify(gates.slice(-80))); } catch { /* ignore */ }
}

export function addTestbedGate(gate: Omit<TestbedGate, "id" | "createdAt" | "hits">): TestbedGate {
  const gates = listTestbedGates();
  const normalizedCode = gate.code.trim().toUpperCase();
  const existing = gates.find(g => g.code === normalizedCode || g.regex === gate.regex);
  if (existing) return existing;
  const next: TestbedGate = {
    ...gate,
    code: normalizedCode,
    id: `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    hits: 0,
  };
  saveTestbedGates([...gates, next]);
  return next;
}

export function runTestbedGates(answer: string): TestbedGateIssue[] {
  if (!getAdvancedGatesEnabled()) return [];
  const gates = listTestbedGates();
  const issues: TestbedGateIssue[] = [];
  let mutated = false;
  for (const gate of gates) {
    try {
      const re = new RegExp(gate.regex, gate.flags || "i");
      if (re.test(answer)) {
        issues.push({
          severity: gate.severity,
          code: `TESTBED_${gate.code}`,
          message: gate.message,
          remediation: gate.remediation,
          gateId: gate.id,
        });
        gate.hits += 1;
        mutated = true;
      }
    } catch { /* invalid experimental regex is ignored */ }
  }
  if (mutated) saveTestbedGates(gates);
  return issues;
}

function parseGateJson(text: string): any | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/**
 * Ask a reviewer LLM to propose a new testbed gate for an observed failure
 * class. The resulting rule is not canonical; it is isolated to the testbed.
 */
export async function proposeGateWithLLM(opts: {
  apiKey: string;
  question: string;
  answer: string;
  judgeNote?: string;
  model?: string;
}): Promise<TestbedGate | null> {
  if (!getAdvancedGatesEnabled()) return null;
  const prompt = `You are designing an EXPERIMENTAL regex-based guardrail for an LLM answer quality system.

The current canonical gates may have missed a pattern. If there is a concrete, text-detectable failure pattern in the answer, propose ONE narrow regex gate. If no good lexical gate exists, return {"skip": true}.

Return ONLY JSON:
{"skip":false,"code":"SHORT_CODE","severity":"warning|major|critical","message":"what the gate catches","remediation":"how to fix it","regex":"safe javascript regex source","flags":"i"}

QUESTION:\n${opts.question}

ANSWER:\n${opts.answer.slice(0, 5000)}

JUDGE_NOTE:\n${opts.judgeNote || ""}`;

  const res = await geminiGenerate({
    apiKey: opts.apiKey,
    model: opts.model || "gemini-3.1-flash-lite",
    prompt,
    maxOutputTokens: 450,
  });
  if (!res.ok) return null;
  const j = parseGateJson(res.text);
  if (!j || j.skip) return null;
  if (typeof j.code !== "string" || typeof j.regex !== "string" || typeof j.message !== "string") return null;
  // Sanity-check regex before saving.
  try { new RegExp(j.regex, j.flags || "i"); } catch { return null; }
  const severity = ["warning", "major", "critical"].includes(j.severity) ? j.severity : "warning";
  return addTestbedGate({
    code: j.code,
    severity,
    message: j.message,
    remediation: typeof j.remediation === "string" ? j.remediation : "Revise the answer to remove the detected pattern.",
    regex: j.regex,
    flags: typeof j.flags === "string" ? j.flags : "i",
    sourceModel: opts.model || "gemini-3.1-flash-lite",
  });
}