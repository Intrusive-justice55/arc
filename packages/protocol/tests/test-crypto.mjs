import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Dynamic import since the crypto module uses Web Crypto API
const {
  generateSessionKey,
  generateNonce,
  deriveKeyFromSecret,
  encrypt,
  decrypt,
  wrapSessionKey,
  unwrapSessionKey,
  importWrappingKey,
  exportKey,
  importSessionKey,
} = await import("../dist/crypto.js");

describe("E2E Crypto Utilities", () => {
  describe("generateSessionKey", () => {
    it("generates an AES-256-GCM key", async () => {
      const key = await generateSessionKey();
      assert.ok(key);
      assert.equal(key.algorithm.name, "AES-GCM");
      assert.equal(key.algorithm.length, 256);
    });

    it("generates different keys each time", async () => {
      const key1 = await generateSessionKey();
      const key2 = await generateSessionKey();
      const raw1 = await exportKey(key1);
      const raw2 = await exportKey(key2);
      assert.notEqual(raw1, raw2);
    });
  });

  describe("generateNonce", () => {
    it("returns 12 bytes", () => {
      const nonce = generateNonce();
      assert.equal(nonce.length, 12);
    });

    it("generates different nonces each time", () => {
      const n1 = generateNonce();
      const n2 = generateNonce();
      assert.notDeepEqual(n1, n2);
    });
  });

  describe("deriveKeyFromSecret", () => {
    it("derives a key from a session secret", async () => {
      const key = await deriveKeyFromSecret("my-session-secret", "salt123");
      assert.ok(key);
      assert.equal(key.algorithm.name, "AES-GCM");
    });

    it("same inputs produce same key", async () => {
      const key1 = await deriveKeyFromSecret("secret", "salt");
      const key2 = await deriveKeyFromSecret("secret", "salt");
      // Keys aren't extractable by default from HKDF, but we can verify
      // by encrypting the same data and checking it decrypts with the other
      const encrypted = await encrypt(key1, "test data", "session1");
      const decrypted = await decrypt(key2, encrypted, "session1");
      assert.equal(decrypted, "test data");
    });

    it("different secrets produce different keys", async () => {
      const key1 = await deriveKeyFromSecret("secret-a", "salt");
      const key2 = await deriveKeyFromSecret("secret-b", "salt");
      const encrypted = await encrypt(key1, "test data", "session1");
      await assert.rejects(
        () => decrypt(key2, encrypted, "session1"),
        "Should fail to decrypt with different key",
      );
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips a string", async () => {
      const key = await generateSessionKey();
      const plaintext = "hello world";
      const encrypted = await encrypt(key, plaintext, "session-1");
      const decrypted = await decrypt(key, encrypted, "session-1");
      assert.equal(decrypted, plaintext);
    });

    it("round-trips an object", async () => {
      const key = await generateSessionKey();
      const data = { type: "agent_message", content: "hello", role: "assistant" };
      const encrypted = await encrypt(key, data, "session-1");
      const decrypted = await decrypt(key, encrypted, "session-1");
      assert.deepEqual(decrypted, data);
    });

    it("produces base64 ciphertext and nonce", async () => {
      const key = await generateSessionKey();
      const encrypted = await encrypt(key, "test", "session-1");
      assert.ok(typeof encrypted.ciphertext === "string");
      assert.ok(typeof encrypted.nonce === "string");
      assert.ok(encrypted.ciphertext.length > 0);
      assert.ok(encrypted.nonce.length > 0);
    });

    it("rejects decryption with wrong session ID (AAD mismatch)", async () => {
      const key = await generateSessionKey();
      const encrypted = await encrypt(key, "test", "session-1");
      await assert.rejects(
        () => decrypt(key, encrypted, "session-2"),
        "Should fail with wrong session ID",
      );
    });

    it("rejects decryption with wrong key", async () => {
      const key1 = await generateSessionKey();
      const key2 = await generateSessionKey();
      const encrypted = await encrypt(key1, "test", "session-1");
      await assert.rejects(
        () => decrypt(key2, encrypted, "session-1"),
        "Should fail with wrong key",
      );
    });

    it("produces different ciphertext for same plaintext (random nonce)", async () => {
      const key = await generateSessionKey();
      const enc1 = await encrypt(key, "same data", "session-1");
      const enc2 = await encrypt(key, "same data", "session-1");
      assert.notEqual(enc1.ciphertext, enc2.ciphertext);
      assert.notEqual(enc1.nonce, enc2.nonce);
    });
  });

  describe("key wrapping", () => {
    it("wraps and unwraps a session key", async () => {
      const sessionKey = await generateSessionKey();
      // Create a wrapping key from raw bytes
      const rawBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const wrappingKey = await importWrappingKey(rawBytes.buffer);

      const wrapped = await wrapSessionKey(wrappingKey, sessionKey);
      assert.ok(typeof wrapped === "string");
      assert.ok(wrapped.length > 0);

      const unwrapped = await unwrapSessionKey(wrappingKey, wrapped);
      assert.ok(unwrapped);

      // Verify the unwrapped key works
      const encrypted = await encrypt(sessionKey, "test", "s1");
      const decrypted = await decrypt(unwrapped, encrypted, "s1");
      assert.equal(decrypted, "test");
    });

    it("rejects unwrap with wrong wrapping key", async () => {
      const sessionKey = await generateSessionKey();
      const rawBytes1 = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const rawBytes2 = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const wk1 = await importWrappingKey(rawBytes1.buffer);
      const wk2 = await importWrappingKey(rawBytes2.buffer);

      const wrapped = await wrapSessionKey(wk1, sessionKey);
      await assert.rejects(
        () => unwrapSessionKey(wk2, wrapped),
        "Should fail with wrong wrapping key",
      );
    });
  });

  describe("exportKey / importSessionKey", () => {
    it("round-trips a key through export/import", async () => {
      const original = await generateSessionKey();
      const exported = await exportKey(original);
      assert.ok(typeof exported === "string");

      const imported = await importSessionKey(exported);
      // Verify imported key works for decrypt
      const encrypted = await encrypt(original, "round trip", "s1");
      const decrypted = await decrypt(imported, encrypted, "s1");
      assert.equal(decrypted, "round trip");
    });
  });
});
