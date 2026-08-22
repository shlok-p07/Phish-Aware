import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import { provisionDatabase } from "./provision";

const dbName = process.env.MONGODB_DB ?? "phishaware";

// Cache the client (and provisioning state) on globalThis so Next.js
// dev-mode hot-reload doesn't open a fresh connection pool -- or re-run
// provisioning -- on every module reload.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
  /** Schema and indexes applied. Awaited, so no write can precede it. */
  _mongoSchemaApplied?: boolean;
  _mongoProvisioned?: boolean;
  _mongoProvisioning?: Promise<void>;
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
    // Schema before anything can write, seeding after.
    //
    // Both used to be fire-and-forget, which left a window where a request was
    // validated against the previous schema: a write that a new validator
    // permits was rejected by the old one, as a 500, until provisioning
    // happened to finish. Brief, but it lands right after every deploy that
    // changes a validator -- exactly when it is least expected.
    //
    // provisionDatabase takes the Db directly, so awaiting it here cannot
    // deadlock. Seeding is what calls getDb(), so it stays unawaited: it
    // resolves as soon as this callback returns.
    globalForMongo._mongoClientPromise = new MongoClient(process.env.MONGODB_URI)
      .connect()
      .then(async (client) => {
        await applySchemaOnce(client);
        seedOnce();
        return client;
      });
  }
  return globalForMongo._mongoClientPromise;
}

/**
 * Applies schema validators and indexes, once per process, awaited by connect().
 *
 * This lives here rather than in src/instrumentation.ts because Next.js compiles
 * a separate Edge bundle for that file which cannot resolve mongodb's optional
 * Node-only encryption submodule, and that broke every route with a 500.
 */
async function applySchemaOnce(client: MongoClient): Promise<void> {
  if (globalForMongo._mongoSchemaApplied) return;
  globalForMongo._mongoSchemaApplied = true;
  try {
    await provisionDatabase(client.db(dbName));
  } catch (err) {
    // Cleared so the next connection retries rather than running forever
    // against a database whose schema was never applied.
    globalForMongo._mongoSchemaApplied = false;
    console.error("[db] schema provisioning failed:", err);
    throw err;
  }
}

/**
 * Seeds starter content, once per process, deliberately not awaited.
 *
 * Handle kept so closeMongoClient() can drain it: short-lived CLI scripts
 * otherwise finish and close the pool mid-flight, which surfaces as a spurious
 * MongoNotConnectedError on an operation nobody asked for.
 */
function seedOnce(): void {
  if (globalForMongo._mongoProvisioned) return;
  globalForMongo._mongoProvisioned = true;
  globalForMongo._mongoProvisioning = (async () => {
    const { seedIfEmpty } = await import("@/server/seed");
    await seedIfEmpty();
    console.log("[db] schema, indexes, and seed data are up to date.");
  })().catch((err) => {
    globalForMongo._mongoProvisioned = false;
    console.error("[db] seeding failed:", err);
  });
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(dbName);
}

/**
 * Raw client access for the rare operation that needs a session/transaction
 * spanning more than one collection -- e.g. checking a seat limit against the
 * users collection and inserting into it atomically (see
 * src/app/api/invitations/[token]/accept/route.ts). Atlas always provisions a
 * replica set, even on the free tier, so transactions are supported in every
 * environment this app actually runs in.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return connect();
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export async function closeMongoClient(): Promise<void> {
  if (!globalForMongo._mongoClientPromise) return;
  // Let any in-flight provisioning settle first -- closing under it would
  // abort operations mid-run. Safe from the deadlock that stops getDb() from
  // awaiting the same promise, since provisioning never calls this.
  await globalForMongo._mongoProvisioning?.catch(() => {});
  const client = await globalForMongo._mongoClientPromise;
  await client.close();
  globalForMongo._mongoClientPromise = undefined;
  globalForMongo._mongoProvisioning = undefined;
}
