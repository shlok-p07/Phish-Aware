import { describe, expect, it, mock, beforeEach } from "bun:test";
import type { GenerateScenarioParams } from "./scenarioGenerator";

// Mutable state the mocked getGroqClient() reads, so each test can control
// exactly what "Groq" returns without ever hitting the real API.
type FakeClient = {
  chat: { completions: { create: (...args: unknown[]) => Promise<unknown> } };
} | null;
let mockClient: FakeClient = null;

mock.module("./llm/groqClient", () => ({
  getGroqClient: () => mockClient,
  GROQ_MODEL: "llama-3.3-70b-versatile",
}));

const { generatePhishingScenario } = await import("./scenarioGenerator");

const BASE_PARAMS: GenerateScenarioParams = {
  department: "Finance",
  workType: "Remote",
  difficulty: 3,
  persuasionTactic: "urgency",
  attackType: "invoice_fraud",
};

function clientReturning(content: string | null): NonNullable<FakeClient> {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] }),
      },
    },
  };
}

function validResponseJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    sender: "IT Support <it@corp-example.com>",
    subject: "Reset your password",
    body: "Click here now to avoid losing access.",
    links: [{ text: "http://evil.example/reset", isSuspicious: true }],
    attachments: [],
    cues: [{ type: "urgency_language", severity: 3, explanation: "Creates time pressure." }],
    ...overrides,
  });
}

describe("generatePhishingScenario", () => {
  beforeEach(() => {
    mockClient = null;
  });

  it("returns null without ever calling the API when no Groq client is configured", async () => {
    mockClient = null;
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns a well-formed scenario on a valid LLM response", async () => {
    mockClient = clientReturning(validResponseJson());
    const result = await generatePhishingScenario(BASE_PARAMS);

    expect(result).not.toBeNull();
    expect(result!.vector).toBe("email");
    expect(result!.isPhish).toBe(true);
    expect(result!.isOnboarding).toBe(false);
    // Difficulty always comes from our own params, never from the model.
    expect(result!.difficulty).toBe(BASE_PARAMS.difficulty);
    expect(result!.cues).toHaveLength(1);
    expect(result!.cues[0]!.type).toBe("urgency_language");
  });

  it("forces isPhish/vector/isOnboarding even if the model's JSON tried to set them differently", async () => {
    // The schema doesn't even accept these keys from the model, but confirm
    // the mapping is hardcoded, not accidentally passed through from `parsed`.
    mockClient = clientReturning(
      validResponseJson({ isPhish: false, vector: "sms", isOnboarding: true }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result!.isPhish).toBe(true);
    expect(result!.vector).toBe("email");
    expect(result!.isOnboarding).toBe(false);
  });

  it("returns null (not a throw) when the model responds with invalid JSON", async () => {
    mockClient = clientReturning("this is not valid json at all {{{");
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when required fields are missing from an otherwise-valid JSON object", async () => {
    mockClient = clientReturning(JSON.stringify({ sender: "x", subject: "y" }));
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when a cue's type isn't in the real cue vocabulary", async () => {
    mockClient = clientReturning(
      validResponseJson({ cues: [{ type: "made_up_cue_type", severity: 3, explanation: "x" }] }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when cues is an empty array (schema requires at least one)", async () => {
    mockClient = clientReturning(validResponseJson({ cues: [] }));
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when a cue's severity is out of the valid 1-5 range", async () => {
    mockClient = clientReturning(
      validResponseJson({ cues: [{ type: "urgency_language", severity: 9, explanation: "x" }] }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when the completion has no content at all", async () => {
    mockClient = clientReturning(null);
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when the Groq API call itself rejects", async () => {
    mockClient = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("network down");
          },
        },
      },
    };
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });
});
