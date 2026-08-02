import type { UserDoc } from "@/db";

export function toUserDto(user: UserDoc) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? null,
    // The caller's own role and membership. Without these the client can't
    // distinguish an org admin from an ordinary member, and the only available
    // proxy -- "does GET /api/org succeed?" -- is true for every member, so
    // members were shown admin navigation leading to a page that 403s.
    // `status` and `orgId` stay off the DTO; nothing in the UI needs them.
    role: user.role === "admin" ? ("admin" as const) : ("employee" as const),
    hasOrg: user.orgId !== null,
    isGuest: user.isGuest,
    level: user.level as "beginner" | "intermediate" | "advanced",
    xp: user.xp,
    streak: user.streak,
    badges: user.badges,
    // Heads up: `users.calibrationScore` is written once at signup and never
    // updated, so this reports 0 for every real user. Kept on the DTO because
    // it's a required field of the published User schema and removing it would
    // break external clients. The figure the profile UI shows is a different,
    // live one -- recomputed from attempt history by GET /api/profile/analytics.
    calibrationScore: user.calibrationScore,
    department: user.department,
    workType: user.workType,
    phishingAwarenessScore: user.phishingAwarenessScore,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
}
