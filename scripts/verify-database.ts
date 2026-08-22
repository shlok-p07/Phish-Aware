/**
 * Read-only conformance check between the code, the schema and the data.
 *
 * There is a class of problem no test in this repo can see: a document that was
 * written by an older version of the app and no longer satisfies the validator
 * the current version installs. Validators run at `validationLevel: "moderate"`,
 * which lets such a document sit there untouched -- and then rejects the next
 * *update* to it. So the failure does not appear when the bad data is written or
 * when the schema changes; it appears much later, as one specific account being
 * unable to earn XP or finish a scenario, with a validation error that names a
 * field nobody has touched in months.
 *
 * That is exactly what this found on first run: one user with
 * `workType: "Onsite"`, a value from before the survey vocabulary became
 * Remote/Hybrid/Office. Every unit test passed; the account was quietly
 * unwritable.
 *
 * Deliberately read-only, so it is safe to run against production and safe to
 * put in CI. Exits non-zero when something is out of line.
 *
 *   bun run scripts/verify-database.ts
 */
import type { Document } from "mongodb";
import { getDb } from "@/db/client";
import { ensureSchema, ensureIndexes } from "@/db/provision";

interface Finding {
  collection: string;
  detail: string;
}

async function main(): Promise<void> {
  const db = await getDb();
  const findings: Finding[] = [];

  const before = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .sort();

  // Provisioning has to be idempotent: it runs on every boot, so anything it
  // creates on a second pass is something it would recreate forever.
  await ensureSchema(db);
  await ensureIndexes(db);
  // ensureIndexes reports drift on a detached promise; give it time to log.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const after = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .sort();
  const created = after.filter((name) => !before.includes(name));
  if (created.length > 0) {
    findings.push({
      collection: "(provisioning)",
      detail: `not idempotent -- a second run created ${created.join(", ")}`,
    });
  }

  console.log(`collections: ${after.length}`);
  console.log(created.length === 0 ? "provisioning: idempotent" : "provisioning: NOT idempotent");
  console.log("\ndocuments against the current validators:");

  for (const name of after) {
    // Without nameOnly the driver still types the result as a union with the
    // name-only shape, so the options have to be narrowed explicitly.
    const [info] = await db.listCollections({ name }).toArray();
    const validator = (info as { options?: { validator?: Document } } | undefined)?.options
      ?.validator;
    const total = await db.collection(name).countDocuments();
    if (!validator) {
      console.log(`  ${name}: ${total} docs, no validator`);
      continue;
    }
    // Ask the server which documents its own validator rejects, rather than
    // reimplementing $jsonSchema here and being subtly wrong about it.
    const invalid = await db.collection(name).countDocuments({ $nor: [validator] });
    console.log(`  ${name}: ${total} docs, ${invalid} invalid`);
    if (invalid > 0) {
      findings.push({
        collection: name,
        // Named individually: "3 invalid" is not actionable, and these are the
        // documents whose next update will fail.
        detail: `${invalid} document(s) the current validator rejects; their next update will fail`,
      });
      const samples = await db
        .collection(name)
        .find({ $nor: [validator] }, { projection: { _id: 1, email: 1, name: 1 } })
        .limit(5)
        .toArray();
      for (const doc of samples) {
        console.log(`      _id=${String(doc._id)}${doc.email ? ` email=${String(doc.email)}` : ""}`);
      }
    }
  }

  if (findings.length === 0) {
    console.log("\nEverything is aligned.");
    process.exit(0);
  }

  console.error(`\n${findings.length} problem(s):`);
  for (const finding of findings) {
    console.error(`  ${finding.collection}: ${finding.detail}`);
  }
  process.exit(1);
}

main().catch((cause) => {
  console.error("verification failed to run:", cause);
  process.exit(1);
});
