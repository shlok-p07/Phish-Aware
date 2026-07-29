import { db, scenariosTable, usersTable, lessonsTable } from "@/db";
import { hashPassword } from "./password";
import { SEED_SCENARIOS } from "./seedScenarios";
import { LESSONS } from "./lessons";

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
    console.log(`Seeded ${SEED_SCENARIOS.length} practice scenarios`);
  }

  const existingLessons = await db.select().from(lessonsTable).limit(1);
  if (existingLessons.length === 0) {
    await db.insert(lessonsTable).values(
      LESSONS.map((lesson, index) => ({
        id: lesson.id,
        vector: lesson.vector,
        title: lesson.title,
        summary: lesson.summary,
        screens: lesson.screens,
        redFlags: lesson.redFlags,
        sortOrder: index,
      })),
    );
    console.log(`Seeded ${LESSONS.length} lessons`);
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
    console.log(`Seeded ${SAMPLE_LEADERBOARD_USERS.length} sample leaderboard users`);
  }
}
