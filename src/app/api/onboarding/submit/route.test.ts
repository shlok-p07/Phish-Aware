import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import type { SurveyFeatures } from "@/lib/onboarding-survey";

await installMongoMock();

let authenticatedUserId: ObjectId | null = null;
const realSession = await import("@/server/session");
mock.module("@/server/session", () => ({
  ...realSession,
  getUserIdFromRequest: async () => authenticatedUserId,
}));

const { POST } = await import("./route");

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ML_SERVICE_URL = process.env.ML_SERVICE_URL;

const FEATURES: SurveyFeatures = {
  emails_per_day: 50,
  suspicious_emails_per_day: 2,
  password_length: 16,
  reuses_passwords: 0,
  uses_password_manager: 1,
  mfa_familiar: 1,
  mfa_enabled: 1,
  security_training: 1,
  clicks_links: 30,
  opens_attachments: 20,
  verifies_links: 80,
  reports_suspicious: 70,
  has_antivirus: 1,
  uses_vpn: 1,
  department: "Engineering",
  work_mode: "Hybrid",
};

function seedUser() {
  const id = new ObjectId();
  const user = {
    _id: id,
    department: "Finance",
    workType: "Office",
    surveyFeatures: null,
    phishingAwarenessScore: 0,
    phishingAwarenessModelVersion: null,
    phishingAwarenessComputedAt: null,
    onboardingCompleted: false,
    level: "beginner",
    xp: 0,
  };
  fakeDbState.users.push(user);
  authenticatedUserId = id;
  return user;
}

function seedScenario(isPhish: boolean) {
  const id = new ObjectId();
  fakeDbState.scenarios.push({ _id: id, isPhish });
  return id.toString();
}

function postOnboarding(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/onboarding/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetFakeDbState();
  authenticatedUserId = null;
  process.env.ML_SERVICE_URL = "http://ml.test";
  globalThis.fetch = ORIGINAL_FETCH;
});

afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_ML_SERVICE_URL === undefined) delete process.env.ML_SERVICE_URL;
  else process.env.ML_SERVICE_URL = ORIGINAL_ML_SERVICE_URL;
});

describe("POST /api/onboarding/submit", () => {
  it("uses the ML prediction for the initial level and persisted model provenance", async () => {
    const user = seedUser();
    const phishingId = seedScenario(true);
    const legitimateId = seedScenario(false);
    let mlRequest: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      mlRequest = JSON.parse(String(init?.body));
      return Response.json({
        awareness_score: 0.73,
        model_version: "awareness-integration-v1",
      });
    }) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [
        { scenarioId: phishingId, verdict: true },
        { scenarioId: legitimateId, verdict: false },
      ],
      features: FEATURES,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      level: "advanced",
      correctCount: 2,
      totalCount: 2,
    });
    expect(mlRequest).toEqual({ ...FEATURES, diagnostic_accuracy: 1 });
    expect(user).toMatchObject({
      xp: 400,
      level: "advanced",
      onboardingCompleted: true,
      phishingAwarenessScore: 0.73,
      phishingAwarenessModelVersion: "awareness-integration-v1",
      surveyFeatures: FEATURES,
      department: "Engineering",
      workType: "Hybrid",
    });
    expect(user.phishingAwarenessComputedAt).toBeInstanceOf(Date);
  });

  it("falls back to diagnostic accuracy when the ML service is unavailable", async () => {
    const user = seedUser();
    const phishingId = seedScenario(true);
    const legitimateId = seedScenario(false);
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const warning = spyOn(console, "warn").mockImplementation(() => {});

    try {
      const response = await postOnboarding({
        answers: [
          { scenarioId: phishingId, verdict: true },
          { scenarioId: legitimateId, verdict: true },
        ],
        features: FEATURES,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        level: "intermediate",
        correctCount: 1,
        totalCount: 2,
      });
      expect(user).toMatchObject({
        xp: 150,
        level: "intermediate",
        onboardingCompleted: true,
        phishingAwarenessScore: 0.5,
        phishingAwarenessModelVersion: "diagnostic-accuracy-v0",
      });
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      warning.mockRestore();
    }
  });

  it("supports legacy diagnostic-only submissions without overwriting profile context", async () => {
    const user = seedUser();
    const phishingId = seedScenario(true);
    let mlCalls = 0;
    globalThis.fetch = (async () => {
      mlCalls += 1;
      return Response.json({ awareness_score: 0.99, model_version: "unexpected" });
    }) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
    });

    expect(response.status).toBe(200);
    expect(mlCalls).toBe(0);
    expect(user).toMatchObject({
      phishingAwarenessScore: 1,
      phishingAwarenessModelVersion: "diagnostic-accuracy-v0",
      department: "Finance",
      workType: "Office",
      surveyFeatures: null,
    });
  });

  it("counts an unknown scenario as incorrect instead of trusting the client verdict", async () => {
    seedUser();
    globalThis.fetch = (async () =>
      Response.json({ awareness_score: 0.2, model_version: "awareness-test-v1" })) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: new ObjectId().toString(), verdict: true }],
      features: FEATURES,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ correctCount: 0, totalCount: 1 });
  });

  it("rejects an invalid feature payload before calling ML or updating the user", async () => {
    const user = seedUser();
    const phishingId = seedScenario(true);
    let mlCalls = 0;
    globalThis.fetch = (async () => {
      mlCalls += 1;
      return Response.json({ awareness_score: 0.8, model_version: "unexpected" });
    }) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
      features: { ...FEATURES, clicks_links: 101 },
    });

    expect(response.status).toBe(400);
    expect(mlCalls).toBe(0);
    expect(user.onboardingCompleted).toBe(false);
  });

  it("rejects unauthenticated submissions before reading or writing data", async () => {
    const phishingId = seedScenario(true);
    let mlCalls = 0;
    globalThis.fetch = (async () => {
      mlCalls += 1;
      return Response.json({ awareness_score: 0.8, model_version: "unexpected" });
    }) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
      features: FEATURES,
    });

    expect(response.status).toBe(401);
    expect(mlCalls).toBe(0);
    expect(fakeDbState.users).toHaveLength(0);
  });
});
