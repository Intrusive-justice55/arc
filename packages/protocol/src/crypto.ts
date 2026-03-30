/**
 * E2E encryption utilities for agent remote control.
 *
 * Provides AES-256-GCM encryption/decryption and key management primitives.
 * Uses the Web Crypto API (available in both Node.js 18+ and browsers).
 *
 * Key hierarchy:
 *   - Session Encryption Key (SEK): random AES-256 key per session
 *   - Wrapping Key (WK): derived externally (passkey PRF, passphrase, etc.)
 *   - SEK is wrapped with WK using AES-KW, stored server-side
 *   - Traces/commands are encrypted with SEK using AES-256-GCM
 *
 * OSS mode: SEK derived from sessionSecret via HKDF (relay is trusted)
 * Hosted mode: SEK is random, wrapped by passkey-derived WK (zero-knowledge)
 */

// Use globalThis.crypto for cross-platform (Node 18+ and browsers)
const subtle = globalThis.crypto.subtle;

// ─── Key Generation ────────────────────────────────────────────────

/** Generate a random AES-256 session encryption key. */
export async function generateSessionKey(): Promise<CryptoKey> {
  return subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for wrapping
    ["encrypt", "decrypt"],
  );
}

/** Generate a random 12-byte nonce for AES-GCM. */
export function generateNonce(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(12));
}

// ─── HKDF Key Derivation (OSS mode) ───────────────────────────────

/**
 * Derive an AES-256-GCM key from a session secret using HKDF-SHA256.
 * Used in OSS mode where the session secret is the shared secret.
 */
export async function deriveKeyFromSecret(
  sessionSecret: string,
  salt: string = "",
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(sessionSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      info: encoder.encode("arc-e2e-v1"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── AES-GCM Encrypt / Decrypt ────────────────────────────────────

export interface EncryptedPayload {
  /** Base64-encoded ciphertext (includes GCM auth tag). */
  ciphertext: string;
  /** Base64-encoded 12-byte nonce. */
  nonce: string;
}

/**
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * The sessionId is bound as additional authenticated data (AAD)
 * to prevent cross-session replay.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: unknown,
  sessionId: string,
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const nonce = generateNonce();
  const data = encoder.encode(JSON.stringify(plaintext));

  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce as unknown as ArrayBuffer,
      additionalData: encoder.encode(sessionId) as unknown as ArrayBuffer,
    },
    key,
    data,
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    nonce: bufferToBase64(nonce),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload back to the original value.
 */
export async function decrypt<T = unknown>(
  key: CryptoKey,
  payload: EncryptedPayload,
  sessionId: string,
): Promise<T> {
  const encoder = new TextEncoder();
  const ciphertext = base64ToBuffer(payload.ciphertext);
  const nonce = base64ToBuffer(payload.nonce);

  const plaintext = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce as unknown as ArrayBuffer,
      additionalData: encoder.encode(sessionId) as unknown as ArrayBuffer,
    },
    key,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

// ─── Key Wrapping (Hosted mode) ───────────────────────────────────

/**
 * Import raw key bytes as an AES-KW wrapping key.
 * Used with passkey PRF output or passphrase-derived bytes.
 */
export async function importWrappingKey(rawBytes: ArrayBuffer): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    rawBytes,
    { name: "AES-KW" },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/**
 * Derive a wrapping key from a passphrase using PBKDF2.
 * Fallback for enterprise users who prefer a passphrase over passkeys.
 */
export async function deriveWrappingKeyFromPassphrase(
  passphrase: string,
  salt: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 600_000, // OWASP 2023 recommendation
    },
    keyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Wrap (encrypt) a session encryption key for server-side storage. */
export async function wrapSessionKey(
  wrappingKey: CryptoKey,
  sessionKey: CryptoKey,
): Promise<string> {
  const wrapped = await subtle.wrapKey("raw", sessionKey, wrappingKey, "AES-KW");
  return bufferToBase64(wrapped);
}

/** Unwrap (decrypt) a session encryption key from server-side storage. */
export async function unwrapSessionKey(
  wrappingKey: CryptoKey,
  wrappedKeyBase64: string,
): Promise<CryptoKey> {
  return subtle.unwrapKey(
    "raw",
    base64ToBuffer(wrappedKeyBase64),
    wrappingKey,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    false, // not extractable after unwrap
    ["encrypt", "decrypt"],
  );
}

/** Export a CryptoKey to base64 for transport/storage. */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await subtle.exportKey("raw", key);
  return bufferToBase64(raw);
}

/** Import a base64-encoded AES-GCM key. */
export async function importSessionKey(base64Key: string): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    base64ToBuffer(base64Key),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── Base64 Helpers ────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Use btoa in browsers, Buffer in Node.js
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBuffer(base64: string): ArrayBuffer {
  // Use atob in browsers, Buffer in Node.js
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  return Buffer.from(base64, "base64").buffer;
}
