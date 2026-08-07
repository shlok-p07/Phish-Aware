import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import type { SurveyFeatures } from "@/lib/onboarding-survey";
import { MlServiceError, predictAwareness } from "./mlClient";

const ORIGINAL_URL = process.env.ML_SERVICE_URL;
const ORIGINAL_TIMEOUT = process.env.ML_SERVICE_TIMEOUT_MS;

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

let responseMode: "success" | "unavailable" | "invalid" = "success";
let receivedPath = "";
let receivedBody: Record<string, unknown> | null = null;
let server: Server;

beforeAll(async () => {
  server = createServer((request, response) => {
    receivedPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { rawBody += chunk; });
    request.on("end", () => {
      receivedBody = JSON.parse(rawBody) as Record<string, unknown>;
      const payload = responseMode === "unavailable"
        ? { detail: "model unavailable" }
        : responseMode === "invalid"
          ? { awareness_score: 73, model_version: "bad-contract" }
          : { awareness_score: 0.73, model_version: "socket-integration-v1" };
      response.writeHead(responseMode === "unavailable" ? 503 : 200, {
        ...corsHeaders,
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind TCP");
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${address.port}`;
  process.env.ML_SERVICE_TIMEOUT_MS = "2000";
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (ORIGINAL_URL === undefined) delete process.env.ML_SERVICE_URL;
  else process.env.ML_SERVICE_URL = ORIGINAL_URL;
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.ML_SERVICE_TIMEOUT_MS;
  else process.env.ML_SERVICE_TIMEOUT_MS = ORIGINAL_TIMEOUT;
});

describe("mlClient HTTP integration", () => {
  it("sends the complete awareness request over a real HTTP socket", async () => {
    responseMode = "success";
    receivedPath = "";
    receivedBody = null;

    const result = await predictAwareness(FEATURES, 0.8);

    expect(receivedPath).toBe("/predictions/awareness");
    // The value is assigned asynchronously by the local server callback, which
    // TypeScript's control-flow analysis cannot observe across the HTTP await.
    expect(receivedBody as unknown).toEqual({ ...FEATURES, diagnostic_accuracy: 0.8 });
    expect(result).toEqual({
      awareness_score: 0.73,
      model_version: "socket-integration-v1",
    });
  });

  it("turns a real HTTP 503 response into an MlServiceError", async () => {
    responseMode = "unavailable";

    try {
      await predictAwareness(FEATURES, 0.8);
      throw new Error("Expected predictAwareness to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(MlServiceError);
      expect((error as MlServiceError).status).toBe(503);
    }
  });

  it("rejects an invalid response received over HTTP", async () => {
    responseMode = "invalid";
    await expect(predictAwareness(FEATURES, 0.8)).rejects.toThrow(
      "invalid response",
    );
  });
});
