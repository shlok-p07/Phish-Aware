import { ObjectId } from "mongodb";
import { consentsCollection, specDefaults, type ConsentPolicy } from "@/db";

/**
 * Recording and reading consent.
 *
 * The version is part of the identity of a decision: agreeing to one wording is
 * not agreeing to a later one, so a bump means everybody is asked again rather
 * than silently carried over. That is the whole reason this is not a boolean on
 * the user document.
 */
export const CONSENT_POLICY_VERSION = "2026-08-1";

/** Every policy the product asks about, and whether it can be refused. */
export const CONSENT_POLICIES: {
  policy: ConsentPolicy;
  title: string;
  body: string;
  /** False means the product cannot function without it. */
  optional: boolean;
}[] = [
  {
    policy: "data_processing",
    title: "Practice history and awareness score",
    body:
      "We store the judgements you make about each message, and a score derived from your intro survey, so difficulty can adapt to you and your organization can see aggregate progress. Your employer sees your name, your accuracy and your department -- not the individual messages you got wrong.",
    optional: false,
  },
  {
    policy: "emotional_profiling",
    title: "Persuasion profiling",
    body:
      "We can weight which persuasion tactics -- urgency, authority, fear, reward -- are used against you personally, based on which ones have worked on you before. Declining is fine: practice then uses your department's profile instead of your own, and nothing else changes.",
    optional: true,
  },
];

export interface ConsentState {
  policy: ConsentPolicy;
  granted: boolean;
  /** True when there is no decision on the current version of this policy. */
  needsDecision: boolean;
  decidedAt: string | null;
}

/**
 * The current standing of every policy for this user.
 *
 * A decision recorded against an older version does not count as a decision,
 * which is what makes a version bump meaningful rather than decorative.
 */
export async function consentState(userId: ObjectId): Promise<ConsentState[]> {
  const rows = await (await consentsCollection())
    .find({ userId, policyVersion: CONSENT_POLICY_VERSION })
    .toArray();

  return CONSENT_POLICIES.map(({ policy }) => {
    const row = rows.find((r) => r.policyType === policy);
    // A revoked row is a decision -- a "no" -- not an absence of one.
    const granted = row ? row.granted && row.revokedAt === null : false;
    const decidedAt = row ? (row.revokedAt ?? row.grantedAt ?? row.createdAt) : null;
    return {
      policy,
      granted,
      needsDecision: !row,
      decidedAt: decidedAt ? decidedAt.toISOString() : null,
    };
  });
}

/**
 * Records a decision, replacing any earlier one for the same policy and version.
 *
 * Revoking sets revokedAt rather than deleting: "they agreed and later withdrew"
 * is precisely what an auditor needs to see, and a delete would render it as
 * "they never agreed".
 */
export async function recordConsent(input: {
  userId: ObjectId;
  orgId: ObjectId | null;
  policy: ConsentPolicy;
  granted: boolean;
}): Promise<void> {
  const consents = await consentsCollection();
  const now = new Date();
  const existing = await consents.findOne({
    userId: input.userId,
    policyType: input.policy,
    policyVersion: CONSENT_POLICY_VERSION,
  });

  if (existing) {
    await consents.updateOne(
      { _id: existing._id },
      {
        $set: {
          granted: input.granted,
          grantedAt: input.granted ? now : existing.grantedAt,
          revokedAt: input.granted ? null : now,
          updatedAt: now,
        },
      },
    );
    return;
  }

  const id = new ObjectId();
  await consents.insertOne({
    _id: id,
    consentId: id,
    userId: input.userId,
    orgId: input.orgId,
    policyType: input.policy,
    policyVersion: CONSENT_POLICY_VERSION,
    granted: input.granted,
    grantedAt: input.granted ? now : null,
    revokedAt: input.granted ? null : now,
    ...specDefaults(),
  });
}

/**
 * Whether personalised persuasion weighting is permitted for this user.
 *
 * Defaults to false -- an absent decision is not permission. The practice engine
 * falls back to the department profile, which is what makes this genuinely
 * optional rather than optional in name.
 */
export async function mayProfileEmotionally(userId: ObjectId): Promise<boolean> {
  const state = await consentState(userId);
  return state.some((s) => s.policy === "emotional_profiling" && s.granted);
}
