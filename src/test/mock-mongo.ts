import { installModuleMock } from "@/test/mock-module-registry";

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

/**
 * Applies a $set the way MongoDB does, including dotted paths.
 *
 * Object.assign stored "settings.branding.accentColor" as a literal key with a
 * dot in it, so a route writing nested settings looked like it had worked while
 * the document the assertions read was untouched. The existing seat-limit test
 * had to hedge with `doc["settings.seatLimit"] ?? doc.settings.seatLimit` to
 * cope, which is the kind of workaround that hides the divergence rather than
 * fixing it.
 */
/** Reads a possibly-dotted path, so a comparison sees the same value applySet writes. */
function readPath(doc: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[key]
          : undefined,
      doc,
    );
}

const SUPPORTED_UPDATE_OPERATORS = new Set(["$set", "$setOnInsert"]);

/**
 * Fails on an update operator this fake does not implement.
 *
 * $inc, $push, $unset and friends would otherwise be dropped on the floor: the
 * write appears to succeed, the document is unchanged, and the test reports a
 * bug in the route.
 */
function assertSupportedUpdate(update: Record<string, unknown>): void {
  const unsupported = Object.keys(update).filter(
    (k) => k.startsWith("$") && !SUPPORTED_UPDATE_OPERATORS.has(k),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `mock-mongo: update operator(s) ${unsupported.join(", ")} are not implemented. ` +
        `Add them to src/test/mock-mongo.ts rather than working around it in the test.`,
    );
  }
}

function applySet(doc: Record<string, unknown>, set: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(set)) {
    if (!path.includes(".")) {
      doc[path] = value;
      continue;
    }
    const keys = path.split(".");
    const leaf = keys.pop()!;
    let target = doc;
    for (const key of keys) {
      const next = target[key];
      // Mongo creates missing intermediate documents; it does not overwrite a
      // non-object with one, but a test hitting that has a bug worth seeing.
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    target[leaf] = value;
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a && typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals: (other: unknown) => boolean }).equals(b);
  }
  return a === b;
}

/**
 * Operators this fake genuinely implements.
 *
 * Anything else throws rather than falling through to an equality check that
 * quietly returns false. Silently-wrong is the failure mode that has cost the
 * most time here: an unsupported operator made a route look broken in tests
 * while working correctly against a real cluster, three separate times. A named
 * error points straight at the gap.
 */
const SUPPORTED_QUERY_OPERATORS = new Set(["$ne", "$lt", "$gt", "$in", "$or"]);

function assertSupportedCondition(key: string, condition: unknown): void {
  if (key.startsWith("$") && !SUPPORTED_QUERY_OPERATORS.has(key)) {
    throw new Error(
      `mock-mongo: query operator ${key} is not implemented. Add it to matches() in ` +
        `src/test/mock-mongo.ts rather than working around it in the test.`,
    );
  }
  if (!condition || typeof condition !== "object" || condition instanceof Date) return;
  if (Array.isArray(condition)) return;
  if (typeof (condition as { equals?: unknown }).equals === "function") return; // ObjectId
  const operators = Object.keys(condition).filter((k) => k.startsWith("$"));
  const unsupported = operators.filter((k) => !SUPPORTED_QUERY_OPERATORS.has(k));
  if (unsupported.length > 0) {
    throw new Error(
      `mock-mongo: query operator(s) ${unsupported.join(", ")} on "${key}" are not ` +
        `implemented. Add them to matches() in src/test/mock-mongo.ts rather than ` +
        `working around it in the test.`,
    );
  }
}

function matches(doc: FakeDoc, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, condition]) => {
    if (key === "$or") {
      return (condition as Record<string, unknown>[]).some((sub) => matches(doc, sub));
    }
    assertSupportedCondition(key, condition);
    // Dotted keys read into nested documents, the way a real filter does.
    const actual = key.includes(".") ? readPath(doc, key) : doc[key];
    if (condition && typeof condition === "object" && "$ne" in condition) {
      return !valuesEqual(actual, (condition as { $ne: unknown }).$ne);
    }
    if (condition && typeof condition === "object" && "$lt" in condition) {
      const bound = (condition as { $lt: unknown }).$lt;
      const value = actual;
      return value instanceof Date && bound instanceof Date
        ? value.getTime() < bound.getTime()
        : (value as number) < (bound as number);
    }
    if (condition && typeof condition === "object" && "$gt" in condition) {
      const bound = (condition as { $gt: unknown }).$gt;
      const value = actual;
      return value instanceof Date && bound instanceof Date
        ? value.getTime() > bound.getTime()
        : (value as number) > (bound as number);
    }
    if (condition && typeof condition === "object" && "$in" in condition) {
      const list = (condition as { $in: unknown[] }).$in;
      return list.some((v) => valuesEqual(actual, v) || valuesEqual(v, actual));
    }
    return valuesEqual(actual, condition);
  });
}

