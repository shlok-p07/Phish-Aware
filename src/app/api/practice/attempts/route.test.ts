import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { POST } = await import("./route");

const ME = new ObjectId();
const SCENARIO = new ObjectId();

function seed({ badges = [] as string[], priorCorrect = 0 } = {}) {
  fakeDbState.users.push({
    _id: ME,
    userId: ME,
    orgId: null,
    name: "Sam",
    xp: 0,
    level: "beginner",
    streak: 0,
    lastActiveDate: null,
    badges,
  });
  fakeSessionState.userId = ME;
  fakeDbState.scenarios.push({
    _id: SCENARIO,
    scenarioId: SCENARIO,
    orgId: null,
    vector: "email",
    isPhish: true,
    isOnboarding: false,
    difficulty: 2,
    sender: "IT Desk <it@examp1e.test>",
    subject: "Password expiry",
    body: "Reset now",
    links: [],
    attachments: [],
    cues: [
      { type: "urgency_language", severity: 4, explanation: "Pressure to act now." },
      { type: "sender_domain", severity: 4, explanation: "Look-alike domain." },
    ],
    source: "library",
  });
  for (let i = 0; i < priorCorrect; i++) {
    const id = new ObjectId();
    fakeDbState.attempts.push({ _id: id, attemptId: id, userId: ME, scenarioId: SCENARIO, correct: true });
  }
}

function submit(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/practice/attempts", {
      method: "POST",
      body: JSON.stringify({ scenarioId: SCENARIO.toHexString(), confidence: 80, ...body }),
    }),
  );
}

describe("POST /api/practice/attempts", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
  });

  it("stores the de-duplicated selection that was actually graded", async () => {
    seed();

    const res = await submit({
      verdict: true,
      selectedCues: ["urgency_language", "urgency_language", "sender_domain"],
    });

    expect(res.status).toBe(200);
    expect(fakeDbState.attempts).toHaveLength(1);
    expect(fakeDbState.attempts[0].selectedCues).toEqual(["urgency_language", "sender_domain"]);
  });

  it("awards first_catch on the learner's first correct attempt", async () => {
    seed();

    const body = await (await submit({ verdict: true, selectedCues: ["urgency_language"] })).json();

    // The attempt being graded is already in the collection when badges are
    // decided, so it must not count as a *prior* correct attempt.
    expect(body.badgesEarned).toContain("first_catch");
    expect(fakeDbState.users[0].badges).toContain("first_catch");
  });

  it("does not award first_catch when the learner already has a correct attempt", async () => {
    seed({ priorCorrect: 1 });

    const body = await (await submit({ verdict: true, selectedCues: [] })).json();

    expect(body.badgesEarned).not.toContain("first_catch");
  });

  it("does not award first_catch for a wrong verdict", async () => {
    seed();

    const body = await (await submit({ verdict: false, selectedCues: [] })).json();

    expect(body.badgesEarned).not.toContain("first_catch");
  });
});
