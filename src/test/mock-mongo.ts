import { mock } from "bun:test";

/**
 * A minimal in-memory stand-in for the handful of MongoDB collection/session
 * methods this app's route handlers actually call, shared across test files
 * the same way src/test/mock-api-client.ts and src/test/mock-next-navigation.ts
 * are -- Bun's mock.module() is process-global, so route tests that fake
 * "@/db" need one comprehensive, reusable factory rather than each rolling
 * their own partial one.
 *
 * This does not model real MongoDB transaction semantics (write-conflict
 * detection, snapshot isolation, automatic retry) -- there is no substitute
 * for a real replica set for that. What it does let a test verify: that a
 * route's *logic* is correct given a particular sequential state (a seat is
 * available / already full / etc.), and that the route actually calls
 * startSession()/withTransaction()/endSession() rather than skipping them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ObjectId's real equals() signature is narrower than any generic doc-shape can declare structurally.
type FakeDoc = { _id: { toString(): string; equals?: (other: any) => boolean } } & Record<string, unknown>;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a && typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals: (other: unknown) => boolean }).equals(b);
  }
  return a === b;
}

function matches(doc: FakeDoc, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, condition]) => {
    if (condition && typeof condition === "object" && "$ne" in condition) {
      return !valuesEqual(doc[key], (condition as { $ne: unknown }).$ne);
    }
    return valuesEqual(doc[key], condition);
  });
}

function makeFakeCollection(docs: FakeDoc[]) {
  return {
    findOne: async (query: Record<string, unknown>) => docs.find((d) => matches(d, query)) ?? null,
    find: (query: Record<string, unknown> = {}) => ({
      toArray: async () => docs.filter((d) => matches(d, query)),
    }),
    countDocuments: async (query: Record<string, unknown>) =>
      docs.filter((d) => matches(d, query)).length,
    insertOne: async (doc: FakeDoc) => {
      docs.push(doc);
      return { acknowledged: true, insertedId: doc._id };
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
      const doc = docs.find((d) => matches(d, filter));
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
    },
    findOneAndUpdate: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
    ) => {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return null;
      if (update.$set) Object.assign(doc, update.$set);
      return doc;
    },
    findOneAndDelete: async (filter: Record<string, unknown>) => {
      const index = docs.findIndex((d) => matches(d, filter));
      if (index === -1) return null;
      const [doc] = docs.splice(index, 1);
      return doc ?? null;
    },
  };
}

/** Shared, mutable seed data -- one array per collection name. */
export const fakeDbState = {
  users: [] as FakeDoc[],
  scenarios: [] as FakeDoc[],
  organizations: [] as FakeDoc[],
  invitations: [] as FakeDoc[],
  ssoConnections: [] as FakeDoc[],
  ssoStates: [] as FakeDoc[],
  sessions: [] as FakeDoc[],
  sessionCalls: { started: 0, ended: 0 },
};

export function resetFakeDbState() {
  fakeDbState.users = [];
  fakeDbState.scenarios = [];
  fakeDbState.organizations = [];
  fakeDbState.invitations = [];
  fakeDbState.ssoConnections = [];
  fakeDbState.ssoStates = [];
  fakeDbState.sessions = [];
  fakeDbState.sessionCalls = { started: 0, ended: 0 };
}

function fakeSession() {
  fakeDbState.sessionCalls.started += 1;
  return {
    // No real conflict/retry semantics -- see module doc comment.
    withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    endSession: async () => {
      fakeDbState.sessionCalls.ended += 1;
    },
  };
}

let installed = false;

/** Idempotent -- safe to call from every test file that needs this "@/db" mock. */
export async function installMongoMock() {
  if (installed) return;
  installed = true;
  const realDb = await import("@/db");
  mock.module("@/db", () => ({
    ...realDb,
    usersCollection: () => makeFakeCollection(fakeDbState.users),
    scenariosCollection: () => makeFakeCollection(fakeDbState.scenarios),
    organizationsCollection: () => makeFakeCollection(fakeDbState.organizations),
    invitationsCollection: () => makeFakeCollection(fakeDbState.invitations),
    ssoConnectionsCollection: () => makeFakeCollection(fakeDbState.ssoConnections),
    ssoStatesCollection: () => makeFakeCollection(fakeDbState.ssoStates),
    sessionsCollection: () => makeFakeCollection(fakeDbState.sessions),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake client only needs startSession(), not the full MongoClient surface.
    getMongoClient: async (): Promise<any> => ({ startSession: fakeSession }),
  }));
}
