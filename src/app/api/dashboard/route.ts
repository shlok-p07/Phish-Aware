import { usersCollection, attemptsCollection } from "@/db";
import { GetDashboardResponse } from "@/api-zod";
import { xpProgress } from "@/server/leveling";
import { taxonomyPerformanceAreas } from "@/server/attackProfileSelector";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";
import { reviewSummary } from "@/server/reviewSchedule";
import { percent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) {
    return error(401, "Not authenticated");
  }
  const attempts = await (await attemptsCollection()).find({ userId: user._id }).toArray();

  const taxonomyAreas = taxonomyPerformanceAreas({
    department: user.department,
    history: attempts,
  });
  // Any observed error makes an area eligible for focused practice; shared
  // engine weights rank high-confidence errors, underexposure, and recency.
  const focusAreas = taxonomyAreas
    .filter((area) => area.incorrect > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ incorrect: _incorrect, weight: _weight, ...area }) => area);
  // A strength requires an error-free classified history. Lower weakness
  // weight (generally more exposure and more recent success) ranks first.
  const strengths = taxonomyAreas
    .filter((area) => area.incorrect === 0)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 3)
    .map(({ incorrect: _incorrect, weight: _weight, ...area }) => area);

  const { xpIntoLevel, xpToNextLevel } = xpProgress(user.xp);
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.correct).length;
  const accuracyRate = totalAttempts > 0 ? percent(correctAttempts / totalAttempts) : 0;
  const retention = await reviewSummary(user._id);

  return json(
    GetDashboardResponse.parse({
      name: user.name,
      level: user.level,
      xp: user.xp,
      xpToNextLevel,
      xpIntoLevel,
      streak: user.streak,
      strengths,
      focusAreas,
      badges: user.badges,
      totalAttempts,
      accuracyRate,
      retention: {
        ...retention,
        // Zod's date-time string, not a Date: this crosses the wire.
        nextDueAt: retention.nextDueAt ? retention.nextDueAt.toISOString() : null,
      },
    }),
  );
});
