import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) {
    return false;
  }
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  const storedKey = Buffer.from(hashHex, "hex");
  if (storedKey.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * A 6-digit code for the password-reset flow. Stored as a hash (hashPassword),
 * never in plain text.
 *
 * Rejection sampling rather than `% 1_000_000`. Three random bytes span
 * 0..16_777_215, which is not a whole number of millions: taking the remainder
 * left every code below 777_216 about 6% likelier than the rest, so a third of
 * the keyspace carried more than its share of the probability mass. Discarding
 * the short tail above the largest exact multiple makes the draw uniform, and
 * the loop is expected to run 1.05 times.
 */
const RESET_CODE_RANGE = 1_000_000;
/** Largest multiple of the range that fits in three bytes; above it, redraw. */
const RESET_CODE_LIMIT = Math.floor(0x1000000 / RESET_CODE_RANGE) * RESET_CODE_RANGE;

export function generateResetCode(): string {
  let draw: number;
  do {
    draw = randomBytes(3).readUIntBE(0, 3);
  } while (draw >= RESET_CODE_LIMIT);
  return (draw % RESET_CODE_RANGE).toString().padStart(6, "0");
}
