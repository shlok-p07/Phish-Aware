import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * A record of what one person agreed to, and when.
 *
 * The collection was provisioned from the start and never written to, while the
 * app was already storing a sixteen-field behavioural survey, an ML-derived
 * awareness score, and every judgement a person has ever made about a message --
 * then showing an aggregate of it to their employer. That is exactly the
 * processing a consent record exists to document, and there was none.
 *
 * Two policies, because they are genuinely different asks:
 *
 * - `data_processing` covers the practice history and the awareness score: the
 *   product cannot function without it, so this is recorded at onboarding and a
 *   refusal means the account is not usable rather than degraded.
 * - `emotional_profiling` covers the persuasion-tactic weighting -- inferring
 *   which manipulations work on a specific person. That is optional, refusable,
 *   and revocable, and the product still works without it by falling back to the
 *   department-level profile.
 *
 * Versioned, because consent to one wording is not consent to a later one.
 * Append-only in effect: revoking writes revokedAt rather than deleting the row,
 * since "they agreed and later withdrew" is the thing an auditor needs to see.
 */
export type ConsentPolicy = "emotional_profiling" | "data_processing";

export interface ConsentDoc extends SpecConventions {
  _id: ObjectId;
  consentId: ObjectId; // named PK per the shared spec -- mirrors _id
  userId: ObjectId;
  /** Null for a self-signup user, who has no organization to answer to. */
  orgId: ObjectId | null;
  policyType: ConsentPolicy;
  /** The wording they saw. Consent to one version is not consent to the next. */
  policyVersion: string;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

export type InsertConsent = Omit<ConsentDoc, "_id">;

export const CONSENTS_COLLECTION = "consents";

export function consentsCollection() {
  return getCollection<ConsentDoc>(CONSENTS_COLLECTION);
}
