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
