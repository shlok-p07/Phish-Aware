import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import {
  fakeDbState,
  installMongoMock,
  resetFakeDbState,
} from "@/test/mock-mongo";
import {
  installSessionMock,
  fakeSessionState,
  resetFakeSessionState,
} from "@/test/mock-session";
import {
  ONBOARDING_SURVEY_KEY,
  ONBOARDING_SURVEY_VERSION,
  type SurveyFeatures,
} from "@/lib/onboarding-survey";

await installMongoMock();
await installSessionMock();

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

function seedUser(
  overrides: { orgId?: ObjectId | null; department?: string | null } = {},
) {
  const id = new ObjectId();
  const user = {
    _id: id,
    // No org by default, so nobody has assigned this user a department and
    // their own survey answer stands. The org cases below pass an orgId.
    orgId: null as ObjectId | null,
    department: "Finance" as string | null,
    workType: "Office",
    surveyFeatures: null,
    phishingAwarenessScore: 0,
    phishingAwarenessModelVersion: null,
    phishingAwarenessComputedAt: null,
    onboardingCompleted: false,
    level: "beginner",
    xp: 0,
  };
  Object.assign(user, overrides);
  fakeDbState.users.push(user);
  fakeSessionState.userId = id;
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
  resetFakeSessionState();
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
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
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

  it("keeps the survey submission, not just the vector it reduced to", async () => {
    // The answers behind a starting level used to be unrecoverable: only the
    // reduced feature vector was stored, on the user document, overwritten in
    // place.
    seedUser();
    const phishingId = seedScenario(true);
    globalThis.fetch = (async () =>
      Response.json({
        awareness_score: 0.42,
        model_version: "awareness-integration-v1",
      })) as unknown as typeof fetch;

    await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
      features: FEATURES,
    });

    expect(fakeDbState.surveyResponses).toHaveLength(1);
    const [recorded] = fakeDbState.surveyResponses;
    expect(recorded.surveyKey).toBe(ONBOARDING_SURVEY_KEY);
    expect(recorded.surveyVersion).toBe(ONBOARDING_SURVEY_VERSION);
    expect(recorded.purpose).toBe("onboarding_baseline");
    expect(recorded.derivedSignals).toEqual(FEATURES);
    // Stored 0-100 to match the validator's range, from an 0-1 score.
    expect(recorded.baselineRiskContribution).toBe(42);
    expect(recorded.answers).toContainEqual({ questionKey: "mfa_enabled", value: 1 });
  });

  it("records nothing when the diagnostic is submitted without the survey", async () => {
    seedUser();
    const phishingId = seedScenario(true);
    await postOnboarding({ answers: [{ scenarioId: phishingId, verdict: true }] });
    expect(fakeDbState.surveyResponses).toHaveLength(0);
  });

  it("keeps a retake instead of overwriting the first submission", async () => {
    // Append-only is the point: a later score must not erase the answers the
    // learner was originally placed on.
    seedUser();
    const phishingId = seedScenario(true);
    globalThis.fetch = (async () =>
      Response.json({ awareness_score: 0.5, model_version: "v" })) as unknown as typeof fetch;

    await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
      features: FEATURES,
    });
    await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: false }],
      features: FEATURES,
    });

    expect(fakeDbState.surveyResponses).toHaveLength(2);
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
      return Response.json({
        awareness_score: 0.99,
        model_version: "unexpected",
      });
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
      Response.json({
        awareness_score: 0.2,
        model_version: "awareness-test-v1",
      })) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: new ObjectId().toString(), verdict: true }],
      features: FEATURES,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      correctCount: 0,
      totalCount: 1,
    });
  });

  it("rejects an invalid feature payload before calling ML or updating the user", async () => {
    const user = seedUser();
    const phishingId = seedScenario(true);
    let mlCalls = 0;
    globalThis.fetch = (async () => {
      mlCalls += 1;
      return Response.json({
        awareness_score: 0.8,
        model_version: "unexpected",
      });
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
      return Response.json({
        awareness_score: 0.8,
        model_version: "unexpected",
      });
    }) as unknown as typeof fetch;

    const response = await postOnboarding({
      answers: [{ scenarioId: phishingId, verdict: true }],
      features: FEATURES,
    });

    expect(response.status).toBe(401);
    expect(mlCalls).toBe(0);
    expect(fakeDbState.users).toHaveLength(0);
  });

  describe("department assignment", () => {
    it("keeps the department the org assigned, ignoring a self-reported override", async () => {
      seedUser({ orgId: new ObjectId(), department: "Finance" });
      const phish = seedScenario(true);

      const response = await postOnboarding({
        answers: [{ scenarioId: phish, verdict: true }],
        features: { ...FEATURES, department: "Executive" },
      });

      expect(response.status).toBe(200);
      expect(fakeDbState.users[0].department).toBe("Finance");
      // The rest of the survey is still the employee's to answer.
      expect(fakeDbState.users[0].workType).toBe("Hybrid");
    });

    it("accepts the survey answer for an org member the org never assigned", async () => {
      seedUser({ orgId: new ObjectId(), department: null });
      const phish = seedScenario(true);

      const response = await postOnboarding({
        answers: [{ scenarioId: phish, verdict: true }],
        features: FEATURES,
      });

      expect(response.status).toBe(200);
      expect(fakeDbState.users[0].department).toBe("Engineering");
    });

    it("lets a self-signup user answer for themselves", async () => {
      seedUser();
      const phish = seedScenario(true);

      const response = await postOnboarding({
        answers: [{ scenarioId: phish, verdict: true }],
        features: FEATURES,
      });

      expect(response.status).toBe(200);
      expect(fakeDbState.users[0].department).toBe("Engineering");
    });
  });
});
