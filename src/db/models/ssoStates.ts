import { ObjectId } from "mongodb";
import { getCollection } from "../client";

/**
 * One in-flight OIDC authorization request. App-internal and short-lived, so it
 * skips SpecConventions and the named-PK convention -- same as `sessions`.
 *
 * These live in Mongo rather than a cookie because findOneAndDelete({ state })
 * is an atomic single-use consume: a replayed callback URL finds nothing and is
 * rejected. A cookie cannot give you that. The code verifier also never needs
 * to leave the server, and a signed cookie would mean a second app secret.
 *
 * A small cookie holding only `state` is still set alongside this row, to bind
 * the callback to the browser that started the flow (login CSRF).
 */
export interface SsoStateDoc {
  _id: ObjectId;
  state: string;
  nonce: string;
  codeVerifier: string;
  orgId: ObjectId;
  connectionId: ObjectId;
  /** Already run through safeRedirectPath -- a relative path, never an absolute URL. */
  redirectTo: string;
  emailHint: string | null;
  /** Started from the admin "Test sign-in" button: the callback reports, it never mints a session. */
  isTest: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export type InsertSsoState = Omit<SsoStateDoc, "_id">;

export const SSO_STATES_COLLECTION = "ssoStates";

/** Mongo's TTL monitor only runs about once a minute, so callers must also check expiresAt. */
export const SSO_STATE_TTL_MS = 10 * 60 * 1000;

export function ssoStatesCollection() {
  return getCollection<SsoStateDoc>(SSO_STATES_COLLECTION);
}
