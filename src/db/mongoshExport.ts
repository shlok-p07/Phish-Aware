/**
 * Renders the mongosh scripts in database/init/ from their single sources:
 * 01-validators.js and 02-indexes.js from provision.ts, and 03-seed.js from
 * demoDataset.ts.
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
import { ObjectId, type Db } from "mongodb";
import { buildDemoDataset, RANDOM_TOKEN } from "./demoDataset";
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

// --- 03-seed.js: the demo organisation ------------------------------------

/**
 * Any fixed instant works: dates are written as offsets from it and rebuilt
 * from the clock when the script runs, so the demo always looks current (a
 * campaign due in two weeks stays due in two weeks).
 */
const RENDER_EPOCH = new Date(Date.UTC(2026, 0, 1));
const DAY_MS = 24 * 60 * 60 * 1000;

/** JSON-safe form of a demo document: ObjectIds, relative dates and the token placeholder become markers the script revives. */
function encodeDemoValue(value: unknown): unknown {
  if (value instanceof ObjectId) return { $oid: value.toHexString() };
  if (value instanceof Date) return { $daysAgo: (RENDER_EPOCH.getTime() - value.getTime()) / DAY_MS };
  if (value === RANDOM_TOKEN) return { $randomToken: true };
  if (Array.isArray(value)) return value.map(encodeDemoValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeDemoValue(v)]));
  }
  return value;
}

export function renderDemoSeed(): string {
  const data = encodeDemoValue(buildDemoDataset(RENDER_EPOCH));
  return `/**
 * 03-seed.js -- GENERATED from src/db/demoDataset.ts. Do not edit by hand.
 *
 * A demo organisation (Northwind Trading Co.) for local development and
 * screenshots. Run it after 01-validators.js and 02-indexes.js:
 *
 *   mongosh "<uri>" database/init/03-seed.js                        # add or refresh
 *   DEMO_SEED_REMOVE=1 mongosh "<uri>" database/init/03-seed.js     # remove it again
 *
 * Safe by construction:
 * - Every document has a fixed demo _id and is upserted, so re-running refreshes
 *   the demo and nothing else. It never deletes or rewrites other documents.
 * - It refuses to run against a database that has real users (anyone other
 *   than these members and the app's isDemo leaderboard fixtures), because a
 *   demo org has no place in production. DEMO_SEED_FORCE=1 overrides that.
 * - No member has a password, and the pending invitation's token is generated
 *   fresh on each run, so nothing committed here can be used to sign in.
 *
 * To change the data, edit src/db/demoDataset.ts and run
 * \`bun run db:export-schema\`. src/db/demoDataset.test.ts fails if this file
 * is out of date.
 */
db = db.getSiblingDB("phishaware");

const DATA = ${JSON.stringify(data, null, 2)};

const DAY_MS = ${DAY_MS};
const now = Date.now();
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    if ("$oid" in value) return new ObjectId(value.$oid);
    if ("$daysAgo" in value) return new Date(now - value.$daysAgo * DAY_MS);
    if ("$randomToken" in value) return require("crypto").randomBytes(32).toString("base64url");
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = revive(inner);
    return out;
  }
  return value;
}

const docs = revive(DATA);
const env = (typeof process !== "undefined" && process.env) || {};

if (env.DEMO_SEED_REMOVE === "1") {
  for (const [collection, rows] of Object.entries(docs)) {
    const { deletedCount } = db
      .getCollection(collection)
      .deleteMany({ _id: { $in: rows.map((row) => row._id) } });
    print(\`removed \${deletedCount} from \${collection}\`);
  }
} else {
  const realUsers = db.getCollection("users").countDocuments({
    _id: { $nin: docs.users.map((user) => user._id) },
    isDemo: { $ne: true },
  });
  if (realUsers > 0 && env.DEMO_SEED_FORCE !== "1") {
    print(
      \`[03-seed] refusing: this database has \${realUsers} real user(s). \` +
        "The demo org is for development databases. Set DEMO_SEED_FORCE=1 to seed anyway.",
    );
    quit(1);
  }
  for (const [collection, rows] of Object.entries(docs)) {
    for (const row of rows) {
      db.getCollection(collection).replaceOne({ _id: row._id }, row, { upsert: true });
    }
    print(\`seeded \${rows.length} into \${collection}\`);
  }
}
`;
}
