import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const {
  notifyOnce,
  assignmentNotification,
  dueSoonNotification,
  overdueNotification,
} = await import("./notifications");

const USER = new ObjectId();
const ORG = new ObjectId();
const SUBJECT = new ObjectId();

const input = (overrides: Record<string, unknown> = {}) => ({
  userId: USER,
  orgId: ORG,
  type: "reminder" as const,
  title: "Training due soon",
  body: "Invoice fraud. Due 2026-09-01.",
  subjectId: SUBJECT,
  ...overrides,
});

describe("notifyOnce", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("writes an unread in-app notification", async () => {
    expect(await notifyOnce(input())).toBe(true);

    const [row] = fakeDbState.notifications;
    expect(row.read).toBe(false);
    expect(row.channel).toBe("in_app");
    expect(row.title).toBe("Training due soon");
    expect((row.userId as ObjectId).equals(USER)).toBe(true);
  });

  it("writes once per subject however many times it is called", async () => {
    // The sweep rides an ordinary request, so without this a reminder would
    // stack up a fresh copy every time somebody loaded a page.
    await notifyOnce(input());
    await notifyOnce(input());
    await notifyOnce(input());

    expect(fakeDbState.notifications).toHaveLength(1);
  });

  it("treats a different type about the same subject as its own notification", async () => {
    await notifyOnce(input({ type: "assignment" }));
    await notifyOnce(input({ type: "reminder" }));

    // Being told something was assigned and later that it is overdue are two
    // different things to say.
    expect(fakeDbState.notifications).toHaveLength(2);
  });

  it("notifies each person separately about the same subject", async () => {
    await notifyOnce(input());
    await notifyOnce(input({ userId: new ObjectId() }));

    expect(fakeDbState.notifications).toHaveLength(2);
  });

  it("reports failure rather than throwing into the caller", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const original = fakeDbState.notifications;
    // @ts-expect-error deliberately breaking the collection
    fakeDbState.notifications = null;

    expect(await notifyOnce(input())).toBe(false);
    expect(warn).toHaveBeenCalled();

    fakeDbState.notifications = original;
    warn.mockRestore();
  });
});

describe("wording", () => {
  it("names the deadline when there is one", () => {
    expect(assignmentNotification("Invoice fraud", new Date("2026-09-01T00:00:00Z")).body).toContain(
      "2026-09-01",
    );
  });

  it("says so when there is no deadline, rather than showing an empty date", () => {
    expect(assignmentNotification("Invoice fraud", null).body).toMatch(/no deadline/i);
  });

  it("distinguishes due-soon from overdue", () => {
    const due = new Date("2026-09-01T00:00:00Z");
    expect(dueSoonNotification("Invoice fraud", due).title).toBe("Training due soon");
    expect(overdueNotification("Invoice fraud", due).title).toBe("Training overdue");
    expect(overdueNotification("Invoice fraud", due).body).toContain("deadline was");
  });
});
