import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import { checkBsonSchema } from "@/test/bson-schema";
import { LESSONS } from "@/server/lessons";
import { buildDemoDataset, DEMO_DOMAIN, RANDOM_TOKEN, type DemoDataset } from "./demoDataset";
import { recordProvisioning, renderDemoSeed } from "./mongoshExport";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const dataset = buildDemoDataset(NOW);
const rows = (d: DemoDataset) => Object.entries(d) as [string, Record<string, unknown>[]][];

async function validators(): Promise<Map<string, Record<string, unknown>>> {
  const { collections } = await recordProvisioning();
  return new Map(
    collections.map((c) => [c.name, (c.validator as { $jsonSchema: Record<string, unknown> }).$jsonSchema]),
  );
}

describe("checkBsonSchema", () => {
  // The dataset tests below are only as good as this checker, so prove it
  // rejects things rather than trusting that it does.
  const schema = {
    bsonType: "object",
    required: ["id", "kind"],
    properties: {
      id: { bsonType: "objectId" },
      kind: { enum: ["a", "b"] },
      score: { bsonType: ["int", "double"], minimum: 0, maximum: 100 },
      tags: { bsonType: "array", items: { bsonType: "string" } },
      at: { bsonType: ["date", "null"] },
    },
  };

  it("accepts a valid document", () => {
    expect(checkBsonSchema({ id: new ObjectId(), kind: "a", score: 5, tags: ["x"], at: null }, schema)).toEqual([]);
  });

  it("rejects a missing field, a wrong type, a bad enum, a range violation and a bad array item", () => {
    const problems = checkBsonSchema({ id: "not-an-id", score: 101, tags: [1], at: "2026-01-01" }, schema);
    expect(problems).toEqual(
      expect.arrayContaining([
        "$.kind: required",
        "$.id: expected objectId, got string",
        "$.score: 101 is above 100",
        "$.tags[0]: expected string, got int",
        "$.at: expected date|null, got string",
      ]),
    );
    expect(checkBsonSchema({ id: new ObjectId(), kind: "c" }, schema)).toEqual([
      '$.kind: "c" is not one of ["a","b"]',
    ]);
  });

  it("refuses keywords it does not implement", () => {
    expect(() => checkBsonSchema("x", { pattern: "^a" })).toThrow("does not implement pattern");
  });
});

describe("the demo dataset", () => {
  it("only uses collections the app provisions, and every document passes its validator", async () => {
    const schemas = await validators();
    for (const [collection, docs] of rows(dataset)) {
      const schema = schemas.get(collection);
      expect(schema, `${collection} is not provisioned`).toBeDefined();
      for (const doc of docs) {
        expect(checkBsonSchema(doc, schema!), `${collection} ${String(doc._id)}`).toEqual([]);
      }
    }
  });

  it("uses fixed, unique demo ids, mirrored into each named primary key", () => {
    const seen = new Set<string>();
    for (const [collection, docs] of rows(dataset)) {
      expect(docs.length, collection).toBeGreaterThan(0);
      for (const doc of docs) {
        const id = doc._id as ObjectId;
        expect(id.toHexString().startsWith("de")).toBe(true);
        expect(seen.has(id.toHexString())).toBe(false);
        seen.add(id.toHexString());
        const mirrors = Object.entries(doc).filter(([k, v]) => k !== "_id" && v instanceof ObjectId && v.equals(id));
        expect(mirrors.length, `${collection} has no primary key mirroring _id`).toBe(1);
      }
    }
    // Built twice, it is the same data -- the property re-seeding relies on.
    expect(buildDemoDataset(NOW)).toEqual(dataset);
  });

  it("only references documents that exist", () => {
    const has = (collection: keyof DemoDataset, id: unknown) =>
      id === null || dataset[collection].some((d) => d._id.equals(id as ObjectId));
    const org = dataset.organizations[0]!._id;
    const lessonIds = new Set(LESSONS.map((l) => l.id));

    for (const [collection, docs] of rows(dataset)) {
      for (const doc of docs) {
        if ("orgId" in doc && collection !== "organizations") expect(doc.orgId).toEqual(org);
        if ("userId" in doc && collection !== "users") expect(has("users", doc.userId)).toBe(true);
        if ("scenarioId" in doc && collection !== "scenarios") expect(has("scenarios", doc.scenarioId)).toBe(true);
        if ("campaignId" in doc && collection !== "campaigns") expect(has("campaigns", doc.campaignId)).toBe(true);
      }
    }
    for (const d of dataset.departments) expect(has("users", d.managerId)).toBe(true);
    for (const c of dataset.campaigns) {
      expect(has("users", c.createdBy)).toBe(true);
      for (const s of c.scenarioIds) expect(has("scenarios", s)).toBe(true);
    }
    for (const i of dataset.invitations) {
      expect(has("users", i.invitedBy)).toBe(true);
      expect(has("departments", i.departmentId)).toBe(true);
    }
    for (const a of dataset.auditLogs) expect(has("users", a.actorId)).toBe(true);
    for (const n of dataset.notifications) expect(has("campaigns", n.subjectId)).toBe(true);
    for (const l of dataset.lessonCompletions) expect(lessonIds.has(l.lessonId)).toBe(true);
  });

  it("cannot be signed into, and keeps out of other users' leaderboards", () => {
    for (const u of dataset.users) {
      expect(u.passwordHash).toBeNull();
      // isDemo users are shown to every learner without an org (see the
      // leaderboard route); these belong to the demo org only.
      expect(u.isDemo).toBeUndefined();
      expect(u.email!.endsWith(`@${DEMO_DOMAIN}`)).toBe(true);
    }
    expect(dataset.invitations.every((i) => i.token === RANDOM_TOKEN)).toBe(true);
  });

  it("gives members the progress their attempts earned", () => {
    for (const u of dataset.users) {
      const earned = dataset.attempts.filter((a) => a.userId.equals(u._id)).reduce((s, a) => s + a.xpAwarded, 0);
      expect(u.xp).toBe(earned);
    }
  });
});

