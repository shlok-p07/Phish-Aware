import { describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import {
  assignmentProgress,
  attemptQualifies,
  attemptsByUser,
  describeFocus,
} from "./trainingProgress";

const ASSIGNED = new Date("2026-08-01T00:00:00Z");
const NOW = new Date("2026-08-10T00:00:00Z");

const at = (iso: string) => ({ createdAt: new Date(iso) });

describe("assignmentProgress", () => {
  it("starts at assigned with nothing done", () => {
    expect(
      assignmentProgress({
        assignedAt: ASSIGNED,
        requiredScenarios: 3,
        dueDate: null,
        attempts: [],
        now: NOW,
      }),
    ).toEqual({ completedScenarios: 0, completedLessons: 0, requiredLessons: 0, status: "assigned" });
  });

  it("counts only practice done after the assignment", () => {
    // Crediting earlier work would let an active learner complete a brand-new
    // requirement without doing anything.
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 3,
      dueDate: null,
      attempts: [at("2026-07-30T00:00:00Z"), at("2026-08-02T00:00:00Z")],
      now: NOW,
    });

    expect(progress).toEqual({ completedScenarios: 1, completedLessons: 0, requiredLessons: 0, status: "in_progress" });
  });

  it("counts an attempt made in the same instant as the assignment", () => {
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 1,
      dueDate: null,
      attempts: [{ createdAt: ASSIGNED }],
      now: NOW,
    });

    expect(progress.status).toBe("completed");
  });

  it("completes once the requirement is met and caps the count", () => {
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 2,
      dueDate: null,
      attempts: [at("2026-08-02T00:00:00Z"), at("2026-08-03T00:00:00Z"), at("2026-08-04T00:00:00Z")],
      now: NOW,
    });

    expect(progress).toEqual({ completedScenarios: 2, completedLessons: 0, requiredLessons: 0, status: "completed" });
  });

  it("is overdue when the deadline has passed and the work has not been done", () => {
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 3,
      dueDate: new Date("2026-08-05T00:00:00Z"),
      attempts: [at("2026-08-02T00:00:00Z")],
      now: NOW,
    });

    expect(progress.status).toBe("overdue");
  });

  it("prefers completed over overdue", () => {
    // A past deadline on finished work is not a debt, and chasing somebody for
    // it is exactly the sort of thing that makes people distrust the tool.
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 1,
      dueDate: new Date("2026-08-05T00:00:00Z"),
      attempts: [at("2026-08-02T00:00:00Z")],
      now: NOW,
    });

    expect(progress.status).toBe("completed");
  });

  it("is not overdue before the deadline", () => {
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 3,
      dueDate: new Date("2026-09-01T00:00:00Z"),
      attempts: [],
      now: NOW,
    });

    expect(progress.status).toBe("assigned");
  });

  it("treats a campaign with no requirement as never completable", () => {
    // Zero required scenarios is informational, so it reports activity without
    // ever claiming somebody has discharged an obligation that was never set.
    const progress = assignmentProgress({
      assignedAt: ASSIGNED,
      requiredScenarios: 0,
      dueDate: null,
      attempts: [at("2026-08-02T00:00:00Z"), at("2026-08-03T00:00:00Z")],
      now: NOW,
    });

    expect(progress).toEqual({ completedScenarios: 2, completedLessons: 0, requiredLessons: 0, status: "in_progress" });
  });
});

describe("attemptsByUser", () => {
  it("groups attempts by their owner", () => {
    const a = new ObjectId();
    const b = new ObjectId();

    const grouped = attemptsByUser([
      { userId: a, createdAt: new Date() },
      { userId: b, createdAt: new Date() },
      { userId: a, createdAt: new Date() },
    ]);

    expect(grouped.get(a.toString())).toHaveLength(2);
    expect(grouped.get(b.toString())).toHaveLength(1);
  });

  it("returns nothing for somebody with no attempts", () => {
    expect(attemptsByUser([]).get(new ObjectId().toString())).toBeUndefined();
  });
});

