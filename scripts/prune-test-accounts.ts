/**
 * Removes throwaway accounts left behind by end-to-end verification.
 *
 * Driving the running product by hand is the only way some bugs surface -- the
 * branding one looked correct at every layer below the stylesheet -- but each
 * pass leaves a signed-up account behind, and they accumulate until the user
 * list is mostly noise.
 *
 * Deliberately narrow, because this deletes people:
 *
 *  - the address must be on a reserved test domain (RFC 2606 `.test`, or
 *    example.com / example.test), so a real customer address can never match
 *  - it must carry a unix timestamp, which is what a generated address has and
 *    a hand-made one does not
 *  - seeded demo users are exempt: they are content, not residue
 *  - a small protected list is exempt outright
 *
 * Dry run unless `--yes` is passed, since the alternative is deleting the wrong
 * account and having no way back. Cascades through ownedData.ts, so an account
 * does not leave orphaned attempts and reviews behind the way earlier cleanups
 * did.
 *
 *   bun run scripts/prune-test-accounts.ts          # report only
 *   bun run scripts/prune-test-accounts.ts --yes    # actually delete
 */
import type { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import { USER_OWNED_COLLECTIONS } from "@/server/ownedData";

/** A generated address: prefix, unix timestamp, reserved test domain. */
const EPHEMERAL = /^[a-z][a-z0-9.-]*-\d{9,13}@(example\.(test|com)|[a-z0-9-]+\.test)$/i;

/**
 * Accounts that look ephemeral but are not. The SSO demo admin backs
 * `bun run sso:demo`, and the other two are long-lived fixtures a teammate set
 * up against the demo organisation.
 */
const PROTECTED = new Set([
  "sso-demo-admin@phishaware.local",
  "alice@acme.test",
  "model@test.com",
]);

async function main(): Promise<void> {
  const commit = process.argv.includes("--yes");
  const db = await getDb();
  const users = await db.collection("users").find({}).toArray();

  const doomed = users.filter((user) => {
    const email = String(user.email ?? "").toLowerCase();
    if (!email || PROTECTED.has(email)) return false;
    if (user.isDemo) return false;
    return EPHEMERAL.test(email);
  });

  if (doomed.length === 0) {
    console.log("No throwaway accounts to remove.");
    process.exit(0);
  }

  console.log(`${commit ? "Removing" : "Would remove"} ${doomed.length} account(s):`);
  for (const user of doomed) console.log(`  ${user.email}`);

  const ids = doomed.map((u) => u._id as ObjectId);
  const orgIds = [...new Set(doomed.map((u) => u.orgId).filter(Boolean))] as ObjectId[];

  if (!commit) {
    console.log(`\nAlso ${orgIds.length} organisation(s) they created.`);
    console.log("Dry run. Pass --yes to delete.");
    process.exit(0);
  }

  // Their own rows first, so nothing is orphaned even if a later step fails.
  for (const collection of USER_OWNED_COLLECTIONS) {
    const result = await db.collection(collection).deleteMany({ userId: { $in: ids } });
    if (result.deletedCount) console.log(`  ${collection}: ${result.deletedCount}`);
  }
  await db.collection("sessions").deleteMany({ userId: { $in: ids } });
  await db.collection("users").deleteMany({ _id: { $in: ids } });

  // Organisations these accounts created exist only to hold their test data, so
  // they go too -- via the same cascade the delete route uses.
  if (orgIds.length > 0) {
    const { ORG_OWNED_COLLECTIONS } = await import("@/server/ownedData");
    for (const collection of ORG_OWNED_COLLECTIONS) {
      const result = await db.collection(collection).deleteMany({ orgId: { $in: orgIds } });
      if (result.deletedCount) console.log(`  ${collection}: ${result.deletedCount}`);
    }
    const orgs = await db.collection("organizations").deleteMany({ _id: { $in: orgIds } });
    console.log(`  organizations: ${orgs.deletedCount}`);
  }

  console.log(`\nRemoved ${doomed.length} account(s).`);
  process.exit(0);
}

main().catch((cause) => {
  console.error("prune failed:", cause);
  process.exit(1);
});
