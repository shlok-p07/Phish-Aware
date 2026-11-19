/**
 * Rewrites database/init/01-validators.js and 02-indexes.js from
 * src/db/provision.ts, the schema the app actually runs.
 *
 * Run after any change to provision.ts. src/db/mongoshExport.test.ts fails
 * until you do. Touches no database.
 *
 *   bun run db:export-schema
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordProvisioning, renderIndexes, renderValidators } from "@/db/mongoshExport";

const dir = join(import.meta.dirname, "..", "..", "database", "init");
const schema = await recordProvisioning();
writeFileSync(join(dir, "01-validators.js"), renderValidators(schema));
writeFileSync(join(dir, "02-indexes.js"), renderIndexes(schema));
console.log(
  `wrote ${schema.collections.length} collections and ${schema.indexes.length} indexes to database/init/`,
);
