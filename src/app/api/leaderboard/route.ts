import { usersCollection } from "@/db";
import { GetLeaderboardResponse } from "@/api-zod";
import { getUserIdFromRequest } from "@/server/session";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const currentUserId = await getUserIdFromRequest();
  const users = await (await usersCollection()).find().sort({ xp: -1 }).limit(20).toArray();
  const entries = users.map((u, i) => ({
    rank: i + 1,
    name: u.name,
    xp: u.xp,
    level: u.level as "beginner" | "intermediate" | "advanced",
    isCurrentUser: currentUserId != null && u._id.equals(currentUserId),
  }));
  return json(GetLeaderboardResponse.parse(entries));
});
