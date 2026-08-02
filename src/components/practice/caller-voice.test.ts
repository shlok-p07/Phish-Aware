import { describe, it, expect } from "bun:test";
import { pickCallerVoiceProfile, resolveSpeechVoice, type CallerVoiceProfile } from "./caller-voice";

const scenario = (overrides: Partial<Parameters<typeof pickCallerVoiceProfile>[0]> = {}) => ({
  id: "scenario-1",
  sender: "Bank Security",
  subject: "",
  body: "Caller: We are calling about your account.",
  difficulty: 2,
  ...overrides,
});

// Minimal stand-in -- resolveSpeechVoice only reads name and lang.
const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe("pickCallerVoiceProfile", () => {
  it("is deterministic for the same scenario", () => {
    const a = pickCallerVoiceProfile(scenario());
    const b = pickCallerVoiceProfile(scenario());
    expect(a).toEqual(b);
  });

  it("varies the gender across scenarios instead of always casting the same one", () => {
    const genders = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(
        (id) => pickCallerVoiceProfile(scenario({ id })).gender,
      ),
    );
    expect(genders.size).toBe(2);
  });

  it("uses a UK voice when the scenario is set in the UK", () => {
    const profile = pickCallerVoiceProfile(
      scenario({ body: "Caller: This is HMRC regarding £480 of unpaid council tax." }),
    );
    expect(profile.accent).toBe("en-GB");
  });

  it("defaults to a US voice when there is no UK signal", () => {
    expect(pickCallerVoiceProfile(scenario()).accent).toBe("en-US");
  });

  it("speaks faster when the caller is applying time pressure", () => {
    const pressuring = pickCallerVoiceProfile(
      scenario({ body: "Caller: Your account will be suspended in 10 minutes, act now." }),
    );
    expect(pressuring.delivery).toBe("pressuring");
    expect(pressuring.rate).toBeGreaterThan(1);
  });

  it("drops pitch when the caller is leaning on official authority", () => {
    const authoritative = pickCallerVoiceProfile(
      scenario({ body: "Caller: This is the IRS fraud department. A warrant has been issued." }),
    );
    expect(authoritative.delivery).toBe("authoritative");
    expect(authoritative.pitch).toBeLessThan(1);
  });

  it("stays warm when the caller is playing helpful support", () => {
    const reassuring = pickCallerVoiceProfile(
      scenario({ body: "Caller: Just a routine courtesy call, happy to help you today." }),
    );
    expect(reassuring.delivery).toBe("reassuring");
    expect(reassuring.pitch).toBeGreaterThan(1);
  });

  it("falls back to a conversational delivery when nothing stands out", () => {
    const profile = pickCallerVoiceProfile(scenario({ body: "Caller: Good morning, this is Dana." }));
    expect(profile.delivery).toBe("natural");
    expect(profile.rate).toBe(1);
    expect(profile.pitch).toBe(1);
  });

  it("delivers harder scenarios closer to neutral so they can't be caught on tone alone", () => {
    const body = "Caller: Your account will be suspended in 10 minutes, act now.";
    const easy = pickCallerVoiceProfile(scenario({ body, difficulty: 1 }));
    const hard = pickCallerVoiceProfile(scenario({ body, difficulty: 5 }));
    expect(hard.rate).toBeLessThan(easy.rate);
    expect(hard.rate).toBeGreaterThan(1);
  });
});

describe("resolveSpeechVoice", () => {
  const profile = (overrides: Partial<CallerVoiceProfile> = {}): CallerVoiceProfile => ({
    accent: "en-GB",
    gender: "female",
    delivery: "natural",
    rate: 1,
    pitch: 1,
    ...overrides,
  });

  it("picks the cast voice when it is installed", () => {
    const voices = [voice("Samantha", "en-US"), voice("Kate", "en-GB"), voice("Daniel", "en-GB")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Kate");
  });

  it("keeps the accent when the cast gender is unavailable", () => {
    const voices = [voice("Samantha", "en-US"), voice("Daniel", "en-GB")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Daniel");
  });

  it("keeps the gender when the accent is unavailable", () => {
    const voices = [voice("Samantha", "en-US"), voice("Alex", "en-US")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Samantha");
  });

  it("never falls back to a novelty voice while an ordinary one exists", () => {
    const voices = [voice("Bubbles", "en-US"), voice("Jester", "en-US"), voice("Nicky", "en-GB")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Nicky");
  });

  it("prefers an unnamed but ordinary voice in the right locale", () => {
    const voices = [voice("Zarvox", "en-GB"), voice("Some Other Voice", "en-US"), voice("Nicky", "en-GB")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Nicky");
  });

  it("returns null when the browser has no voices at all", () => {
    expect(resolveSpeechVoice([], profile())).toBeNull();
  });

  it("takes a novelty voice over silence as a last resort", () => {
    const voices = [voice("Bubbles", "en-US")];
    expect(resolveSpeechVoice(voices, profile())?.name).toBe("Bubbles");
  });
});
