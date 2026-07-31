import { ssoConnectionsCollection } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { decryptSecret, isEncryptionConfigured } from "@/server/secretBox";
import { ssoRedirectUri } from "@/server/siteUrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "pass" | "warn" | "fail";
interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return res.json();
}

/**
 * Server-side preflight against the configured IdP.
 *
 * Catches the setup mistakes that would otherwise surface as an opaque failure
 * halfway through a real sign-in -- above all the trailing-slash issuer
 * mismatch, which is by far the most common one.
 */
export const POST = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const connections = await ssoConnectionsCollection();
  const connection = await connections.findOne({ orgId: admin.orgId });
  if (!connection) {
    return error(404, "No SSO connection is configured for this organization");
  }
  if (!isEncryptionConfigured()) {
    return error(503, "This server is missing APP_ENCRYPTION_KEY.");
  }

  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(connection.clientSecretEnc);
  } catch {
    add("secret", "Stored client secret", "fail", "Couldn't decrypt it. Re-enter the secret.");
    await recordResult(connection._id, false, "client secret could not be decrypted");
    return json({ ok: false, checks });
  }

  // 1. Discovery reachable
  const wellKnown = `${connection.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  let doc: Record<string, unknown>;
  try {
    doc = (await fetchJson(wellKnown)) as Record<string, unknown>;
    add("discovery", "Discovery document", "pass", `Fetched ${wellKnown}`);
  } catch (err) {
    add(
      "discovery",
      "Discovery document",
      "fail",
      `Couldn't fetch ${wellKnown}: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    await recordResult(connection._id, false, "discovery document unreachable");
    return json({ ok: false, checks });
  }

  // 2. Issuer exact match -- the trailing-slash trap
  const reported = typeof doc.issuer === "string" ? doc.issuer : "";
  if (reported === connection.issuer) {
    add("issuer", "Issuer matches", "pass", reported);
  } else {
    add(
      "issuer",
      "Issuer matches",
      "fail",
      `The provider reports "${reported}" but this connection is set to "${connection.issuer}". These must match character for character.`,
    );
  }

  // 3. Required endpoints
  const authEndpoint = typeof doc.authorization_endpoint === "string" ? doc.authorization_endpoint : null;
  const tokenEndpoint = typeof doc.token_endpoint === "string" ? doc.token_endpoint : null;
  const jwksUri = typeof doc.jwks_uri === "string" ? doc.jwks_uri : null;
  const missing = [
    !authEndpoint && "authorization_endpoint",
    !tokenEndpoint && "token_endpoint",
    !jwksUri && "jwks_uri",
  ].filter(Boolean);
  add(
    "endpoints",
    "Required endpoints",
    missing.length === 0 ? "pass" : "fail",
    missing.length === 0 ? "Authorization, token, and JWKS endpoints present" : `Missing: ${missing.join(", ")}`,
  );

  // 4. PKCE S256 -- a warn, not a fail: plenty of IdPs support it silently.
  const pkceMethods = Array.isArray(doc.code_challenge_methods_supported)
    ? (doc.code_challenge_methods_supported as unknown[]).filter((m): m is string => typeof m === "string")
    : null;
  if (pkceMethods === null) {
    add("pkce", "PKCE (S256)", "warn", "The provider doesn't advertise code_challenge_methods_supported. Most still support S256.");
  } else if (pkceMethods.includes("S256")) {
    add("pkce", "PKCE (S256)", "pass", "S256 is supported");
  } else {
    add("pkce", "PKCE (S256)", "fail", `Only advertises: ${pkceMethods.join(", ") || "none"}`);
  }

  // 5. JWKS has at least one signing key
  if (jwksUri) {
    try {
      const jwks = (await fetchJson(jwksUri)) as { keys?: unknown[] };
      const count = Array.isArray(jwks.keys) ? jwks.keys.length : 0;
      add(
        "jwks",
        "Signing keys",
        count > 0 ? "pass" : "fail",
        count > 0 ? `${count} key(s) published` : "The JWKS endpoint returned no keys",
      );
    } catch (err) {
      add("jwks", "Signing keys", "fail", `Couldn't fetch the JWKS: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // 6. Client credentials.
  //
  // Send a deliberately invalid authorization_code grant. A VALID client gets
  // back invalid_grant (the code is bad, the client is fine); a bad client id
  // or secret gets invalid_client / unauthorized_client. Match on the JSON
  // error field, not the HTTP status -- some IdPs return 400 for both.
  if (tokenEndpoint) {
    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: "phishaware-preflight-invalid-code",
        redirect_uri: ssoRedirectUri(),
        code_verifier: "phishaware-preflight-verifier-value-padding-to-43-chars",
        client_id: connection.clientId,
        client_secret: clientSecret,
      });
      const result = (await fetchJson(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })) as { error?: string; error_description?: string };

      if (result.error === "invalid_client" || result.error === "unauthorized_client") {
        add("credentials", "Client credentials", "fail", "The provider rejected this client ID / secret.");
      } else {
        add(
          "credentials",
          "Client credentials",
          "pass",
          "The provider accepted the client and rejected only the dummy code, as expected.",
        );
      }
    } catch (err) {
      add(
        "credentials",
        "Client credentials",
        "warn",
        `Couldn't reach the token endpoint: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  const ok = checks.every((c) => c.status !== "fail");
  await recordResult(connection._id, ok, ok ? null : checks.find((c) => c.status === "fail")!.detail);

  return json({ ok, checks });
});

async function recordResult(connectionId: import("mongodb").ObjectId, ok: boolean, err: string | null) {
  const connections = await ssoConnectionsCollection();
  await connections.updateOne(
    { _id: connectionId },
    // A normalized message only -- never the secret, the envelope, or raw IdP output.
    { $set: { lastTestAt: new Date(), lastTestOk: ok, lastTestError: err, updatedAt: new Date() } },
  );
}
