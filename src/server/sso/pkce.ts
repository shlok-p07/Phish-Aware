import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE (RFC 7636) plus the two other single-use values an authorization request
 * carries. All three are opaque randoms; only the verifier ever needs to stay
 * secret, and it never leaves the server.
 */

/** 32 random bytes -> 43 base64url chars, inside RFC 7636's 43-128 range. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Ties the callback back to the flow we started, and to the browser that started it. */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

/** Replayed into the ID token by the IdP, so a stolen token can't be reused. */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
