/**
 * Removes rows whose owner no longer exists.
 *
 * Both delete paths now cascade from the lists in src/server/ownedData.ts, so
 * this is a one-off for what earlier versions left behind: organisation deletion
 * cleaned campaigns and assignments only, and account deletion missed every
 * collection added after assignments.
 *
 * Read-only unless asked, and it reports per collection so the scale of what was
 * left behind is visible rather than just fixed.
 *
 *   bun run scripts/prune-orphans.ts --dry-run
 *   bun run scripts/prune-orphans.ts
 */
import type { ObjectId } from "mongodb";
import { getDb } from "@/db/client";
import { ORG_OWNED_COLLECTIONS, USER_OWNED_COLLECTIONS } from "@/server/ownedData";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = await getDb();
  let total = 0;

  const sweep = async (field: "userId" | "orgId", collections: readonly string[], owner: string) => {
    const live = new Set(
      (await db.collection(owner).find({}, { projection: { _id: 1 } }).toArray()).map((d) =>
        String(d._id),
      ),
    );
    for (const name of collections) {
      const rows = await db
        .collection(name)
        .find({ [field]: { $ne: null } }, { projection: { [field]: 1 } })
        .toArray();
      const doomed = rows
        .filter((r) => !live.has(String((r as Record<string, unknown>)[field])))
        .map((r) => r._id as ObjectId);
      if (doomed.length === 0) continue;
      console.log(`  ${name}.${field}: ${doomed.length} orphaned`);
      total += doomed.length;
      if (!dryRun) await db.collection(name).deleteMany({ _id: { $in: doomed } });
    }
  };

  console.log("rows whose organisation is gone:");
  await sweep("orgId", ORG_OWNED_COLLECTIONS, "organizations");
  console.log("rows whose user is gone:");
  await sweep("userId", USER_OWNED_COLLECTIONS, "users");

  console.log(
    total === 0
      ? "\nNo orphans."
      : dryRun
        ? `\nDry run: ${total} row(s) would be removed.`
        : `\nRemoved ${total} row(s).`,
  );
  process.exit(0);
}

main().catch((cause) => {
  console.error("prune failed:", cause);
  process.exit(1);
});
