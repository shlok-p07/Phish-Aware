import * as client from "openid-client";
import type { OidcDiscoveryMetadata, SsoConnectionDoc } from "@/db";
import { decryptSecret } from "@/server/secretBox";
import { HttpError } from "@/server/http";

/**
 * OIDC discovery + the openid-client Configuration cache.
 *
 * Everything that talks to an IdP over the network lives here and rethrows as
 * an HttpError. That matters because withErrorHandling's
 * isDatabaseUnavailableError substring-matches "connect" and "timed out", so a
 * raw ECONNREFUSED from a token endpoint would otherwise be reported to the
 * user as "Database unavailable".
 */

const DISCOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONFIG_CACHE_TTL_MS = 60 * 60 * 1000;

const globalForOidc = globalThis as unknown as {
  _oidcConfigCache?: Map<string, { config: client.Configuration; fetchedAt: number }>;
};

// Cached on globalThis so dev hot-reload doesn't re-discover on every edit --
// same idiom as the Mongo client in src/db/client.ts.
const configCache = (globalForOidc._oidcConfigCache ??= new Map());

export class SsoConfigError extends Error {}

/**
 * Reject issuers we can never validate against.
 *
 * Entra's multi-tenant "common" endpoint publishes a literal "{tenantid}"
 * placeholder as its issuer, so the `iss` claim can never equal what's
 * configured. Better to refuse at save time than to fail every sign-in.
 */
export function validateIssuer(raw: string): string {
  const issuer = raw.trim();
  if (!issuer) {
    throw new SsoConfigError("Issuer URL is required");
  }
  if (issuer.includes("{") || issuer.includes("}")) {
    throw new SsoConfigError(
      "That issuer contains a placeholder like {tenantid}. Use your tenant-specific issuer URL instead.",
    );
  }
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new SsoConfigError("Issuer must be a full URL, e.g. https://example.okta.com");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new SsoConfigError("Issuer must use https");
  }
  return issuer;
}

function toStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

/** Fetch /.well-known/openid-configuration and keep only what we use. */
export async function discoverMetadata(
  issuer: string,
  clientId: string,
  clientSecret: string,
): Promise<{ config: client.Configuration; metadata: OidcDiscoveryMetadata }> {
  let config: client.Configuration;
  try {
    config = await client.discovery(new URL(issuer), clientId, clientSecret);
  } catch (err) {
    // Strip the trailing slash when echoing the URL back. Auth0 issuers keep
    // one, so naive concatenation would render "...auth0.com//.well-known/..."
    // and send the admin hunting for a double-slash bug that isn't there.
    const wellKnown = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
    throw new HttpError(
      400,
      `Couldn't reach that identity provider's discovery document (${wellKnown}). ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
  }

  const raw = config.serverMetadata();
  if (!raw.authorization_endpoint || !raw.token_endpoint || !raw.jwks_uri) {
    throw new HttpError(
      400,
      "That provider's discovery document is missing an authorization, token, or JWKS endpoint.",
    );
  }

  return {
    config,
    metadata: {
      issuer: raw.issuer,
      authorization_endpoint: raw.authorization_endpoint,
      token_endpoint: raw.token_endpoint,
      jwks_uri: raw.jwks_uri,
      userinfo_endpoint: raw.userinfo_endpoint ?? null,
      token_endpoint_auth_methods_supported: toStringArray(
        raw.token_endpoint_auth_methods_supported,
      ),
      id_token_signing_alg_values_supported: toStringArray(
        raw.id_token_signing_alg_values_supported,
      ),
      code_challenge_methods_supported: toStringArray(raw.code_challenge_methods_supported),
    },
  };
}

/**
 * The Configuration for a connection, from cache when possible.
 *
 * The cache key includes configVersion, so any admin save invalidates it
 * without a restart. The Configuration holds jose's createRemoteJWKSet, which
 * caches the JWKS and refetches on an unknown `kid` with a built-in cooldown --
 * exactly the right key-rotation behavior, for free.
 */
export async function configurationFor(
  connection: SsoConnectionDoc,
): Promise<client.Configuration> {
  const key = `${connection._id.toString()}:${connection.configVersion}`;
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
    // Belt and braces alongside serverExternalPackages (see next.config.ts): if
    // this entry was built under a different copy of the openid-client module,
    // its class identity won't match ours and authorizationCodeGrant() would
    // reject it. Rebuilding is cheap next to debugging that error.
    if (cached.config instanceof client.Configuration) {
      return cached.config;
    }
    configCache.delete(key);
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(connection.clientSecretEnc);
  } catch {
    // Never log the envelope or the key. Wrong/rotated APP_ENCRYPTION_KEY.
    throw new HttpError(503, "The stored SSO client secret could not be decrypted.");
  }

  const stale =
    connection.discovery === null ||
    connection.discoveryFetchedAt === null ||
    Date.now() - connection.discoveryFetchedAt.getTime() > DISCOVERY_MAX_AGE_MS;

  let config: client.Configuration;
  if (stale) {
    config = (await discoverMetadata(connection.issuer, connection.clientId, clientSecret)).config;
  } else {
    // Build from the stored snapshot to skip a discovery round trip on cold
    // start. jose still fetches the JWKS lazily from jwks_uri.
    config = new client.Configuration(
      connection.discovery as unknown as client.ServerMetadata,
      connection.clientId,
      clientSecret,
    );
  }

  // Bounded so a single misbehaving tenant can't grow this without limit.
  if (configCache.size > 200) {
    configCache.clear();
  }
  configCache.set(key, { config, fetchedAt: Date.now() });
  return config;
}

export function invalidateConfigCache(connectionId: string): void {
  for (const key of configCache.keys()) {
    if (key.startsWith(`${connectionId}:`)) {
      configCache.delete(key);
    }
  }
}
