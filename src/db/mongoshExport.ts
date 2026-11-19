/**
 * Renders database/init/01-validators.js and 02-indexes.js from provision.ts.
 *
 * The schema used to exist twice: hand-written mongosh scripts (the shared
 * cross-team copy) and their Node port here, which is what the app runs. No
 * test compared them, so they drifted until `bun run db:init` installed
 * validators the app no longer satisfied. Now provision.ts is the only place
 * the schema is written: this module runs ensureSchema/ensureIndexes against a
 * recording stand-in for the driver's Db, and prints what they would apply as
 * mongosh scripts. mongoshExport.test.ts fails when the committed files are
 * stale, and `bun run db:export-schema` rewrites them.
 *
 * Nothing here connects to a database.
 */
import type { Db } from "mongodb";
import { ensureIndexes, ensureSchema } from "./provision";

export interface RecordedCollection {
  name: string;
  validator: unknown;
}

export interface RecordedIndex {
  collection: string;
  keys: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface RecordedSchema {
  collections: RecordedCollection[];
  indexes: RecordedIndex[];
  staleIndexes: { collection: string; name: string }[];
}

/** Run provision.ts against a Db that records instead of executing. */
export async function recordProvisioning(): Promise<RecordedSchema> {
  const recorded: RecordedSchema = { collections: [], indexes: [], staleIndexes: [] };
  const indexName = (keys: Record<string, unknown>, options?: { name?: string }) =>
    options?.name ?? Object.entries(keys).map(([k, v]) => `${k}_${v}`).join("_");

  const fakeDb = {
    // Every collection reads as new, so make() takes the createCollection path
    // and hands over the full validator.
    listCollections: () => ({ toArray: async () => [] }),
    createCollection: async (name: string, options: { validator: unknown }) => {
      recorded.collections.push({ name, validator: options.validator });
    },
    command: async () => ({ ok: 1 }),
    collection: (collection: string) => ({
      createIndex: async (keys: Record<string, unknown>, options?: Record<string, unknown>) => {
        recorded.indexes.push(options ? { collection, keys, options } : { collection, keys });
        return indexName(keys, options as { name?: string } | undefined);
      },
      dropIndex: async (name: string) => {
        recorded.staleIndexes.push({ collection, name });
        // IndexNotFound, which provision.ts treats as already dropped.
        throw Object.assign(new Error("index not found"), { code: 27 });
      },
      indexes: async () => [],
    }),
  } as unknown as Db;

  const warn = console.warn;
  console.warn = () => {}; // provision.ts narrates drift and drops; not useful here
  try {
    await ensureSchema(fakeDb);
    await ensureIndexes(fakeDb);
  } finally {
    console.warn = warn;
  }
  // The primary-key indexes are created concurrently; sort for a stable file.
  recorded.indexes.sort((a, b) =>
    a.collection === b.collection ? 0 : a.collection < b.collection ? -1 : 1,
  );
  return recorded;
}

const HEADER = (file: string, purpose: string) => `/**
 * ${file} -- GENERATED from src/db/provision.ts. Do not edit by hand.
 *
 * ${purpose}
 *
 * The app applies the same schema itself on first connect; this file exists
 * for the shared cross-team spec and for anyone who prefers mongosh. To change
 * the schema, edit src/db/provision.ts and run \`bun run db:export-schema\`.
 * src/db/mongoshExport.test.ts fails if this file is out of date.
 *
 *   mongosh "<uri>" database/init/${file}
 */
`;

export function renderValidators(schema: RecordedSchema): string {
  return `${HEADER(
    "01-validators.js",
    "Creates every collection with its $jsonSchema validator, or updates the\n * validator with collMod if the collection exists. Safe to re-run.",
  )}db = db.getSiblingDB("phishaware");

const COLLECTIONS = ${JSON.stringify(schema.collections, null, 2)};

const existing = new Set(db.getCollectionNames());
for (const { name, validator } of COLLECTIONS) {
  const options = { validator, validationLevel: "moderate", validationAction: "error" };
  if (existing.has(name)) {
    db.runCommand({ collMod: name, ...options });
  } else {
    db.createCollection(name, options);
  }
  print(\`validator applied: \${name}\`);
}
`;
}

export function renderIndexes(schema: RecordedSchema): string {
  return `${HEADER(
    "02-indexes.js",
    "Creates every index the app relies on, then drops indexes that are known to\n * be wrong. createIndex is idempotent; a missing stale index is not an error.",
  )}db = db.getSiblingDB("phishaware");

const INDEXES = ${JSON.stringify(schema.indexes, null, 2)};

for (const { collection, keys, options } of INDEXES) {
  db.getCollection(collection).createIndex(keys, options ?? {});
}

const STALE_INDEXES = ${JSON.stringify(schema.staleIndexes, null, 2)};

for (const { collection, name } of STALE_INDEXES) {
  try {
    db.getCollection(collection).dropIndex(name);
    print(\`dropped stale index \${collection}.\${name}\`);
  } catch (e) {
    if (e.code !== 27) throw e; // 27: IndexNotFound, already gone
  }
}

print(\`indexes applied: \${INDEXES.length}\`);
`;
}
