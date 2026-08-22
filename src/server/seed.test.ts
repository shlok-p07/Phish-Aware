import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const { seedIfEmpty } = await import("./seed");
const { LESSONS } = await import("./lessons");
const { SEED_SCENARIOS } = await import("./seedScenarios");

/**
 * Coverage for how authored content reaches a database that already exists.
 *
 * All of this was verified by hand against a running instance and by nothing
 * else, which is uncomfortable for the code path that decides whether a lesson
 * fix or a new library scenario ever reaches a customer -- the previous
 * "insert only if the collection is empty" guard meant it never did.
 */
let logSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  resetFakeDbState();
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

const lessonRow = (id: string) => fakeDbState.lessons?.find((l) => l._id === id);

describe("seedIfEmpty on an empty database", () => {
  it("inserts every lesson and every library scenario", async () => {
    await seedIfEmpty();

    expect(fakeDbState.lessons).toHaveLength(LESSONS.length);
    expect(fakeDbState.scenarios).toHaveLength(SEED_SCENARIOS.length);
  });

  it("creates the demo leaderboard users with no credential at all", async () => {
    await seedIfEmpty();

    const demos = fakeDbState.users.filter((u) => u.isDemo);
    expect(demos.length).toBeGreaterThan(0);
    // Six accounts with a repo-committed password used to be loginable on any
    // deployment that had run the seed.
    expect(demos.every((u) => u.passwordHash === null)).toBe(true);
  });
});

describe("seedIfEmpty run again", () => {
  it("changes nothing the second time", async () => {
    await seedIfEmpty();
    const lessons = fakeDbState.lessons.length;
    const scenarios = fakeDbState.scenarios.length;
    const users = fakeDbState.users.length;

    await seedIfEmpty();

    expect(fakeDbState.lessons).toHaveLength(lessons);
    expect(fakeDbState.scenarios).toHaveLength(scenarios);
    expect(fakeDbState.users).toHaveLength(users);
  });

  it("reports nothing on a clean second run", async () => {
    await seedIfEmpty();
    logSpy!.mockClear();

    await seedIfEmpty();

    // updatedAt used to be rewritten on every boot, so it reported six lessons
    // "updated" every restart and the timestamp meant last restart rather than
    // last edit.
    const said = logSpy!.mock.calls.flat().join(" ");
    expect(said).not.toContain("Lessons synced");
    expect(said).not.toContain("Seeded");
  });
});

describe("seedIfEmpty against an already-seeded database", () => {
  it("republishes a lesson whose content has drifted", async () => {
    await seedIfEmpty();
    const target = LESSONS[0]!;
    const stored = lessonRow(target.id)!;
    stored.screens = [{ heading: "Stale", body: "Old content" }];

    await seedIfEmpty();

    // The old guard skipped this entirely, so a content fix reached no database
    // past its first boot.
    expect(lessonRow(target.id)!.screens).toEqual(target.screens);
  });

  it("republishes a renamed lesson title", async () => {
    await seedIfEmpty();
    const target = LESSONS[1]!;
    lessonRow(target.id)!.title = "Something else";

    await seedIfEmpty();

    expect(lessonRow(target.id)!.title).toBe(target.title);
  });

  it("adds a library scenario that is missing without duplicating the rest", async () => {
    await seedIfEmpty();
    const before = fakeDbState.scenarios.length;
    fakeDbState.scenarios.splice(0, 1);

    await seedIfEmpty();

    expect(fakeDbState.scenarios).toHaveLength(before);
  });

  it("leaves generated scenarios alone", async () => {
    await seedIfEmpty();
    fakeDbState.scenarios.push({
      _id: { toString: () => "gen" } as never,
      source: "ai_generated",
      vector: "email",
      subject: "Generated",
      sender: "x",
    });
    const before = fakeDbState.scenarios.length;

    await seedIfEmpty();

    // This collection accumulates generated content; replacing it wholesale
    // would throw away everything the pool had built up.
    expect(fakeDbState.scenarios).toHaveLength(before);
    expect(fakeDbState.scenarios.some((s) => s.source === "ai_generated")).toBe(true);
  });

  it("revokes a credential left on a demo user by an older seed", async () => {
    await seedIfEmpty();
    const demo = fakeDbState.users.find((u) => u.isDemo)!;
    demo.passwordHash = "scrypt$leftover-from-an-old-seed";
    demo.isDemo = false;

    await seedIfEmpty();

    const after = fakeDbState.users.find((u) => u.email === demo.email)!;
    expect(after.passwordHash).toBeNull();
    expect(after.isDemo).toBe(true);
  });

  it("does not touch a real user account", async () => {
    await seedIfEmpty();
    fakeDbState.users.push({
      _id: { toString: () => "real" } as never,
      email: "real.person@acme.test",
      passwordHash: "scrypt$their-real-password",
      isGuest: false,
      orgId: null,
    });

    await seedIfEmpty();

    const real = fakeDbState.users.find((u) => u.email === "real.person@acme.test")!;
    expect(real.passwordHash).toBe("scrypt$their-real-password");
    expect(real.isDemo).toBeUndefined();
  });
});
