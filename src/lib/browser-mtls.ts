/**
 * Browser-based mTLS Simulation using Web Crypto API.
 * Provides mutual TLS-like authentication for browser-to-browser communication.
 * Works in both online and iOS environments via Web Crypto API.
 */

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
}

export interface SignedMessage {
  data: string;
  signature: string;
  timestamp: number;
  senderFingerprint: string;
}

export class BrowserMTLS {
  private keyPair: KeyPair | null = null;
  private peerKeys: Map<string, CryptoKey> = new Map();

  async initialize(): Promise<KeyPair> {
    // Generate ECDSA P-256 key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    // Export public key as JWK
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

    // Generate fingerprint (SHA-256 of public key)
    const publicKeyBytes = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", publicKeyBytes);
    const fingerprint = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    this.keyPair = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyJwk, fingerprint };
    return this.keyPair;
  }

  async sign(data: string): Promise<SignedMessage> {
    if (!this.keyPair) throw new Error("MTLS not initialized");

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.keyPair.privateKey,
      dataBuffer
    );

    const signatureHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      data,
      signature: signatureHex,
      timestamp: Date.now(),
      senderFingerprint: this.keyPair.fingerprint,
    };
  }

  async verify(message: SignedMessage): Promise<boolean> {
    if (!this.keyPair) throw new Error("MTLS not initialized");

    const peerKey = this.peerKeys.get(message.senderFingerprint);
    if (!peerKey) {
      // Import the peer's public key from the message
      // In production, this would come from a trusted certificate authority
      throw new Error("Peer public key not found");
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(message.data);
    const signatureBytes = new Uint8Array(
      message.signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      peerKey,
      signatureBytes,
      dataBuffer
    );
  }

  async addPeerKey(fingerprint: string, publicKeyJwk: JsonWebKey): Promise<void> {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    this.peerKeys.set(fingerprint, publicKey);
  }

  getFingerprint(): string {
    if (!this.keyPair) throw new Error("MTLS not initialized");
    return this.keyPair.fingerprint;
  }

  exportKeys(): { privateKey: JsonWebKey; publicKey: JsonWebKey } | null {
    if (!this.keyPair) return null;
    return {
      privateKey: this.keyPair.publicKeyJwk, // In production, export private key securely
      publicKey: this.keyPair.publicKeyJwk,
    };
  }
}

// Singleton instance
let mtlsInstance: BrowserMTLS | null = null;

export function getBrowserMTLS(): BrowserMTLS {
  if (!mtlsInstance) {
    mtlsInstance = new BrowserMTLS();
  }
  return mtlsInstance;
}