function makeFakeCollection(docs: FakeDoc[]) {
  return {
    findOne: async (query: Record<string, unknown>) => docs.find((d) => matches(d, query)) ?? null,
    // A chainable cursor, because routes legitimately sort and limit. Without
    // sort() a test cannot verify a route whose contract depends on document
    // order, which is the case for anything ranked or recency-weighted.
    find: (query: Record<string, unknown> = {}) => {
      const cursor = (rows: FakeDoc[]) => ({
        sort: (spec: Record<string, 1 | -1>) => {
          const sorted = [...rows].sort((a, b) => {
            for (const [key, dir] of Object.entries(spec)) {
              const av = a[key];
              const bv = b[key];
              if (av === bv) continue;
              // Dates and numbers both order with < ; anything else falls back
              // to string comparison rather than silently comparing as equal.
              const less =
                av instanceof Date && bv instanceof Date
                  ? av.getTime() < bv.getTime()
                  : typeof av === "number" && typeof bv === "number"
                    ? av < bv
                    : String(av) < String(bv);
              return less ? -dir : dir;
            }
            return 0;
          });
          return cursor(sorted);
        },
        limit: (n: number) => cursor(rows.slice(0, n)),
        toArray: async () => rows,
      });
      return cursor(docs.filter((d) => matches(d, query)));
    },
    countDocuments: async (query: Record<string, unknown>) =>
      docs.filter((d) => matches(d, query)).length,
    insertOne: async (doc: FakeDoc) => {
      docs.push(doc);
      return { acknowledged: true, insertedId: doc._id };
    },
    // Enough of bulkWrite for the seed sync: updateOne with $set/$setOnInsert and
    // upsert, which is how authored content reaches an existing database.
    bulkWrite: async (
      ops: {
        updateOne: {
          filter: Record<string, unknown>;
          update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> };
          upsert?: boolean;
        };
      }[],
    ) => {
      let upsertedCount = 0;
      let modifiedCount = 0;
      for (const op of ops) {
        const { filter, update, upsert } = op.updateOne;
        assertSupportedUpdate(update as unknown as Record<string, unknown>);
        const found = docs.find((d) => matches(d, filter));
        if (found) {
          if (update.$set) {
            // Only count it as modified if something actually differs, which is
            // what lets a caller report an honest 'nothing changed'.
            const changed = Object.entries(update.$set).some(
              ([k, v]) => JSON.stringify(readPath(found, k)) !== JSON.stringify(v),
            );
            applySet(found, update.$set);
            if (changed) modifiedCount++;
          }
        } else if (upsert) {
          // MongoDB seeds an upserted document from the filter's equality fields,
          // which is how a { _id: slug } upsert gets its _id. Without this the new
          // document has no id and nothing can find it again.
          const fromFilter = Object.fromEntries(
            Object.entries(filter).filter(([, v]) => v === null || typeof v !== "object"),
          );
          // Built through applySet for the same reason as the update path: a
          // dotted key must nest, not become a literal key with a dot in it.
          const created = { ...fromFilter } as Record<string, unknown>;
          applySet(created, update.$setOnInsert ?? {});
          applySet(created, update.$set ?? {});
          docs.push(created as FakeDoc);
          upsertedCount++;
        }
      }
      return { acknowledged: true, upsertedCount, modifiedCount };
    },
    insertMany: async (incoming: FakeDoc[]) => {
      docs.push(...incoming);
      return { acknowledged: true, insertedCount: incoming.length };
    },
    updateMany: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
    ) => {
      assertSupportedUpdate(update as Record<string, unknown>);
      const matched = docs.filter((d) => matches(d, filter));
      if (update.$set) {
        for (const doc of matched) applySet(doc, update.$set);
      }
      return { matchedCount: matched.length, modifiedCount: matched.length };
    },
    // Honours upsert and $setOnInsert, which bulkWrite already did. Without it,
    // an upserting updateOne silently wrote nothing and the code under test
    // looked broken while working perfectly against a real cluster.
    updateOne: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
      options?: { upsert?: boolean },
    ) => {
      assertSupportedUpdate(update as Record<string, unknown>);
      const doc = docs.find((d) => matches(d, filter));
      if (doc) {
        if (update.$set) applySet(doc, update.$set);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (!options?.upsert) {
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
      // MongoDB seeds an upserted document from the filter's equality fields,
      // then applies $setOnInsert and $set over the top.
      const created = Object.fromEntries(
        Object.entries(filter).filter(([, v]) => v === null || typeof v !== "object"),
      ) as Record<string, unknown>;
      for (const [k, v] of Object.entries(filter)) {
        // ObjectId values are objects but are still equality conditions.
        if (v && typeof v === "object" && typeof (v as { equals?: unknown }).equals === "function") {
          created[k] = v;
        }
      }
      applySet(created, update.$setOnInsert ?? {});
      applySet(created, update.$set ?? {});
      docs.push(created as FakeDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    },
    findOneAndUpdate: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
    ) => {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return null;
      if (update.$set) applySet(doc, update.$set);
      return doc;
    },
    deleteOne: async (filter: Record<string, unknown>) => {
      const index = docs.findIndex((d) => matches(d, filter));
      if (index === -1) return { acknowledged: true, deletedCount: 0 };
      docs.splice(index, 1);
      return { acknowledged: true, deletedCount: 1 };
    },
    deleteMany: async (filter: Record<string, unknown>) => {
      let deleted = 0;
      for (let i = docs.length - 1; i >= 0; i--) {
        if (matches(docs[i]!, filter)) {
          docs.splice(i, 1);
          deleted++;
        }
      }
      return { acknowledged: true, deletedCount: deleted };
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
  attempts: [] as FakeDoc[],
  campaigns: [] as FakeDoc[],
  assignments: [] as FakeDoc[],
  departments: [] as FakeDoc[],
  lessons: [] as FakeDoc[],
  auditLogs: [] as FakeDoc[],
  notifications: [] as FakeDoc[],
  consents: [] as FakeDoc[],
  reviews: [] as FakeDoc[],
  lessonCompletions: [] as FakeDoc[],
  surveyResponses: [] as FakeDoc[],
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
  fakeDbState.attempts = [];
  fakeDbState.campaigns = [];
  fakeDbState.assignments = [];
  fakeDbState.departments = [];
  fakeDbState.lessons = [];
  fakeDbState.auditLogs = [];
  fakeDbState.notifications = [];
  fakeDbState.consents = [];
  fakeDbState.reviews = [];
  fakeDbState.lessonCompletions = [];
  fakeDbState.surveyResponses = [];
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

/**
 * Name-keyed access, for code that goes through getDb().collection(name) rather
 * than a typed accessor.
 *
 * The cascade deletes iterate a list of collection names, which is the point --
 * a hand-written list of accessors is what drifted out of date in the first
 * place. Without this the fake had no answer for those calls and they reached
 * the real driver, so four tests sat there until they timed out.
 */
function fakeCollectionByName(name: string) {
  const state = fakeDbState as unknown as Record<string, FakeDoc[] | undefined>;
  if (!Array.isArray(state[name])) {
    // Created on demand: a test that deletes from a collection it never seeded
    // should see an empty collection, not a crash.
    state[name] = [];
  }
  return makeFakeCollection(state[name]!);
}

/** Idempotent -- safe to call from every test file that needs this "@/db" mock. */
export async function installMongoMock() {
  // Spreading the real module keeps helpers like toObjectId and specDefaults
  // working, but it also means any collection accessor NOT overridden below
  // falls through to the real one and talks to the actual database from a unit
  // test -- slow, and it writes to whatever MONGODB_URI points at. The parity
  // test in mock-mongo.test.ts fails if a new accessor is ever left out.
  const realDb = await import("@/db");
  installModuleMock("@/db", "@/test/mock-mongo", () => ({
    ...realDb,
    usersCollection: () => makeFakeCollection(fakeDbState.users),
    attemptsCollection: () => makeFakeCollection(fakeDbState.attempts),
    campaignsCollection: () => makeFakeCollection(fakeDbState.campaigns),
    assignmentsCollection: () => makeFakeCollection(fakeDbState.assignments),
    departmentsCollection: () => makeFakeCollection(fakeDbState.departments),
    lessonsCollection: () => makeFakeCollection(fakeDbState.lessons),
    auditLogsCollection: () => makeFakeCollection(fakeDbState.auditLogs),
    notificationsCollection: () => makeFakeCollection(fakeDbState.notifications),
    consentsCollection: () => makeFakeCollection(fakeDbState.consents),
    reviewsCollection: () => makeFakeCollection(fakeDbState.reviews),
    lessonCompletionsCollection: () => makeFakeCollection(fakeDbState.lessonCompletions),
    surveyResponsesCollection: () => makeFakeCollection(fakeDbState.surveyResponses),
    scenariosCollection: () => makeFakeCollection(fakeDbState.scenarios),
    organizationsCollection: () => makeFakeCollection(fakeDbState.organizations),
    invitationsCollection: () => makeFakeCollection(fakeDbState.invitations),
    ssoConnectionsCollection: () => makeFakeCollection(fakeDbState.ssoConnections),
    ssoStatesCollection: () => makeFakeCollection(fakeDbState.ssoStates),
    sessionsCollection: () => makeFakeCollection(fakeDbState.sessions),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake client only needs startSession(), not the full MongoClient surface.
    getMongoClient: async (): Promise<any> => ({ startSession: fakeSession }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake Db only needs collection().
    getDb: async (): Promise<any> => ({ collection: fakeCollectionByName }),
  }));
}