describe("attemptQualifies", () => {
  const at = { createdAt: new Date(), vector: "email", difficulty: 3, cues: ["sender_domain"] };

  it("counts everything when the campaign asks for nothing specific", () => {
    expect(attemptQualifies({ createdAt: new Date() }, null)).toBe(true);
  });

  it("counts an attempt on a requested vector and rejects others", () => {
    expect(attemptQualifies(at, { vectors: ["email"], minDifficulty: 1, cues: [] })).toBe(true);
    expect(attemptQualifies(at, { vectors: ["sms", "qr"], minDifficulty: 1, cues: [] })).toBe(false);
  });

  it("treats an empty vector list as every vector", () => {
    expect(attemptQualifies(at, { vectors: [], minDifficulty: 1, cues: [] })).toBe(true);
  });

  it("enforces the difficulty floor", () => {
    expect(attemptQualifies(at, { vectors: [], minDifficulty: 3, cues: [] })).toBe(true);
    expect(attemptQualifies(at, { vectors: [], minDifficulty: 4, cues: [] })).toBe(false);
  });

  it("counts an attempt carrying any one of the requested cues", () => {
    expect(
      attemptQualifies(at, { vectors: [], minDifficulty: 1, cues: ["sender_domain", "urgency_language"] }),
    ).toBe(true);
    expect(attemptQualifies(at, { vectors: [], minDifficulty: 1, cues: ["suspicious_qr"] })).toBe(false);
  });

  it("fails a check it cannot evaluate rather than passing it", () => {
    // A deleted scenario must not quietly discharge an obligation: if we cannot
    // show the practice was on the right material, it does not count.
    const unresolved = { createdAt: new Date() };
    expect(attemptQualifies(unresolved, { vectors: ["email"], minDifficulty: 1, cues: [] })).toBe(false);
    expect(attemptQualifies(unresolved, { vectors: [], minDifficulty: 3, cues: [] })).toBe(false);
    expect(attemptQualifies(unresolved, { vectors: [], minDifficulty: 1, cues: ["sender_domain"] })).toBe(false);
  });

  it("requires every clause, not just one", () => {
    const focus = { vectors: ["email"], minDifficulty: 4, cues: ["sender_domain"] };
    expect(attemptQualifies(at, focus)).toBe(false);
    expect(attemptQualifies({ ...at, difficulty: 5 }, focus)).toBe(true);
  });
});

describe("assignmentProgress with a focus", () => {
  const assignedAt = new Date("2026-08-01T00:00:00Z");
  const now = new Date("2026-08-10T00:00:00Z");
  const on = (vector: string, difficulty: number) => ({
    createdAt: new Date("2026-08-02T00:00:00Z"),
    vector,
    difficulty,
    cues: [],
  });

  it("counts only the practice the campaign asked for", () => {
    // Five rounds of anything used to discharge any requirement, so an admin
    // responding to an incident on finance invoices could not ask for practice
    // on that.
    const progress = assignmentProgress({
      assignedAt,
      requiredScenarios: 2,
      dueDate: null,
      attempts: [on("email", 4), on("sms", 4), on("email", 4)],
      focus: { vectors: ["email"], minDifficulty: 1, cues: [] },
      now,
    });

    expect(progress).toEqual({ completedScenarios: 2, completedLessons: 0, requiredLessons: 0, status: "completed" });
  });

  it("does not credit practice below the requested level", () => {
    const progress = assignmentProgress({
      assignedAt,
      requiredScenarios: 1,
      dueDate: null,
      attempts: [on("email", 2)],
      focus: { vectors: [], minDifficulty: 4, cues: [] },
      now,
    });

    expect(progress).toEqual({ completedScenarios: 0, completedLessons: 0, requiredLessons: 0, status: "assigned" });
  });
});

describe("describeFocus", () => {
  it("says so plainly when there is no constraint", () => {
    expect(describeFocus(null)).toBe("Any practice counts");
    expect(describeFocus({ vectors: [], minDifficulty: 1, cues: [] })).toBe("Any practice counts");
  });

  it("reads as a requirement a person could act on", () => {
    expect(describeFocus({ vectors: ["email", "web"], minDifficulty: 4, cues: [] })).toBe(
      "email, web · level 4+",
    );
    expect(describeFocus({ vectors: [], minDifficulty: 1, cues: ["sender_domain"] })).toBe(
      "1 specific red flag",
    );
  });
});
