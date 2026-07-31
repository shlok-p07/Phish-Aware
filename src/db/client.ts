import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import { provisionDatabase } from "./provision";

const dbName = process.env.MONGODB_DB ?? "phishaware";

// Cache the client (and provisioning state) on globalThis so Next.js
// dev-mode hot-reload doesn't open a fresh connection pool -- or re-run
// provisioning -- on every module reload.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoProvisioned?: boolean;
};

// Lazy on purpose: Next.js evaluates this module graph at build time (e.g.
// "Collecting page data") without ever calling getDb()/getCollection(), and
// the build environment (notably the Docker build stage) intentionally has
// no MONGODB_URI -- only the running container does. Throwing at import time
// would break the build; throwing on first real use is the correct place.
function connect(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI must be set. Did you forget to provision a database?");
    }
    globalForMongo._mongoClientPromise = new MongoClient(process.env.MONGODB_URI).connect();
    globalForMongo._mongoClientPromise.then((client) => provisionOnce(client)).catch(() => {});
  }
  return globalForMongo._mongoClientPromise;
}

// Applies schema validators/indexes and seeds starter content if empty, so
// nobody has to run `bun run db:init`/`db:seed` by hand. Fire-and-forget
// (not awaited by getDb()) since seedIfEmpty() itself calls getDb() to reach
// the collections it seeds -- awaiting this inline from getDb() would
// deadlock on its own in-flight promise. Runs once per process; this used to
// live in src/instrumentation.ts, but Next.js compiles a separate Edge
// bundle for that file that can't resolve mongodb's optional Node-only
// encryption submodule, which broke every single route with a 500.
function provisionOnce(client: MongoClient): void {
  if (globalForMongo._mongoProvisioned) return;
  globalForMongo._mongoProvisioned = true;
  (async () => {
    const db = client.db(dbName);
    await provisionDatabase(db);
    const { seedIfEmpty } = await import("@/server/seed");
    await seedIfEmpty();
    console.log("[db] schema, indexes, and seed data are up to date.");
  })().catch((err) => {
    globalForMongo._mongoProvisioned = false;
    console.error("[db] provisioning failed:", err);
  });
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(dbName);
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export async function closeMongoClient(): Promise<void> {
  if (!globalForMongo._mongoClientPromise) return;
  const client = await globalForMongo._mongoClientPromise;
  await client.close();
  globalForMongo._mongoClientPromise = undefined;
}
