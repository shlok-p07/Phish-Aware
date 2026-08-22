import { NextRequest } from "next/server";
import { ssoConnectionsCollection, organizationsCollection } from "@/db";
import { json, error, withErrorHandling, readJsonBody } from "@/server/http";
import { emailDomain } from "@/server/sso/domain";
import { isEncryptionConfigured } from "@/server/secretBox";
import { rateLimit, clientIp } from "@/server/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_SSO = { ssoAvailable: false, orgName: null, providerKind: null, startUrl: null };

/**
 * "Does this email domain have SSO?"
 *
 * Deliberately domain-granular. Two addresses at the same domain produce
 * byte-identical responses, so this can't be used to probe whether a specific
 * person has an account or an invitation -- all of that is decided after the
 * IdP has authenticated the caller. Answering "no" for an unconfigured server
 * is part of the same discipline.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const limit = rateLimit(`sso-discover:${clientIp(req.headers)}`, 20, 60_000);
  if (!limit.ok) {
    return error(429, "Too many requests. Try again shortly.");
  }

  const body = (await readJsonBody(req).catch(() => ({}))) as { email?: string };
  const domain = emailDomain(body.email ?? "");
  if (!domain || !isEncryptionConfigured()) {
    return json(NO_SSO);
  }

  const connections = await ssoConnectionsCollection();
  const connection = await connections.findOne({ enabled: true, allowedDomains: domain });
  if (!connection) {
    return json(NO_SSO);
  }

  const orgs = await organizationsCollection();
  const org = await orgs.findOne({ _id: connection.orgId }, { projection: { name: 1 } });

  return json({
    ssoAvailable: true,
    orgName: org?.name ?? null,
    providerKind: connection.providerKind,
    // A navigation target, not a fetch target -- see the note in openapi.yaml.
    startUrl: `/api/auth/sso/start?email=${encodeURIComponent(body.email!.trim())}`,
  });
});
