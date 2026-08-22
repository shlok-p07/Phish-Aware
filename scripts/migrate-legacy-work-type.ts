/**
 * Maps retired workType values onto the current vocabulary.
 *
 * The onboarding survey once offered "Onsite"; it now offers Remote, Hybrid and
 * Office, and the users validator encodes that enum. Nothing in the app can
 * produce "Onsite" any more -- the only mention left in the codebase is a test
 * asserting it gets rejected -- but a user document written before the change
 * still carried it.
 *
 * That is worse than untidy. Validators run at `validationLevel: "moderate"`, so
 * the stale document is allowed to exist but every *update* to it is refused.
 * The account could not earn XP or complete a scenario, and the error named a
 * field nobody had touched since July.
 *
 * Idempotent: a second run finds nothing and says so. Safe to keep in the repo
 * as the record of what the mapping was.
 *
 *   bun run scripts/migrate-legacy-work-type.ts
 *   bun run scripts/migrate-legacy-work-type.ts --dry-run
 */
import { getDb } from "@/db/client";

/** Retired value -> its current equivalent. */
const RENAMES: Record<string, string> = {
  // Same concept, different word.
  Onsite: "Office",
  "On-site": "Office",
  "In-office": "Office",
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = await getDb();
  const users = db.collection("users");
  let changed = 0;

  for (const [legacy, current] of Object.entries(RENAMES)) {
    const affected = await users.countDocuments({ workType: legacy });
    if (affected === 0) continue;

    if (dryRun) {
      console.log(`  ${legacy} -> ${current}: ${affected} user(s) would be updated`);
      changed += affected;
      continue;
    }

    // updateMany rather than a loop: one round trip, and the validator sees the
    // corrected value so the write is accepted.
    const result = await users.updateMany(
      { workType: legacy },
      { $set: { workType: current, updatedAt: new Date() } },
    );
    console.log(`  ${legacy} -> ${current}: ${result.modifiedCount} user(s) updated`);
    changed += result.modifiedCount;
  }

  if (changed === 0) {
    console.log("Nothing to migrate; no retired workType values remain.");
  } else if (dryRun) {
    console.log(`\nDry run: ${changed} user(s) would change.`);
  } else {
    console.log(`\nMigrated ${changed} user(s).`);
  }
  process.exit(0);
}

main().catch((cause) => {
  console.error("migration failed:", cause);
  process.exit(1);
});
