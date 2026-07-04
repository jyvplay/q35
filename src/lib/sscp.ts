/**
 * SSCP Receipt + Merkle seal — REAL cryptography via Web Crypto API (SHA-256).
 * No mock hashes. Every receipt is reproducible from its inputs.
 *
 * A receipt binds together the claim ledger, tool log, gate results, and
 * evidence index into a Merkle tree, then exposes the root hash as the
 * audit seal printed in the OMEGA unified header block.
 */

export type EvidenceTier = "CTX" | "SRC" | "TOOL" | "DERIV";

export interface SSCPLeaf {
  domain: string;     // e.g. "claim", "tool", "gate", "evidence"
  text: string;       // canonical content of the leaf
  status: string;     // e.g. VERIFIED / CONFIRMED / PASS
}

export interface SSCPReceipt {
  stateRootHash: string;
  claimLedgerRootHash: string;
  toolLogRootHash: string;
  gateRootHash: string;
  evidenceTier: EvidenceTier;
  leafCount: number;
  hashAlg: "SHA-256";
  tsUtc: number;
  allGatesPass: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** CT-style domain separation: leaf prefix 0x00, node prefix 0x01. */
async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex("EMPTY");
  let level = await Promise.all(leaves.map((l) => sha256Hex("\x00" + l)));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(await sha256Hex("\x01" + a + b));
    }
    level = next;
  }
  return level[0];
}

export interface BuildReceiptInput {
  claims: SSCPLeaf[];
  tools: SSCPLeaf[];
  gates: SSCPLeaf[];
  evidence: SSCPLeaf[];
  evidenceTier: EvidenceTier;
  allGatesPass: boolean;
}

const leafStr = (l: SSCPLeaf) => `${l.domain}|${l.status}|${l.text}`;

export async function buildSSCPReceipt(input: BuildReceiptInput): Promise<SSCPReceipt> {
  const claimRoot = await merkleRoot(input.claims.map(leafStr));
  const toolRoot = await merkleRoot(input.tools.map(leafStr));
  const gateRoot = await merkleRoot(input.gates.map(leafStr));
  const evidenceRoot = await merkleRoot(input.evidence.map(leafStr));
  const stateRoot = await merkleRoot([claimRoot, toolRoot, gateRoot, evidenceRoot]);
  return {
    stateRootHash: stateRoot,
    claimLedgerRootHash: claimRoot,
    toolLogRootHash: toolRoot,
    gateRootHash: gateRoot,
    evidenceTier: input.evidenceTier,
    leafCount: input.claims.length + input.tools.length + input.gates.length + input.evidence.length,
    hashAlg: "SHA-256",
    tsUtc: Date.now(),
    allGatesPass: input.allGatesPass,
  };
}

/** Short display form of a hash: first 8 + last 4. */
export function shortHash(h: string): string {
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}