describe("database/init/03-seed.js", () => {
  const script = readFileSync(join(import.meta.dirname, "..", "..", "database", "init", "03-seed.js"), "utf8");

  it("is up to date with demoDataset.ts (run `bun run db:export-schema` if not)", () => {
    expect(script).toBe(renderDemoSeed());
  });

  type Store = Map<string, Map<string, Record<string, unknown>>>;
  const storeWith = (users: Record<string, unknown>[]): Store =>
    new Map([["users", new Map(users.map((u) => [String(u._id), u]))]]);

  /** Runs the committed script against `store`, an in-memory stand-in for mongosh's `db`. */
  function runSeed(store: Store, env: Record<string, string> = {}) {
    const collection = (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      return store.get(name)!;
    };
    const output: string[] = [];
    // Widened explicitly: assigned only inside quit(), so TS would narrow it to null.
    let exitCode = null as number | null;
    const db = {
      getSiblingDB: () => db,
      getCollection: (name: string) => ({
        replaceOne: (filter: { _id: ObjectId }, doc: Record<string, unknown>) => {
          collection(name).set(String(filter._id), doc);
        },
        deleteMany: (filter: { _id: { $in: ObjectId[] } }) => {
          const ids = new Set(filter._id.$in.map(String));
          const before = collection(name).size;
          for (const key of [...collection(name).keys()]) if (ids.has(key)) collection(name).delete(key);
          return { deletedCount: before - collection(name).size };
        },
        countDocuments: (filter: { _id: { $nin: ObjectId[] } }) => {
          const excluded = new Set(filter._id.$nin.map(String));
          return [...collection(name).values()].filter((d) => !excluded.has(String(d._id)) && d.isDemo !== true)
            .length;
        },
      }),
    };
    class Quit extends Error {}
    try {
      runInNewContext(script, {
        db,
        ObjectId,
        Date,
        process: { env },
        require: createRequire(import.meta.url),
        print: (line: string) => output.push(line),
        quit: (code: number) => {
          exitCode = code;
          throw new Quit();
        },
      });
    } catch (e) {
      if (!(e instanceof Quit)) throw e;
    }
    return { store, output, exitCode };
  }

  const realUser = { _id: new ObjectId(), name: "A real person" };
  const fixture = { _id: new ObjectId(), name: "Leaderboard fixture", isDemo: true };

  it("seeds every demo document, and the revived documents pass the validators", async () => {
    const { store, exitCode } = runSeed(storeWith([fixture]));
    const schemas = await validators();
    expect(exitCode).toBeNull();
    for (const [collection, docs] of rows(dataset)) {
      const seeded = [...(store.get(collection)?.values() ?? [])].filter((d) => d !== fixture);
      expect(seeded.length, collection).toBe(docs.length);
      for (const doc of seeded) expect(checkBsonSchema(doc, schemas.get(collection)!)).toEqual([]);
    }
    // Relative dates are rebuilt from the clock: the open campaign is still due in the future.
    const mandatory = [...store.get("campaigns")!.values()].find((c) => c.type === "mandatory")!;
    expect((mandatory.dueDate as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("generates a fresh invitation token on every run", () => {
    const token = () => [...runSeed(storeWith([])).store.get("invitations")!.values()][0]!.token as string;
    const first = token();
    expect(first).not.toBe(RANDOM_TOKEN);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token()).not.toBe(first);
  });

  it("refuses a database with real users unless forced", () => {
    const refused = runSeed(storeWith([realUser]));
    expect(refused.exitCode).toBe(1);
    expect(refused.output.join("\n")).toContain("refusing");
    expect(refused.store.get("organizations")).toBeUndefined();

    const forced = runSeed(storeWith([realUser]), { DEMO_SEED_FORCE: "1" });
    expect(forced.exitCode).toBeNull();
    expect(forced.store.get("organizations")!.size).toBe(1);
  });

  it("is idempotent, and removal deletes exactly the demo documents", () => {
    const store = storeWith([realUser, fixture]);
    runSeed(store, { DEMO_SEED_FORCE: "1" });
    const sizes = () => [...store].map(([name, docs]) => [name, docs.size]);
    const afterFirst = sizes();
    runSeed(store, { DEMO_SEED_FORCE: "1" });
    expect(sizes()).toEqual(afterFirst);

    const { exitCode } = runSeed(store, { DEMO_SEED_REMOVE: "1" });
    expect(exitCode).toBeNull();
    for (const [name, docs] of store) {
      expect([...docs.values()], name).toEqual(name === "users" ? [realUser, fixture] : []);
    }
  });
});
