import { MongoClient, type Db, type Collection, type Document } from "mongodb";

const dbName = process.env.MONGODB_DB ?? "phishaware";

// Cache the client on globalThis so Next.js dev-mode hot-reload doesn't open
// a fresh connection pool on every module reload.
const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> };

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
  }
  return globalForMongo._mongoClientPromise;
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
