import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const { markLessonComplete, completedLessonIds, countCompletedFrom } = await import(
  "./lessonCompletion"
);

const USER = new ObjectId();
const OTHER = new ObjectId();
const ORG = new ObjectId();
const T0 = new Date("2026-08-20T10:00:00.000Z");
const LATER = new Date("2026-09-01T10:00:00.000Z");

describe("markLessonComplete", () => {
  beforeEach(resetFakeDbState);

  it("records a completion", async () => {
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    expect(fakeDbState.lessonCompletions).toHaveLength(1);
    const [row] = fakeDbState.lessonCompletions;
    expect(row.lessonId).toBe("email-phishing");
    expect((row.userId as ObjectId).equals(USER)).toBe(true);
    expect(row.completedAt).toEqual(T0);
  });

  it("does not duplicate when a lesson is re-read", async () => {
    // The page fires this whenever the summary screen is reached, so it has to
    // be safe to call repeatedly.
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    await markLessonComplete(USER, "email-phishing", ORG, LATER);
    expect(fakeDbState.lessonCompletions).toHaveLength(1);
  });

  it("keeps the first completion date, not the latest visit", async () => {
    // completedAt is what a deadline is judged against; re-reading in December
    // must not make August's work look late.
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    await markLessonComplete(USER, "email-phishing", ORG, LATER);
    expect(fakeDbState.lessonCompletions[0]!.completedAt).toEqual(T0);
  });

  it("accepts a learner with no organisation", async () => {
    await markLessonComplete(USER, "email-phishing", null, T0);
    expect(fakeDbState.lessonCompletions[0]!.orgId).toBeNull();
  });

  it("keeps one learner's reading separate from another's", async () => {
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    await markLessonComplete(OTHER, "email-phishing", ORG, T0);
    expect(fakeDbState.lessonCompletions).toHaveLength(2);
  });
});

describe("completedLessonIds", () => {
  beforeEach(resetFakeDbState);

  it("is empty for someone who has read nothing", async () => {
    expect((await completedLessonIds(USER)).size).toBe(0);
  });

  it("returns only this learner's lessons", async () => {
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    await markLessonComplete(OTHER, "smishing", ORG, T0);
    const mine = await completedLessonIds(USER);
    expect([...mine]).toEqual(["email-phishing"]);
  });
});

describe("countCompletedFrom", () => {
  beforeEach(resetFakeDbState);

  it("counts only the lessons a campaign asked for", async () => {
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    await markLessonComplete(USER, "quishing", ORG, T0);
    expect(await countCompletedFrom(USER, ["email-phishing", "smishing"])).toBe(1);
  });

  it("is zero when the campaign assigns no reading", async () => {
    await markLessonComplete(USER, "email-phishing", ORG, T0);
    expect(await countCompletedFrom(USER, [])).toBe(0);
  });
});
