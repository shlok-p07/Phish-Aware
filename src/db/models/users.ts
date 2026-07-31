import { ObjectId } from "mongodb";
import { getCollection } from "../client";
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
  department: string | null;
  workType: string | null;
  ageRange: string | null;
  // Derived from onboarding diagnostic accuracy; drives generated-scenario
  // difficulty. Distinct from calibrationScore (confidence-vs-correctness).
  phishingAwarenessScore: number;
  onboardingCompleted: boolean;
  role: OrgRole;
  status: UserStatus;
  // In the shared spec's validator but was never actually typed/set anywhere
  // in this app's code until now -- set on every successful login.
  lastLoginAt: Date | null;
}

export type InsertUser = Omit<UserDoc, "_id">;

export const USERS_COLLECTION = "users";

export function usersCollection() {
  return getCollection<UserDoc>(USERS_COLLECTION);
}
