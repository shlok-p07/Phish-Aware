import type { User } from "@/db";

export function toUserDto(user: User) {
  return {
    id: user.id,
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
