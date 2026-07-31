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
    calibrationScore: user.calibrationScore,
    department: user.department,
    workType: user.workType,
    ageRange: user.ageRange,
    phishingAwarenessScore: user.phishingAwarenessScore,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
}
