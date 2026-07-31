import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for secrets we must store and later read back -- today
 * only per-org SSO client secrets. AES-256-GCM so tampering is detected, not
 * just undecryptable.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const VERSION = "v1";

/**
 * Bound into every ciphertext so an envelope can't be lifted out of this field
 * and replayed somewhere else that also decrypts with the same key.
 */
const AAD = Buffer.from("phishaware:sso-client-secret");

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("APP_ENCRYPTION_KEY is not set");
    this.name = "MissingEncryptionKeyError";
  }
}

/**
 * Read the key lazily on every call, never at module load. Next evaluates the
 * whole module graph while collecting page data during `next build`, and the
 * Docker builder stage has no runtime secrets -- a module-level throw would
 * break the build. Same reasoning as MONGODB_URI in src/db/client.ts.
 */
function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new MissingEncryptionKeyError();
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** True when a usable key is configured. Used to degrade SSO gracefully. */
export function isEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns "v1:<iv>:<tag>:<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/** Throws on a wrong key, a tampered envelope, or a malformed one. */
export function decryptSecret(envelope: string): string {
  const key = encryptionKey();
  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed secret envelope");
  }
  const [version, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`Unsupported secret envelope version: ${version}`);
  }
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Malformed secret envelope");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
