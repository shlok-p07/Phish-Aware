import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const {
  CONSENT_POLICIES,
  CONSENT_POLICY_VERSION,
  consentState,
  recordConsent,
  mayProfileEmotionally,
} = await import("./consent");

const ME = new ObjectId();
const ORG = new ObjectId();

const stateFor = async (policy: string) =>
  (await consentState(ME)).find((s) => s.policy === policy)!;

describe("consentState", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("reports every policy as undecided for somebody who has never been asked", async () => {
    const state = await consentState(ME);

    expect(state).toHaveLength(CONSENT_POLICIES.length);
    expect(state.every((s) => s.needsDecision)).toBe(true);
    expect(state.every((s) => !s.granted)).toBe(true);
  });

  it("treats a decision on an older policy version as no decision", async () => {
    // Agreeing to one wording is not agreeing to a later one. Without this a
    // version bump would be decorative.
    const id = new ObjectId();
    fakeDbState.consents.push({
      _id: id,
      consentId: id,
      userId: ME,
      orgId: ORG,
      policyType: "emotional_profiling",
      policyVersion: "1900-01-1",
      granted: true,
      grantedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    });

    expect((await stateFor("emotional_profiling")).needsDecision).toBe(true);
    expect(await mayProfileEmotionally(ME)).toBe(false);
  });

  it("reads a revocation as a decision, not as an absence of one", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: true });
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: false });

    const state = await stateFor("emotional_profiling");
    expect(state.granted).toBe(false);
    // They have answered; they should not be asked again.
    expect(state.needsDecision).toBe(false);
  });
});

describe("recordConsent", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("records a grant with a timestamp", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "data_processing", granted: true });

    const [row] = fakeDbState.consents;
    expect(row.granted).toBe(true);
    expect(row.grantedAt).toBeInstanceOf(Date);
    expect(row.revokedAt).toBeNull();
    expect(row.policyVersion).toBe(CONSENT_POLICY_VERSION);
  });

  it("keeps the original grant date when revoking, rather than erasing it", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: true });
    const grantedAt = fakeDbState.consents[0].grantedAt;

    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: false });

    // "They agreed and later withdrew" is what an auditor needs to see; a delete
    // would render it as "they never agreed".
    const row = fakeDbState.consents[0];
    expect(row.grantedAt).toEqual(grantedAt);
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(row.granted).toBe(false);
  });

  it("updates in place rather than stacking rows for the same policy and version", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: true });
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: false });
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: true });

    expect(fakeDbState.consents).toHaveLength(1);
    expect(fakeDbState.consents[0].granted).toBe(true);
    expect(fakeDbState.consents[0].revokedAt).toBeNull();
  });

  it("keeps policies separate", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "data_processing", granted: true });
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: false });

    expect(await mayProfileEmotionally(ME)).toBe(false);
    expect((await stateFor("data_processing")).granted).toBe(true);
  });

  it("records a decision for somebody with no organisation", async () => {
    // A self-signup user consents to the same processing; the original schema
    // required an orgId and could not represent them at all.
    await recordConsent({ userId: ME, orgId: null, policy: "data_processing", granted: true });

    expect(fakeDbState.consents[0].orgId).toBeNull();
    expect((await stateFor("data_processing")).granted).toBe(true);
  });

  it("keeps one person's decision out of another's", async () => {
    const other = new ObjectId();
    await recordConsent({ userId: other, orgId: ORG, policy: "emotional_profiling", granted: true });

    expect(await mayProfileEmotionally(ME)).toBe(false);
    expect(await mayProfileEmotionally(other)).toBe(true);
  });
});

describe("mayProfileEmotionally", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("is false by default, because an absent decision is not permission", async () => {
    expect(await mayProfileEmotionally(ME)).toBe(false);
  });

  it("is true only once explicitly granted", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "emotional_profiling", granted: true });
    expect(await mayProfileEmotionally(ME)).toBe(true);
  });

  it("is not implied by consenting to the required policy", async () => {
    await recordConsent({ userId: ME, orgId: ORG, policy: "data_processing", granted: true });
    expect(await mayProfileEmotionally(ME)).toBe(false);
  });
});
