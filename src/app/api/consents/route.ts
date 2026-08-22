import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import {
  CONSENT_POLICIES,
  CONSENT_POLICY_VERSION,
  consentState,
  recordConsent,
} from "@/server/consent";
import { json, error, requireUserId, withErrorHandling, readJsonBody } from "@/server/http";

export const dynamic = "force-dynamic";

/** What the current user has been asked, and what they answered. */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const state = await consentState(userId);

  return json({
    policyVersion: CONSENT_POLICY_VERSION,
    policies: CONSENT_POLICIES.map((policy) => {
      const current = state.find((s) => s.policy === policy.policy)!;
      return {
        policy: policy.policy,
        title: policy.title,
        body: policy.body,
        optional: policy.optional,
        granted: current.granted,
        needsDecision: current.needsDecision,
        decidedAt: current.decidedAt,
      };
    }),
  });
});

/**
 * Records a decision.
 *
 * A required policy cannot be declined here: the product does not function
 * without it, and pretending otherwise would leave somebody with an account that
 * silently does nothing. Withdrawing that consent is account deletion, which
 * already exists and says what it does.
 */
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = (await readJsonBody(req)) as { policy?: unknown; granted?: unknown };

  const policy = CONSENT_POLICIES.find((p) => p.policy === body.policy);
  if (!policy) {
    return error(400, "Unknown policy");
  }
  if (typeof body.granted !== "boolean") {
    return error(400, "granted must be true or false");
  }
  if (!policy.optional && !body.granted) {
    return error(
      409,
      "This one is required for the product to work. To withdraw it, delete your account.",
    );
  }

  const me = await (await usersCollection()).findOne({ _id: userId }, { projection: { orgId: 1 } });
  await recordConsent({
    userId,
    orgId: me?.orgId ?? null,
    policy: policy.policy,
    granted: body.granted,
  });

  return json({ policy: policy.policy, granted: body.granted });
});
