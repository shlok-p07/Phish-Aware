import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";
// deleteAccount clears the session cookie, and the real cookies() throws outside
// a request scope.
import { installNextHeadersMock, resetFakeCookieState } from "@/test/mock-next-headers";

await installMongoMock();
await installSessionMock();
await installNextHeadersMock();

const { DELETE } = await import("./route");

const ME = new ObjectId();

function seedMe() {
  fakeDbState.users.push({ _id: ME, userId: ME, name: "Me", isGuest: false });
  fakeSessionState.userId = ME;
}

function seedOther() {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, userId: id, name: "Other", isGuest: false });
  fakeDbState.attempts.push({ _id: new ObjectId(), userId: id, correct: true });
  fakeDbState.assignments.push({
    _id: new ObjectId(),
    userId: id,
    campaignId: new ObjectId(),
    orgId: new ObjectId(),
    status: "assigned",
  });
  return id;
}

describe("DELETE /api/auth/account", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    resetFakeCookieState();
  });

  it("deletes the account and everything attached to it", async () => {
    seedMe();
    fakeDbState.attempts.push({ _id: new ObjectId(), userId: ME, correct: true });
    fakeDbState.sessions.push({ _id: new ObjectId(), token: "t", userId: ME });
    fakeDbState.assignments.push({
      _id: new ObjectId(),
      userId: ME,
      campaignId: new ObjectId(),
      orgId: new ObjectId(),
      status: "assigned",
    });

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
    expect(fakeDbState.sessions).toHaveLength(0);
    expect(fakeDbState.assignments).toHaveLength(0);
  });

  it("touches nobody else's data", async () => {
    seedMe();
    const other = seedOther();

    await DELETE();

    expect(fakeDbState.users.map((u) => u._id.toString())).toEqual([other.toString()]);
    expect(fakeDbState.attempts).toHaveLength(1);
    expect(fakeDbState.assignments).toHaveLength(1);
  });

  it("refuses an unauthenticated caller", async () => {
    seedOther();
    fakeSessionState.userId = null;

    const res = await DELETE();

    expect(res.status).toBe(401);
    // Nothing may be deleted on an unauthenticated request.
    expect(fakeDbState.users).toHaveLength(1);
  });
});
