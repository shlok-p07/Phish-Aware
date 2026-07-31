import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  encryptSecret,
  decryptSecret,
  isEncryptionConfigured,
  MissingEncryptionKeyError,
} from "./secretBox";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const ORIGINAL = process.env.APP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = KEY_A;
});

afterAll(() => {
  if (ORIGINAL === undefined) {
    delete process.env.APP_ENCRYPTION_KEY;
  } else {
    process.env.APP_ENCRYPTION_KEY = ORIGINAL;
  }
});

describe("secretBox", () => {
  it("round-trips a secret", () => {
    const secret = "s3cr3t-client-value";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("round-trips unicode and empty strings", () => {
    expect(decryptSecret(encryptSecret("clé—🔐"))).toBe("clé—🔐");
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("emits a versioned four-part envelope", () => {
    const parts = encryptSecret("x").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("accepts a hex key as well as base64", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("hex");
    expect(decryptSecret(encryptSecret("hex-keyed"))).toBe("hex-keyed");
  });

  it("throws when decrypting with the wrong key", () => {
    const envelope = encryptSecret("secret");
    process.env.APP_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(envelope)).toThrow();
  });

  it("throws when the auth tag has been tampered with", () => {
    const [v, iv, tag, ct] = encryptSecret("secret").split(":") as [
      string,
      string,
      string,
      string,
    ];
    const flipped = Buffer.from(tag, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, flipped.toString("base64url"), ct].join(":"))).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const [v, iv, tag, ct] = encryptSecret("secret").split(":") as [
      string,
      string,
      string,
      string,
    ];
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join(":"))).toThrow();
  });

  it("rejects a malformed envelope", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow("Malformed secret envelope");
    expect(() => decryptSecret("v1:a:b")).toThrow("Malformed secret envelope");
  });

  it("rejects an unknown envelope version", () => {
    const rest = encryptSecret("secret").split(":").slice(1).join(":");
    expect(() => decryptSecret(`v9:${rest}`)).toThrow("Unsupported secret envelope version");
  });

  it("throws MissingEncryptionKeyError when the key is unset", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(MissingEncryptionKeyError);
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("reports configured when a valid key is present", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});
