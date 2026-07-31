import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * One organization's OIDC identity provider.
 *
 * Kept out of `organizations` on purpose. Every existing org read is an
 * unprojected findOne(), so an encrypted client secret living on that document
 * would already be in memory in three handlers, with only toOrgDto()'s field
 * whitelist between it and the wire. A separate collection makes exposure
 * require an explicit, greppable query. Same precedent as `sessions`.
 */

/** Cosmetic, except that "google" additionally enables the `hd` claim check. */
export type SsoProviderKind = "okta" | "entra" | "google" | "auth0" | "generic";

/** The subset of /.well-known/openid-configuration this app actually uses. */
export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string | null;
  token_endpoint_auth_methods_supported: string[] | null;
  id_token_signing_alg_values_supported: string[] | null;
  code_challenge_methods_supported: string[] | null;
}

export interface SsoConnectionDoc extends SpecConventions {
  _id: ObjectId;
  ssoConnectionId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId;
  providerKind: SsoProviderKind;
  /** Exactly as the IdP publishes it -- this is the `iss` we require in the ID token. */
  issuer: string;
  clientId: string;
  /** AES-256-GCM envelope from src/server/secretBox.ts. Never sent to a client, never logged. */
  clientSecretEnc: string;
  /** Appended to the mandatory "openid email profile". */
  extraScopes: string[];
  /** Lowercased bare domains. The source of truth for email-domain -> org routing. */
  allowedDomains: string[];
  requireVerifiedEmail: boolean;
  enabled: boolean;
  /**
   * Cached discovery document, so a cold start skips a round trip to the IdP.
   * Named `discovery` rather than `metadata` because SpecConventions already
   * owns that field name and specDefaults() would silently clobber it.
   */
  discovery: OidcDiscoveryMetadata | null;
  discoveryFetchedAt: Date | null;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  /** Bumped on every config write; part of the in-process Configuration cache key. */
  configVersion: number;
}

export type InsertSsoConnection = Omit<SsoConnectionDoc, "_id">;

export const SSO_CONNECTIONS_COLLECTION = "ssoConnections";

export function ssoConnectionsCollection() {
  return getCollection<SsoConnectionDoc>(SSO_CONNECTIONS_COLLECTION);
}
