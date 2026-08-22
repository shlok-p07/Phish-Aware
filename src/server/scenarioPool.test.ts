import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import {
  fakeGeneratorState as generator,
  installScenarioGeneratorMock,
  resetFakeGeneratorState,
} from "@/test/mock-scenario-generator";

await installMongoMock();
await installScenarioGeneratorMock();

const { POOL_TARGET_SIZE, topUpPoolInBackground } = await import("./scenarioPool");

const PARAMS = {
  vector: "email" as const,
  isPhish: true,
  department: "Finance",
  workType: "Hybrid",
  difficulty: 3,
  persuasionTactic: "urgency" as const,
  attackType: "credential_harvesting" as const,
};

const GENERATED = {
  vector: "email",
  isPhish: true,
  sender: "IT <it@example.test>",
  subject: "Verify",
  body: "Verify now",
  links: [],
  attachments: [],
  cues: [],
  difficulty: 3,
  isOnboarding: false,
};

/** The top-up is fire-and-forget, so a test has to let the microtasks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

let errorSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  resetFakeDbState();
  resetFakeGeneratorState();
  generator.result = GENERATED;
});

afterEach(() => {
  errorSpy?.mockRestore();
  errorSpy = null;
});

describe("topUpPoolInBackground", () => {
  it("does nothing when the pool is already at target", async () => {
    topUpPoolInBackground(PARAMS, null, POOL_TARGET_SIZE);
    await settle();

    expect(generator.calls).toBe(0);
  });

  it("generates and stores one scenario when the pool is low", async () => {
    topUpPoolInBackground({ ...PARAMS, vector: "sms" }, null, 0);
    await settle();

    expect(generator.calls).toBe(1);
    expect(fakeDbState.scenarios).toHaveLength(1);
    expect(fakeDbState.scenarios[0].source).toBe("ai_generated");
  });

  it("stamps the generated scenario with the org it was generated for", async () => {
    const orgId = new ObjectId();

    topUpPoolInBackground({ ...PARAMS, vector: "voice" }, orgId, 0);
    await settle();

    expect((fakeDbState.scenarios[0].orgId as ObjectId).equals(orgId)).toBe(true);
  });

  it("runs at most one generation per vector at a time", async () => {
    // A burst of concurrent requests all notice the same vector is low. Without
    // the in-flight guard each would start its own LLM call and burn the shared
    // free-tier quota several times over for one scenario.
    generator.gate = () => {};
    topUpPoolInBackground({ ...PARAMS, vector: "qr" }, null, 0);
    await settle();
    topUpPoolInBackground({ ...PARAMS, vector: "qr" }, null, 0);
    topUpPoolInBackground({ ...PARAMS, vector: "qr" }, null, 0);
    await settle();

    expect(generator.calls).toBe(1);

    const release = generator.gate;
    generator.gate = null;
    release?.();
    await settle();
  });

  it("does not let one vector block another", async () => {
    topUpPoolInBackground({ ...PARAMS, vector: "social" }, null, 0);
    await settle();
    topUpPoolInBackground({ ...PARAMS, vector: "web" }, null, 0);
    await settle();

    expect(generator.calls).toBe(2);
  });

  it("stops retrying a vector for a while after generation comes back empty", async () => {
    generator.result = null;

    topUpPoolInBackground({ ...PARAMS, vector: "email" }, null, 0);
    await settle();
    topUpPoolInBackground({ ...PARAMS, vector: "email" }, null, 0);
    await settle();

    // Retrying every request against a dry quota is wasted calls and log noise
    // while the pool is still serving fine from what it already has.
    expect(generator.calls).toBe(1);
    expect(fakeDbState.scenarios).toHaveLength(0);
  });

  it("stops retrying after generation throws, and does not surface the error", async () => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    generator.throws = true;

    topUpPoolInBackground({ ...PARAMS, vector: "sms" }, null, 0);
    await settle();
    topUpPoolInBackground({ ...PARAMS, vector: "sms" }, null, 0);
    await settle();

    expect(generator.calls).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("resumes for that vector once generation succeeds again", async () => {
    // Cooldown is keyed per vector, so a vector that never failed is unaffected
    // by one that did.
    generator.result = null;
    topUpPoolInBackground({ ...PARAMS, vector: "voice" }, null, 0);
    await settle();

    generator.result = GENERATED;
    topUpPoolInBackground({ ...PARAMS, vector: "web" }, null, 0);
    await settle();

    expect(fakeDbState.scenarios).toHaveLength(1);
  });

  it("never throws into its caller, whatever happens", async () => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    generator.throws = true;

    // The practice route calls this on the serving path; an unhandled rejection
    // here would fail a request that had already found a scenario to serve.
    expect(() => topUpPoolInBackground({ ...PARAMS, vector: "qr" }, null, 0)).not.toThrow();
    await settle();
  });
});
