import { ObjectId } from "mongodb";
import { scenariosCollection, usersCollection, lessonsCollection, specDefaults } from "@/db";
import { clearedLockoutFields } from "./loginLockout";
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
  // The static library is topped up rather than seeded once. The previous "only
  // if the collection is empty" guard meant that adding library content for a
  // new vector reached no database that had ever been seeded -- so qr, social
  // and web were offered in the practice filter with an empty pool behind them,
  // which falls through to blocking live generation and returns 404 whenever a
  // provider is rate limited or unconfigured.
  //
  // Matched on content rather than replaced wholesale, because this collection
  // also accumulates AI-generated scenarios that must survive, and because a
  // library scenario already sitting in someone's attempt history has to keep
  // its id. $setOnInsert only, so an existing seed is left completely alone.
  const scenarios = await scenariosCollection();
  const seedResult = await scenarios.bulkWrite(
    SEED_SCENARIOS.map((s) => {
      const id = new ObjectId();
      return {
        updateOne: {
          filter: {
            source: "library" as const,
            vector: s.vector,
            sender: s.sender,
            subject: s.subject,
          },
          update: {
            $setOnInsert: {
              ...s,
              _id: id,
              scenarioId: id,
              orgId: s.orgId ?? null,
              emotionalLevers: s.emotionalLevers ?? [],
              source: "library" as const,
              ...specDefaults(),
            },
          },
          upsert: true,
        },
      };
    }),
  );
  if (seedResult.upsertedCount > 0) {
    console.log(`Seeded ${seedResult.upsertedCount} practice scenarios`);
  }

  // Lessons are authored in this repo, not produced by users, so they are
  // upserted on every run rather than seeded once. The previous "only if the
  // collection is empty" guard meant a content fix never reached any database
  // that had already been seeded -- which is every environment past its first
  // boot -- so a rewritten lesson shipped to nobody. Scenarios keep the
  // insert-once guard above, because that collection accumulates generated
  // content that must not be replaced.
  const lessons = await lessonsCollection();
  const stored = new Map(
    (await lessons.find({}, { projection: { _id: 1, screens: 1, title: 1, summary: 1, vector: 1, redFlags: 1, order: 1 } }).toArray()).map(
      (doc) => [doc._id, doc],
    ),
  );
  // Only the lessons whose content actually differs. Writing all of them every
  // boot -- which an unconditional $set with a fresh updatedAt does -- churns
  // the collection and makes updatedAt mean "last restart" rather than "last
  // edit", which is exactly when you want it to be true.
  const outdated = LESSONS.map((lesson, index) => ({ lesson, index })).filter(({ lesson, index }) => {
    const existing = stored.get(lesson.id);
    if (!existing) return true;
    return (
      existing.title !== lesson.title ||
      existing.summary !== lesson.summary ||
      existing.vector !== lesson.vector ||
      existing.order !== index ||
      JSON.stringify(existing.redFlags) !== JSON.stringify(lesson.redFlags) ||
      JSON.stringify(existing.screens) !== JSON.stringify(lesson.screens)
    );
  });

  if (outdated.length > 0) {
    const result = await lessons.bulkWrite(
      outdated.map(({ lesson, index }) => ({
        updateOne: {
          filter: { _id: lesson.id },
          update: {
            $set: {
              lessonId: lesson.id,
              vector: lesson.vector,
              title: lesson.title,
              summary: lesson.summary,
              screens: lesson.screens,
              redFlags: lesson.redFlags,
              difficulty: 1,
              order: index,
              updatedAt: new Date(),
            },
            $setOnInsert: { metadata: {}, createdAt: new Date(), deletedAt: null },
          },
          upsert: true,
        },
      })),
    );
    console.log(
      `Lessons synced: ${result.upsertedCount} added, ${result.modifiedCount} updated`,
    );
  }

  // The sample leaderboard exists so a solo learner does not stare at a list of
  // one. It is display-only fixture data, and it used to be created with a real
  // password hashed from a literal in this file -- six accounts with a
  // repo-committed password and guessable addresses, fully loginable on any
  // deployment that had ever run the seed. They now carry no credential at all
  // (the login route already drops candidates with no passwordHash) and are
  // marked isDemo so the leaderboard can tell a fixture from a person.
  //
  // Upserted by email rather than created only on an empty collection, so a
  // database seeded before this change has the credential stripped on next
  // boot instead of keeping it forever.
  const users = await usersCollection();
  const demoResult = await users.bulkWrite(
    SAMPLE_LEADERBOARD_USERS.map((u) => {
      const id = new ObjectId();
      const email = `${u.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
      return {
        updateOne: {
          filter: { email, orgId: null },
          update: {
            // Applied to existing rows too: this is the part that revokes the
            // credential on an already-seeded database.
            $set: { isDemo: true, passwordHash: null },
            $setOnInsert: {
              _id: id,
              userId: id,
              orgId: null,
              name: u.name,
              email,
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
              ...clearedLockoutFields(),
              ...specDefaults(),
            },
          },
          upsert: true,
        },
      };
    }),
  );
  if (demoResult.upsertedCount > 0) {
    console.log(`Seeded ${demoResult.upsertedCount} sample leaderboard users`);
  }
  if (demoResult.modifiedCount > 0) {
    console.log(`Revoked credentials on ${demoResult.modifiedCount} sample leaderboard users`);
  }
}
