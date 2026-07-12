import { db, scenariosTable, usersTable } from "@workspace/db";
import { hashPassword } from "./password";
import { SEED_SCENARIOS } from "./seedScenarios";
import { logger } from "./logger";

const SAMPLE_LEADERBOARD_USERS = [
  { name: "Morgan Ellis", xp: 620, level: "advanced" as const, streak: 12 },
  { name: "Sasha Kim", xp: 480, level: "advanced" as const, streak: 6 },
  { name: "Theo Ramirez", xp: 310, level: "intermediate" as const, streak: 4 },
  { name: "Priya Nair", xp: 260, level: "intermediate" as const, streak: 9 },
  { name: "Jamie Fox", xp: 140, level: "beginner" as const, streak: 2 },
  { name: "Dana Wu", xp: 95, level: "beginner" as const, streak: 1 },
];

export async function seedIfEmpty(): Promise<void> {
  const existingScenarios = await db.select().from(scenariosTable).limit(1);
  if (existingScenarios.length === 0) {
    await db.insert(scenariosTable).values(SEED_SCENARIOS);
    logger.info({ count: SEED_SCENARIOS.length }, "Seeded practice scenarios");
  }

  const existingUsers = await db.select().from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(usersTable).values(
      SAMPLE_LEADERBOARD_USERS.map((u) => ({
        name: u.name,
        email: `${u.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        passwordHash: hashPassword("samplepass123"),
        isGuest: false,
        level: u.level,
        xp: u.xp,
        streak: u.streak,
        badges: [],
        calibrationScore: 0.7,
      })),
    );
    logger.info({ count: SAMPLE_LEADERBOARD_USERS.length }, "Seeded sample leaderboard users");
  }
}
