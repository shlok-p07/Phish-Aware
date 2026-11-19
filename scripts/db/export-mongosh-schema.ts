/**
 * Rewrites the mongosh scripts in database/init/: 01-validators.js and
 * 02-indexes.js from src/db/provision.ts (the schema the app runs), and
 * 03-seed.js from src/db/demoDataset.ts.
 *
 * Run after changing either source; a test fails until you do. Touches no
 * database.
 *
 *   bun run db:export-schema
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordProvisioning, renderDemoSeed, renderIndexes, renderValidators } from "@/db/mongoshExport";

const dir = join(import.meta.dirname, "..", "..", "database", "init");
const schema = await recordProvisioning();
writeFileSync(join(dir, "01-validators.js"), renderValidators(schema));
writeFileSync(join(dir, "02-indexes.js"), renderIndexes(schema));
writeFileSync(join(dir, "03-seed.js"), renderDemoSeed());
console.log(
  `wrote ${schema.collections.length} collections, ${schema.indexes.length} indexes and the demo seed to database/init/`,
);
