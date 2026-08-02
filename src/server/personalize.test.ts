import { describe, it, expect } from "bun:test";
import {
  NAME_TOKEN,
  firstNameOf,
  hasPlaceholder,
  normalizePlaceholders,
  personalizeScenario,
  personalizeText,
} from "./personalize";

describe("firstNameOf", () => {
  it("takes the first name from a full name", () => {
    expect(firstNameOf("Taylor Morgan")).toBe("Taylor");
  });

  it("returns a single name unchanged", () => {
    expect(firstNameOf("Taylor")).toBe("Taylor");
  });

  it("derives a name from an address-shaped value", () => {
    expect(firstNameOf("taylor.morgan@corp.example")).toBe("taylor");
  });

  it("returns null when there is nothing usable", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});

describe("personalizeText", () => {
  it("substitutes the canonical token", () => {
    expect(personalizeText(`Hi ${NAME_TOKEN}, please review.`, "Taylor Morgan")).toBe(
      "Hi Taylor, please review.",
    );
  });

  // The bug this module exists for: a model that ignored the token instruction
  // and left its own blank must not ship those brackets to the learner.
  it("substitutes a bracketed blank the model invented", () => {
    expect(
      personalizeText("Hey [Trainee's First Name], just uploaded the specs.", "Sam Patel"),
    ).toBe("Hey Sam, just uploaded the specs.");
  });

  it.each([
    ["[Name]"],
    ["[First Name]"],
    ["[Employee Name]"],
    ["[Recipient's name]"],
    ["[Trainee]"],
    ["[Employee]"],
    ["<name>"],
    ["{{name}}"],
    ["{first_name}"],
  ])("substitutes the %s placeholder form", (placeholder) => {
    expect(personalizeText(`Hi ${placeholder},`, "Sam Patel")).toBe("Hi Sam,");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(personalizeText(`${NAME_TOKEN}? Am I speaking with ${NAME_TOKEN}?`, "Sam")).toBe(
      "Sam? Am I speaking with Sam?",
    );
  });

  it("falls back to a real greeting when the user has no name", () => {
    // "Hey ," would look broken, which is the whole point of the fallback.
    expect(personalizeText(`Hey ${NAME_TOKEN},`, null)).toBe("Hey there,");
  });

  it("leaves text without placeholders untouched", () => {
    const text = "Dear Customer, your account requires verification.";
    expect(personalizeText(text, "Sam")).toBe(text);
  });

  // A generic greeting is itself a graded red flag (generic_greeting), so
  // substitution must never turn one into a personal one.
  it("does not inject a name into a deliberately impersonal greeting", () => {
    const text = "Dear Valued Customer, we detected unusual activity.";
    expect(personalizeText(text, "Sam Patel")).toBe(text);
  });
});

describe("normalizePlaceholders", () => {
  it("rewrites an invented blank to the canonical token for storage", () => {
    expect(normalizePlaceholders("Hey [Trainee's First Name], see attached.")).toBe(
      `Hey ${NAME_TOKEN}, see attached.`,
    );
  });

  it("leaves an already-canonical token alone", () => {
    const text = `Hi ${NAME_TOKEN},`;
    expect(normalizePlaceholders(text)).toBe(text);
  });
});

describe("hasPlaceholder", () => {
  it("detects placeholders without leaking regex state between calls", () => {
    const text = `Hi ${NAME_TOKEN},`;
    expect(hasPlaceholder(text)).toBe(true);
    expect(hasPlaceholder(text)).toBe(true);
  });

  it("is false for ordinary text", () => {
    expect(hasPlaceholder("Hi Taylor,")).toBe(false);
  });
});

describe("personalizeScenario", () => {
  it("personalizes sender, subject and body while preserving other fields", () => {
    const scenario = {
      vector: "email" as const,
      sender: "Alex Rivera <alex@corp.example>",
      subject: `${NAME_TOKEN}, action needed`,
      body: `Hey [Trainee's First Name], the Phoenix specs are on the drive.`,
      difficulty: 3,
    };

    expect(personalizeScenario(scenario, "Sam Patel")).toEqual({
      vector: "email",
      sender: "Alex Rivera <alex@corp.example>",
      subject: "Sam, action needed",
      body: "Hey Sam, the Phoenix specs are on the drive.",
      difficulty: 3,
    });
  });
});
