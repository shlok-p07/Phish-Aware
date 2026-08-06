import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SurveyFeatures } from "@/lib/onboarding-survey";
import type { SpecConventions } from "./specConventions";

export type OrgRole = "admin" | "manager" | "employee";
export type UserStatus = "invited" | "active" | "disabled";

export interface UserDoc extends SpecConventions {
  _id: ObjectId;
  userId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId | null;
  name: string;
  email: string | null;
  passwordHash: string | null;
  isGuest: boolean;
  level: string;
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  badges: string[];
  calibrationScore: number;
  // From the intro onboarding survey -- used to target generated scenarios
  // (department/persuasion-tactic mapping, see src/server/attackProfiles.ts).
  // Null until onboarding is completed (or for guests, who skip it).
  // `department` is the one exception: an org invitation can pin it up front,
  // in which case the survey doesn't ask and this is set at accept time.
  department: string | null;
  workType: string | null;
  // The whole intro survey in feature form. department/workType above are
  // denormalized out of it because the scenario generator reads them on every
  // request; the rest is kept whole for the risk model.
  surveyFeatures: SurveyFeatures | null;
  // Predicted from onboarding survey + diagnostic results; drives the initial
  // user level and generated-scenario difficulty. Distinct from calibration.
  phishingAwarenessScore: number;
  /** Optional for legacy rows created before model provenance was recorded. */
  phishingAwarenessModelVersion?: string | null;
  phishingAwarenessComputedAt?: Date | null;
  onboardingCompleted: boolean;
  role: OrgRole;
  status: UserStatus;
  // In the shared spec's validator but was never actually typed/set anywhere
  // in this app's code until now -- set on every successful login.
  lastLoginAt: Date | null;
  // Password-reset flow: a hashed 6-digit code (same scrypt hash/verify as
  // passwordHash, see src/server/password.ts) plus its expiry. Both null
  // whenever there's no reset in progress. Never store the raw code.
  passwordResetCodeHash: string | null;
  passwordResetExpiresAt: Date | null;
  // Brute-force lockout (see src/server/loginLockout.ts). Consecutive failed
  // password attempts; reset to 0 on any successful sign-in or password reset.
  // All three are optional for legacy rows created before the lockout existed
  // -- read them through the helpers, which default to "no failures, no lock".
  failedLoginAttempts?: number;
  /** Set when the attempt counter trips; sign-in is refused until it passes. */
  lockedUntil?: Date | null;
  /**
   * Outlives the lock: once an account has been locked out, the right password
   * alone is no longer enough -- it has to be reset before signing in again.
   */
  mustResetPassword?: boolean;
}

export type InsertUser = Omit<UserDoc, "_id">;

export const USERS_COLLECTION = "users";

export function usersCollection() {
  return getCollection<UserDoc>(USERS_COLLECTION);
}
