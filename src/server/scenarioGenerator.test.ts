import { describe, expect, it, beforeEach } from "bun:test";
import type { GenerateScenarioParams } from "./scenarioGenerator";
import {
  installLlmProviderMocks,
  llmMockState,
  resetLlmMockState,
  groqReturningInOrder,
  groqThrowing,
} from "./llm/test-provider-mock";

installLlmProviderMocks();

const { generatePhishingScenario } = await import("./scenarioGenerator");

const BASE_PARAMS: GenerateScenarioParams = {
  vector: "email",
  isPhish: true,
  department: "Finance",
  workType: "Remote",
  difficulty: 3,
  persuasionTactic: "urgency",
  attackType: "invoice_fraud",
};

function draftJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    sender: "IT Support <it@corp-example.com>",
    subject: "Reset your password",
    body: "Click here now to avoid losing access.",
    links: [{ text: "http://evil.example/reset", isSuspicious: true }],
    attachments: [],
    redFlags: ["Creates urgency to click quickly"],
    ...overrides,
  });
}

function refinedJson(overrides: Record<string, unknown> = {}) {
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

// Captures each of Groq's two sequential calls (draft, then refine) via a
// custom fake so tests can assert on prompt/temperature per stage.
function groqCapturing(...contents: (string | null)[]) {
  const calls: { temperature: number; messages: { role: string; content: string }[]; response_format?: unknown }[] =
    [];
  let call = 0;
  llmMockState.groqClient = {
    chat: {
      completions: {
        create: async (args: unknown) => {
          calls.push(args as (typeof calls)[number]);
          const content = call < contents.length ? contents[call]! : null;
          call++;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  return calls;
}

describe("generatePhishingScenario", () => {
  beforeEach(() => {
    resetLlmMockState();
  });

  it("returns a well-formed scenario when both the draft and refine stages succeed", async () => {
    llmMockState.groqClient = groqReturningInOrder(draftJson(), refinedJson());
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

  it("requests JSON mode for both stages", async () => {
    const calls = groqCapturing(draftJson(), refinedJson());
    await generatePhishingScenario(BASE_PARAMS);
    expect(calls[0]!.response_format).toEqual({ type: "json_object" });
    expect(calls[1]!.response_format).toEqual({ type: "json_object" });
  });

  it("calls the draft stage with a high temperature and the refine stage with a lower one", async () => {
    const calls = groqCapturing(draftJson(), refinedJson());
    await generatePhishingScenario(BASE_PARAMS);
    expect(calls[0]!.temperature).toBeGreaterThan(calls[1]!.temperature);
  });

  it("passes the draft's content into the refine stage's prompt", async () => {
    const calls = groqCapturing(draftJson({ subject: "A very specific subject" }), refinedJson());
    await generatePhishingScenario(BASE_PARAMS);
    const userMessage = calls[1]!.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("A very specific subject");
  });

  it("forces isPhish/vector/isOnboarding even if the refine stage's JSON tried to set them differently", async () => {
    llmMockState.groqClient = groqReturningInOrder(
      draftJson(),
      refinedJson({ isPhish: false, vector: "sms", isOnboarding: true }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result!.isPhish).toBe(true);
    expect(result!.vector).toBe("email");
    expect(result!.isOnboarding).toBe(false);
  });

  it("returns null when the draft stage returns invalid JSON", async () => {
    llmMockState.groqClient = groqReturningInOrder("this is not valid json at all {{{", refinedJson());
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when the draft stage has no content, without ever calling refine", async () => {
    const calls = groqCapturing(null, refinedJson());
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
    expect(calls.length).toBe(1);
  });

  it("returns null when the refine stage responds with invalid JSON", async () => {
    llmMockState.groqClient = groqReturningInOrder(draftJson(), "this is not valid json at all {{{");
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when required fields are missing from the refine stage's otherwise-valid JSON", async () => {
    llmMockState.groqClient = groqReturningInOrder(draftJson(), JSON.stringify({ sender: "x", subject: "y" }));
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when a refined cue's type isn't in the real cue vocabulary", async () => {
    llmMockState.groqClient = groqReturningInOrder(
      draftJson(),
      refinedJson({ cues: [{ type: "made_up_cue_type", severity: 3, explanation: "x" }] }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when refined cues is an empty array (schema requires at least one)", async () => {
    llmMockState.groqClient = groqReturningInOrder(draftJson(), refinedJson({ cues: [] }));
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null when a refined cue's severity is out of the valid 1-5 range", async () => {
    llmMockState.groqClient = groqReturningInOrder(
      draftJson(),
      refinedJson({ cues: [{ type: "urgency_language", severity: 9, explanation: "x" }] }),
    );
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("defaults links/attachments to [] when the refine stage omits them entirely", async () => {
    const refined = JSON.parse(refinedJson());
    delete refined.links;
    delete refined.attachments;
    llmMockState.groqClient = groqReturningInOrder(draftJson(), JSON.stringify(refined));
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.links).toEqual([]);
    expect(result!.attachments).toEqual([]);
  });

  it("returns null when the refine stage's completion has no content at all", async () => {
    llmMockState.groqClient = groqReturningInOrder(draftJson(), null);
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when both providers fail", async () => {
    llmMockState.groqClient = groqThrowing("network down");
    const result = await generatePhishingScenario(BASE_PARAMS);
    expect(result).toBeNull();
  });

  describe("sms vector", () => {
    const SMS_PARAMS: GenerateScenarioParams = { ...BASE_PARAMS, vector: "sms" };

    it("returns vector 'sms' and strips any attachment the model tried to include", async () => {
      llmMockState.groqClient = groqReturningInOrder(
        draftJson({ subject: "" }),
        refinedJson({
          subject: "",
          sender: "+1 (302) 555-0148",
          attachments: [{ name: "invoice.pdf", isSuspicious: true }],
          cues: [
            { type: "urgency_language", severity: 3, explanation: "Creates time pressure." },
            { type: "unexpected_attachment", severity: 2, explanation: "Shouldn't be possible over SMS." },
          ],
        }),
      );
      const result = await generatePhishingScenario(SMS_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.vector).toBe("sms");
      expect(result!.attachments).toEqual([]);
      expect(result!.cues.map((c) => c.type)).toEqual(["urgency_language"]);
    });
  });

  describe("voice vector", () => {
    const VOICE_PARAMS: GenerateScenarioParams = { ...BASE_PARAMS, vector: "voice" };

    it("returns vector 'voice', strips links/attachments, and keeps only the allowed voice cue subset", async () => {
      llmMockState.groqClient = groqReturningInOrder(
        draftJson({ subject: "" }),
        refinedJson({
          subject: "",
          sender: "Bank Security",
          body: "Caller: We need to verify your account now.\nYou: Why?\nCaller: Read your password to avoid a lock.",
          links: [{ text: "http://evil.example/verify", isSuspicious: true }],
          attachments: [{ name: "statement.pdf", isSuspicious: true }],
          cues: [
            { type: "urgency_language", severity: 3, explanation: "Creates time pressure." },
            { type: "credential_request", severity: 3, explanation: "Requests a password." },
            { type: "mismatched_link", severity: 2, explanation: "Should be filtered for voice." },
          ],
        }),
      );
      const result = await generatePhishingScenario(VOICE_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.vector).toBe("voice");
      expect(result!.links).toEqual([]);
      expect(result!.attachments).toEqual([]);
      expect(result!.cues.map((c) => c.type)).toEqual(["urgency_language", "credential_request"]);
    });
  });

  describe("legitimate (isPhish: false) scenarios", () => {
    const LEGIT_PARAMS: GenerateScenarioParams = { ...BASE_PARAMS, isPhish: false };

    it("returns isPhish: false and forces cues to [] even if the model included some", async () => {
      llmMockState.groqClient = groqReturningInOrder(
        draftJson({ redFlags: undefined }),
        refinedJson({
          cues: [{ type: "urgency_language", severity: 2, explanation: "Model invented a red flag anyway." }],
        }),
      );
      const result = await generatePhishingScenario(LEGIT_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.isPhish).toBe(false);
      expect(result!.cues).toEqual([]);
    });

    it("does not require any cues to succeed (unlike a phishing scenario)", async () => {
      llmMockState.groqClient = groqReturningInOrder(draftJson({ redFlags: undefined }), refinedJson({ cues: [] }));
      const result = await generatePhishingScenario(LEGIT_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.isPhish).toBe(false);
    });
  });
});
