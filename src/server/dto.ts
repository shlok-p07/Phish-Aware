import type { UserDoc } from "@/db";

export function toUserDto(user: UserDoc) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? null,
    isGuest: user.isGuest,
    level: user.level as "beginner" | "intermediate" | "advanced",
    xp: user.xp,
    streak: user.streak,
    badges: user.badges,
    calibrationScore: user.calibrationScore,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
}
