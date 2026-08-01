import { afterEach, describe, expect, it } from "bun:test";
import type { SurveyFeatures } from "@/lib/onboarding-survey";
import { MlServiceError, predictAwareness } from "./mlClient";

const ORIGINAL_URL = process.env.ML_SERVICE_URL;
const ORIGINAL_TIMEOUT = process.env.ML_SERVICE_TIMEOUT_MS;
const ORIGINAL_FETCH = globalThis.fetch;
const FEATURES: SurveyFeatures = {
  emails_per_day: 50, suspicious_emails_per_day: 2, password_length: 16,
  reuses_passwords: 0, uses_password_manager: 1, mfa_familiar: 1,
  mfa_enabled: 1, security_training: 1, clicks_links: 30,
  opens_attachments: 20, verifies_links: 80, reports_suspicious: 70,
  has_antivirus: 1, uses_vpn: 1, department: "Engineering", work_mode: "Hybrid",
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.ML_SERVICE_URL;
  else process.env.ML_SERVICE_URL = ORIGINAL_URL;
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.ML_SERVICE_TIMEOUT_MS;
  else process.env.ML_SERVICE_TIMEOUT_MS = ORIGINAL_TIMEOUT;
});

describe("predictAwareness", () => {
  it("validates and returns a normalized model response", async () => {
    process.env.ML_SERVICE_URL = "http://localhost:8001/";
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return Response.json({ awareness_score: 0.73, model_version: "awareness-v1" });
    }) as typeof fetch;
    await expect(predictAwareness(FEATURES, 0.8)).resolves.toEqual({
      awareness_score: 0.73, model_version: "awareness-v1",
    });
    expect(requestedUrl).toBe("http://localhost:8001/predictions/awareness");
  });

  it("rejects a response outside the 0-1 application contract", async () => {
    process.env.ML_SERVICE_URL = "http://localhost:8001";
    globalThis.fetch = (async () =>
      Response.json({ awareness_score: 73, model_version: "awareness-v1" })) as unknown as typeof fetch;
    await expect(predictAwareness(FEATURES, 0.8)).rejects.toBeInstanceOf(MlServiceError);
  });

  it("fails clearly when the service URL is not configured", async () => {
    delete process.env.ML_SERVICE_URL;
    await expect(predictAwareness(FEATURES, 0.8)).rejects.toThrow("not configured");
  });
});
