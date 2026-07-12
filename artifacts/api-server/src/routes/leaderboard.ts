import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { GetLeaderboardResponse } from "@workspace/api-zod";
import { attachUser } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/leaderboard", attachUser, async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.xp)).limit(20);
  const entries = users.map((u, i) => ({
    rank: i + 1,
    name: u.name,
    xp: u.xp,
    level: u.level as "beginner" | "intermediate" | "advanced",
    isCurrentUser: u.id === req.userId,
  }));
  res.json(GetLeaderboardResponse.parse(entries));
});

export default router;
