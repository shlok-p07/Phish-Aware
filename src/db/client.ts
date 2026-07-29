import { MongoClient, type Db, type Collection, type Document } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI must be set. Did you forget to provision a database?");
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "phishaware";

// Cache the client on globalThis so Next.js dev-mode hot-reload doesn't open
// a fresh connection pool on every module reload.
const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  return new MongoClient(uri).connect();
}

const clientPromise = globalForMongo._mongoClientPromise ?? connect();
if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClientPromise = clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export async function closeMongoClient(): Promise<void> {
  const client = await clientPromise;
  await client.close();
}
