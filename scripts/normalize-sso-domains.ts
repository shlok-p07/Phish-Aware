/**
 * Reduces stored SSO domains to the bare domain an admin meant.
 *
 * Both places a domain is configured used to store roughly what was typed, and
 * people type email addresses: three organisations hold a full address in
 * `organizations.domain` and one holds "@northeastern.edu". On the org record
 * that is only cosmetic -- it is display-only and grants nothing -- but
 * `ssoConnections.allowedDomains` is the entire basis on which sign-in decides
 * whether to offer SSO, matched exactly against the domain of the address
 * typed. An entry that is not a bare domain matches nothing, so SSO never
 * appears and no error anywhere explains why.
 *
 * Both write paths now validate, so this is a one-off for what is already
 * stored. Idempotent: a second run finds nothing.
 *
 *   bun run scripts/normalize-sso-domains.ts --dry-run
 *   bun run scripts/normalize-sso-domains.ts
 */
import { getDb } from "@/db/client";
import { parseDomainInput } from "@/server/sso/domain";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = await getDb();
  let changed = 0;
  let unfixable = 0;

  console.log("organizations.domain");
  const orgs = await db.collection("organizations").find({ domain: { $ne: null } }).toArray();
  for (const org of orgs) {
    const current = String(org.domain ?? "");
    const parsed = parseDomainInput(current);
    if (parsed === current) continue;
    if (!parsed) {
      // Left alone rather than nulled: it is display-only, and discarding what
      // a customer entered is worse than showing something untidy.
      console.warn(`  "${org.name}": ${JSON.stringify(current)} is not a domain -- left as is`);
      unfixable++;
      continue;
    }
    console.log(`  "${org.name}": ${JSON.stringify(current)} -> ${JSON.stringify(parsed)}`);
    changed++;
    if (!dryRun) {
      await db
        .collection("organizations")
        .updateOne({ _id: org._id }, { $set: { domain: parsed, updatedAt: new Date() } });
    }
  }

  console.log("\nssoConnections.allowedDomains");
  const connections = await db.collection("ssoConnections").find({}).toArray();
  for (const connection of connections) {
    const current: string[] = Array.isArray(connection.allowedDomains)
      ? connection.allowedDomains.map(String)
      : [];
    const next: string[] = [];
    const dropped: string[] = [];
    for (const entry of current) {
      const parsed = parseDomainInput(entry);
      if (parsed) {
        if (!next.includes(parsed)) next.push(parsed);
      } else {
        dropped.push(entry);
      }
    }
    if (dropped.length > 0) {
      // Here an unusable entry is not cosmetic: it is why SSO would not appear.
      console.warn(`  ${String(connection._id)}: dropping unusable ${dropped.join(", ")}`);
    }
    if (next.length === current.length && next.every((d, i) => d === current[i])) continue;
    console.log(`  ${String(connection._id)}: ${JSON.stringify(current)} -> ${JSON.stringify(next)}`);
    changed++;
    if (!dryRun) {
      await db
        .collection("ssoConnections")
        .updateOne(
          { _id: connection._id },
          { $set: { allowedDomains: next, updatedAt: new Date() } },
        );
    }
  }

  console.log(
    dryRun
      ? `\nDry run: ${changed} record(s) would change, ${unfixable} left as is.`
      : `\nUpdated ${changed} record(s), ${unfixable} left as is.`,
  );
  process.exit(0);
}

main().catch((cause) => {
  console.error("normalization failed:", cause);
  process.exit(1);
});
