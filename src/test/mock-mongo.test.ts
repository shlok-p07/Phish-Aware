import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "./mock-mongo";

await installMongoMock();

const db = await import("@/db");

/**
 * The "@/db" mock is built by spreading the real module and overriding each
 * collection accessor. Anything left out therefore still resolves to the real
 * accessor, and a unit test using it connects to whatever MONGODB_URI points at
 * -- which is how a new surveyResponses write turned an 8ms test into a 5s
 * timeout against the live database.
 *
 * Failing here is the cheap version of that discovery.
 */
describe("the @/db mock", () => {
  it("overrides the database handle itself, not just the accessors", async () => {
    // This test only ever checked *Collection exports, so getDb slipped past it:
    // code that iterates collection names -- which the cascade deletes do, on
    // purpose -- reached the real driver and four tests sat until they timed out.
    const db = await (
      (await import("@/db")) as unknown as { getDb: () => Promise<{ collection: (n: string) => unknown }> }
    ).getDb();
    const collection = db.collection("attempts") as { find: (q: unknown) => { toArray: () => Promise<unknown[]> } };
    expect(await collection.find({}).toArray()).toEqual([]);
  });

  it("serves an unseeded collection as empty rather than throwing", async () => {
    const db = await (
      (await import("@/db")) as unknown as { getDb: () => Promise<{ collection: (n: string) => unknown }> }
    ).getDb();
    const collection = db.collection("aCollectionNoTestSeeds") as {
      deleteMany: (q: unknown) => Promise<{ deletedCount: number }>;
    };
    expect((await collection.deleteMany({})).deletedCount).toBe(0);
  });

  it("overrides every collection accessor the real module exports", async () => {
    // getCollection is the generic helper the per-collection accessors are built
    // from; it takes a name and is not something a route calls directly.
    const accessors = Object.keys(db).filter(
      (key) => /Collection$/.test(key) && key !== "getCollection",
    );
    // Guard against the filter silently matching nothing.
    expect(accessors.length).toBeGreaterThan(10);

    const reachesRealDb: string[] = [];
    for (const name of accessors) {
      const accessor = (db as unknown as Record<string, () => unknown>)[name];
      if (typeof accessor !== "function") continue;
      try {
        // A faked accessor builds an in-memory collection synchronously and
        // never touches the driver; a real one returns a promise that needs a
        // live connection.
        const result = accessor();
        if (result instanceof Promise) {
          reachesRealDb.push(name);
          // Consume it so an unhandled rejection cannot fail an unrelated test.
          result.catch(() => {});
        }
      } catch {
        reachesRealDb.push(name);
      }
    }

    expect(reachesRealDb).toEqual([]);
  });
});

/**
 * The fake's own semantics. Three separate bugs so far have been "the mock
 * quietly did nothing", so the behaviours routes depend on are asserted here
 * rather than discovered from a failing route test.
 */
describe("the @/db fake's query semantics", () => {
  const collection = () => db.usersCollection();

  beforeEach(resetFakeDbState);

  it("matches a nested field through a dotted key", async () => {
    fakeDbState.users.push({
      _id: new ObjectId(),
      settings: { seatLimit: 25, branding: { accentColor: "#0f766e" } },
    } as never);
    const found = await (await collection()).findOne({ "settings.branding.accentColor": "#0f766e" });
    expect(found).not.toBeNull();
    const miss = await (await collection()).findOne({ "settings.branding.accentColor": "#000000" });
    expect(miss).toBeNull();
  });

  it("upserts through updateOne, applying $setOnInsert", async () => {
    const users = await collection();
    const id = new ObjectId();
    await users.updateOne(
      { email: "new@example.test" },
      { $set: { name: "Set" }, $setOnInsert: { _id: id, createdAt: new Date() } },
      { upsert: true },
    );
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.users[0]!.name).toBe("Set");
    // Seeded from the filter's equality fields, the way MongoDB does it.
    expect(fakeDbState.users[0]!.email).toBe("new@example.test");
  });

  it("does not insert when upsert was not asked for", async () => {
    const users = await collection();
    await users.updateOne({ email: "missing@example.test" }, { $set: { name: "No" } });
    expect(fakeDbState.users).toHaveLength(0);
  });

  it("nests a dotted $set instead of writing a key with a dot in it", async () => {
    const id = new ObjectId();
    fakeDbState.users.push({ _id: id, settings: { seatLimit: 10 } } as never);
    const users = await collection();
    await users.updateOne({ _id: id }, { $set: { "settings.seatLimit": 42 } });
    expect((fakeDbState.users[0]!.settings as { seatLimit: number }).seatLimit).toBe(42);
    expect(fakeDbState.users[0]!["settings.seatLimit"]).toBeUndefined();
  });

  it("throws on a query operator it does not implement", async () => {
    // Rather than silently returning nothing, which reads as a bug in the route.
    // A document has to exist, or the predicate is never called at all.
    fakeDbState.users.push({ _id: new ObjectId(), name: "alice" } as never);
    const users = await collection();
    await expect(users.findOne({ name: { $regex: "^a" } })).rejects.toThrow(/\$regex/);
  });

  it("throws on an update operator it does not implement", async () => {
    const id = new ObjectId();
    fakeDbState.users.push({ _id: id, xp: 1 } as never);
    const users = await collection();
    await expect(users.updateOne({ _id: id }, { $inc: { xp: 1 } } as never)).rejects.toThrow(
      /\$inc/,
    );
  });
});
