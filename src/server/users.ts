import { ObjectId } from "mongodb";
import { specDefaults, type OrgRole, type UserDoc, type UserStatus } from "@/db";

/**
 * A fresh user document with every gameplay field zeroed.
 *
 * Extracted because signup and invitation-accept both need the identical
 * 20-field shape, and the validators reject a document that's missing any of
 * it -- so a field added in one place and forgotten in the other fails at
 * write time rather than at review time.
 */
export function buildUserDoc(fields: {
  name: string;
  email: string | null;
  passwordHash: string | null;
  orgId?: ObjectId | null;
  role?: OrgRole;
  status?: UserStatus;
  isGuest?: boolean;
  lastLoginAt?: Date | null;
  now?: Date;
}): UserDoc {
  const now = fields.now ?? new Date();
  const id = new ObjectId();
  return {
    _id: id,
    userId: id,
    orgId: fields.orgId ?? null,
    name: fields.name,
    email: fields.email,
    passwordHash: fields.passwordHash,
    isGuest: fields.isGuest ?? false,
    level: "beginner",
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    calibrationScore: 0,
    department: null,
    workType: null,
    ageRange: null,
    phishingAwarenessScore: 0,
    onboardingCompleted: false,
    role: fields.role ?? "employee",
    status: fields.status ?? "active",
    lastLoginAt: fields.lastLoginAt ?? null,
    ...specDefaults(now),
  };
}
