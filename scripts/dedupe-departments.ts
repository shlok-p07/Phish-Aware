/**
 * Removes duplicate department records, keeping one per (organisation, name).
 *
 * ensureOrgDepartments read the collection and then inserted whatever was
 * absent, which is only safe if nothing else is doing the same thing at the same
 * time. Nothing guaranteed that: listOrgDepartments called it on every read, and
 * both findOrgDepartment and isOrgDepartment went through listOrgDepartments, so
 * one request validating a department name while another listed them was enough.
 * Two callers each saw an empty collection and each inserted the full standard
 * set, leaving one organisation with every department exactly twice.
 *
 * The write path is now an upsert and there is a unique index behind it, so this
 * is a one-off cleanup for clusters that already hold duplicates -- and the
 * index cannot be created until it has run.
 *
 * Which row survives: the oldest, since anything referencing a department by id
 * is more likely to point at the first one created. Members reference departments
 * by *name*, so no member is left dangling either way -- but preferring the
 * original keeps ids stable for anything that did capture one.
 *
 *   bun run scripts/dedupe-departments.ts --dry-run
 *   bun run scripts/dedupe-departments.ts
 */
import { ObjectId } from "mongodb";
import { getDb } from "@/db/client";

interface Row {
  _id: ObjectId;
  orgId: ObjectId | null;
  name: string;
  createdAt?: Date;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = await getDb();
  const departments = db.collection<Row>("departments");
  const rows = await departments.find({}).toArray();

  // Grouped case-insensitively, matching how the unique index and the lookup
  // helpers both treat names.
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${String(row.orgId)}|${row.name.trim().toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const doomed: ObjectId[] = [];
  let affectedGroups = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    affectedGroups++;
    const ordered = [...group].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    );
    const [keep, ...extras] = ordered;
    const [, name] = key.split("|");
    console.log(
      `  ${name}: ${group.length} rows, keeping ${String(keep!._id)}, removing ${extras.length}`,
    );
    doomed.push(...extras.map((r) => r._id));
  }

  if (doomed.length === 0) {
    console.log("No duplicate departments; nothing to do.");
    process.exit(0);
  }

  if (dryRun) {
    console.log(`\nDry run: would remove ${doomed.length} row(s) across ${affectedGroups} name(s).`);
    process.exit(0);
  }

  const result = await departments.deleteMany({ _id: { $in: doomed } });
  console.log(`\nRemoved ${result.deletedCount} duplicate row(s) across ${affectedGroups} name(s).`);
  console.log("Re-run provisioning (or restart the app) to create the unique index.");
  process.exit(0);
}

main().catch((cause) => {
  console.error("dedupe failed:", cause);
  process.exit(1);
});
