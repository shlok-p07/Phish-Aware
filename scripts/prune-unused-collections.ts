/**
 * Drops collections this codebase no longer provisions -- but only if they are
 * empty.
 *
 * `profiles` and `surveys` were provisioned from the start and never read or
 * written. Both were duplicates rather than unbuilt features: profiles held risk
 * and accuracy figures that learnerAnalytics computes from attempts on demand,
 * and surveys held question wording that lives in src/lib/onboarding-survey.ts.
 * Provisioning for both has been removed, which stops them being recreated but
 * does not remove the empty collections already out there.
 *
 * Deliberately a script rather than part of provisioning. The cluster is shared,
 * and a drop that runs on every boot would fight any other team's script that
 * recreates the collection -- an endless create/drop cycle. Running this is a
 * decision someone makes once.
 *
 * The emptiness check is the safety property: if anything has started using one
 * of these, this refuses to touch it and says so. Run with:
 *
 *   bun run scripts/prune-unused-collections.ts
 *   bun run scripts/prune-unused-collections.ts --dry-run
 */
import { getDb } from "@/db/client";

const CANDIDATES = ["profiles", "surveys"] as const;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = await getDb();
  let dropped = 0;
  let kept = 0;

  for (const name of CANDIDATES) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (exists.length === 0) {
      console.log(`  ${name}: already gone`);
      continue;
    }
    const count = await db.collection(name).countDocuments();
    if (count > 0) {
      console.warn(
        `  ${name}: KEPT -- holds ${count} document(s). Something is using it; ` +
          `investigate before dropping.`,
      );
      kept++;
      continue;
    }
    if (dryRun) {
      console.log(`  ${name}: empty, would drop`);
      continue;
    }
    await db.collection(name).drop();
    console.log(`  ${name}: dropped (was empty)`);
    dropped++;
  }

  console.log(dryRun ? "\nDry run, nothing changed." : `\nDropped ${dropped}, kept ${kept}.`);
  process.exit(kept > 0 ? 1 : 0);
}

main().catch((cause) => {
  console.error("failed:", cause);
  process.exit(1);
});
