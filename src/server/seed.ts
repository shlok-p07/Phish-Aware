import { ObjectId } from "mongodb";
import { scenariosCollection, usersCollection, lessonsCollection, specDefaults } from "@/db";
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
  const scenarios = await scenariosCollection();
  // Upsert each seed entry individually (keyed on its own content, since the
  // static list has no id of its own) rather than skipping the whole step
  // once the collection is non-empty -- otherwise entries added to
  // SEED_SCENARIOS after the first deploy (e.g. the voice-call pool) would
  // silently never make it into an already-seeded database.
  const result = await scenarios.bulkWrite(
    SEED_SCENARIOS.map((s) => {
      const id = new ObjectId();
      return {
        updateOne: {
          filter: { source: "library" as const, sender: s.sender, subject: s.subject, body: s.body },
          update: {
            $setOnInsert: {
              ...s,
              _id: id,
              scenarioId: id,
              orgId: s.orgId ?? null,
              source: "library" as const,
              ...specDefaults(),
            },
          },
          upsert: true,
        },
      };
    }),
  );
  if (result.upsertedCount > 0) {
    console.log(`Seeded ${result.upsertedCount} practice scenarios`);
  }

  const lessons = await lessonsCollection();
  const existingLessons = await lessons.countDocuments({}, { limit: 1 });
  if (existingLessons === 0) {
    await lessons.insertMany(
      LESSONS.map((lesson, index) => ({
        _id: lesson.id,
        lessonId: lesson.id,
        vector: lesson.vector,
        title: lesson.title,
        summary: lesson.summary,
        screens: lesson.screens,
        redFlags: lesson.redFlags,
        difficulty: 1,
        order: index,
        ...specDefaults(),
      })),
    );
    console.log(`Seeded ${LESSONS.length} lessons`);
  }

  const users = await usersCollection();
  const existingUsers = await users.countDocuments({}, { limit: 1 });
  if (existingUsers === 0) {
    await users.insertMany(
      SAMPLE_LEADERBOARD_USERS.map((u) => {
        const id = new ObjectId();
        return {
          _id: id,
          userId: id,
          orgId: null,
          name: u.name,
          email: `${u.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          passwordHash: hashPassword("samplepass123"),
          isGuest: false,
          level: u.level,
          xp: u.xp,
          streak: u.streak,
          lastActiveDate: null,
          badges: [],
          calibrationScore: 0.7,
          department: null,
          workType: null,
          surveyFeatures: null,
          phishingAwarenessScore: 0.7,
          lastLoginAt: null,
          onboardingCompleted: true,
          role: "employee" as const,
          status: "active" as const,
          passwordResetCodeHash: null,
          passwordResetExpiresAt: null,
          ...specDefaults(),
        };
      }),
    );
    console.log(`Seeded ${SAMPLE_LEADERBOARD_USERS.length} sample leaderboard users`);
  }
}
