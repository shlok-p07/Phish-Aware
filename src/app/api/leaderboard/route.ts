import { db, usersTable } from "@/db";
import { desc } from "drizzle-orm";
import { GetLeaderboardResponse } from "@/api-zod";
import { getUserIdFromRequest } from "@/server/session";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const currentUserId = await getUserIdFromRequest();
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.xp)).limit(20);
  const entries = users.map((u, i) => ({
    rank: i + 1,
    name: u.name,
    xp: u.xp,
    level: u.level as "beginner" | "intermediate" | "advanced",
    isCurrentUser: u.id === currentUserId,
  }));
  return json(GetLeaderboardResponse.parse(entries));
});
