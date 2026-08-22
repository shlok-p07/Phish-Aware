import { NextRequest } from "next/server";
import { ObjectId, MongoServerError } from "mongodb";
import {
  ssoConnectionsCollection,
  organizationsCollection,
  specDefaults,
  type SsoConnectionDoc,
  type SsoProviderKind,
} from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/server/secretBox";
import { ssoRedirectUri } from "@/server/siteUrl";
import { parseDomainInput } from "@/server/sso/domain";
import { discoverMetadata, validateIssuer, SsoConfigError, invalidateConfigCache } from "@/server/sso/oidc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVIDER_KINDS: SsoProviderKind[] = ["okta", "entra", "google", "auth0", "generic"];

function toDto(connection: SsoConnectionDoc | null) {
  return {
    configured: connection !== null,
    serverConfigured: isEncryptionConfigured(),
    redirectUri: ssoRedirectUri(),
    enabled: connection?.enabled ?? false,
    issuer: connection?.issuer ?? "",
    clientId: connection?.clientId ?? "",
    // The secret itself never leaves the server -- the UI shows a placeholder
    // and sends nothing back unless the admin is deliberately replacing it.
    hasClientSecret: Boolean(connection?.clientSecretEnc),
    providerKind: connection?.providerKind ?? ("generic" as SsoProviderKind),
    allowedDomains: connection?.allowedDomains ?? [],
    requireVerifiedEmail: connection?.requireVerifiedEmail ?? true,
    lastTestAt: connection?.lastTestAt?.toISOString() ?? null,
    lastTestOk: connection?.lastTestOk ?? null,
    lastTestError: connection?.lastTestError ?? null,
  };
}

/**
 * The allowed-domain list, with anything unusable reported rather than dropped.
 *
 * This used only to strip a leading "@", so "someone@example.com" was stored
 * verbatim -- and since discovery matches a domain list exactly against an
 * email's domain, that entry could never match. SSO simply never appeared, with
 * nothing anywhere to say why. Three organisations have a full address in their
 * domain field, so this is what people type.
 */
function parseDomains(input: unknown): { domains: string[]; rejected: string[] } {
  const list = Array.isArray(input) ? input : String(input ?? "").split(",");
  const domains = new Set<string>();
  const rejected: string[] = [];
  for (const entry of list) {
    const raw = String(entry).trim();
    if (!raw) continue;
    const parsed = parseDomainInput(raw);
    if (parsed) domains.add(parsed);
    else rejected.push(raw);
  }
  return { domains: [...domains], rejected };
}

/** Mirror the provider onto the org so GET /api/org can report ssoEnabled with no extra read. */
async function mirrorToOrg(orgId: ObjectId, providerKind: string | null) {
  const orgs = await organizationsCollection();
  await orgs.updateOne(
    { _id: orgId },
    { $set: { ssoProvider: providerKind, updatedAt: new Date() } },
  );
}

export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const connections = await ssoConnectionsCollection();
  const connection = await connections.findOne({ orgId: admin.orgId });
  return json(toDto(connection));
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  if (!isEncryptionConfigured()) {
    return error(
      503,
      "SSO can't be configured: this server is missing APP_ENCRYPTION_KEY. Ask an operator to set one.",
    );
  }

  const body = (await readJsonBody(req)) as {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    providerKind?: SsoProviderKind;
    allowedDomains?: string[] | string;
    requireVerifiedEmail?: boolean;
    enabled?: boolean;
  };

  const connections = await ssoConnectionsCollection();
  const existing = await connections.findOne({ orgId: admin.orgId });

  let issuer: string;
  try {
    issuer = validateIssuer(body.issuer ?? "");
  } catch (err) {
    return error(400, err instanceof SsoConfigError ? err.message : "Invalid issuer");
  }

  const clientId = body.clientId?.trim();
  if (!clientId) {
    return error(400, "Client ID is required");
  }

  // Blank means "keep what's stored" -- the UI never round-trips the plaintext,
  // so an admin editing the domain list mustn't have to retype the secret.
  const rawSecret = body.clientSecret?.trim();
  if (!rawSecret && !existing?.clientSecretEnc) {
    return error(400, "Client secret is required");
  }

  const { domains: allowedDomains, rejected } = parseDomains(body.allowedDomains);
  if (rejected.length > 0) {
    // Named, because a silently-dropped entry is how a connection ends up
    // enabled but matching nothing.
    return error(
      400,
      `Not usable as an email domain: ${rejected.join(", ")}. Use the domain on its own, like example.com.`,
    );
  }
  const enabled = body.enabled ?? false;
  if (enabled && allowedDomains.length === 0) {
    return error(
      400,
      "Add at least one allowed email domain before enabling single sign-on.",
    );
  }

  const clientSecretEnc = rawSecret ? encryptSecret(rawSecret) : existing!.clientSecretEnc;
  let clientSecret: string;
  try {
    clientSecret = rawSecret ?? decryptSecret(existing!.clientSecretEnc);
  } catch {
    return error(
      503,
      "The stored client secret can't be decrypted. APP_ENCRYPTION_KEY may have changed. Re-enter the secret to fix this.",
    );
  }

  // Verify the config actually works before storing it -- also populates the
  // discovery snapshot so the first real sign-in skips a round trip.
  const { metadata } = await discoverMetadata(issuer, clientId, clientSecret);
  if (metadata.issuer !== issuer) {
    return error(
      400,
      `That provider reports its issuer as "${metadata.issuer}". Use exactly that value (watch for a trailing slash).`,
    );
  }

  const now = new Date();
  const providerKind: SsoProviderKind = PROVIDER_KINDS.includes(body.providerKind as SsoProviderKind)
    ? (body.providerKind as SsoProviderKind)
    : "generic";

  const fields = {
    orgId: admin.orgId,
    providerKind,
    issuer,
    clientId,
    clientSecretEnc,
    extraScopes: existing?.extraScopes ?? [],
    allowedDomains,
    requireVerifiedEmail: body.requireVerifiedEmail ?? true,
    enabled,
    discovery: metadata,
    discoveryFetchedAt: now,
    lastTestAt: existing?.lastTestAt ?? null,
    lastTestOk: existing?.lastTestOk ?? null,
    lastTestError: existing?.lastTestError ?? null,
    configVersion: (existing?.configVersion ?? 0) + 1,
    updatedAt: now,
  };

  let saved: SsoConnectionDoc;
  try {
    if (existing) {
      const updated = await connections.findOneAndUpdate(
        { _id: existing._id },
        { $set: fields },
        { returnDocument: "after" },
      );
      saved = updated!;
    } else {
      const id = new ObjectId();
      saved = { _id: id, ssoConnectionId: id, ...fields, ...specDefaults(now) };
      await connections.insertOne(saved);
    }
  } catch (err) {
    // The unique-when-enabled index on allowedDomains: another org already
    // routes one of these domains to its own IdP.
    if (err instanceof MongoServerError && err.code === 11000) {
      return error(409, "Another organization has already claimed one of those email domains.");
    }
    throw err;
  }

  invalidateConfigCache(saved._id.toString());
  await mirrorToOrg(admin.orgId, enabled ? providerKind : null);

  return json(toDto(saved));
});

export const DELETE = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const connections = await ssoConnectionsCollection();
  const existing = await connections.findOneAndDelete({ orgId: admin.orgId });
  if (existing) {
    invalidateConfigCache(existing._id.toString());
  }
  await mirrorToOrg(admin.orgId, null);
  return new Response(null, { status: 204 });
});
