import { describe, expect, it } from "bun:test";
import { CUE_REGION, findBodyMatch, highlightClass } from "./cue-highlight";
import type { CueId } from "@/server/cues";

describe("findBodyMatch", () => {
  it("locates a body-cue keyword and returns its exact slice", () => {
    const body = "Please verify your account immediately or it will be closed.";
    const match = findBodyMatch(body, "urgency_language");
    expect(match).not.toBeNull();
    expect(body.slice(match!.start, match!.end).toLowerCase()).toBe("immediately");
  });

  it("is case-insensitive", () => {
    const body = "Your access EXPIRES today.";
    const match = findBodyMatch(body, "urgency_language");
    expect(match).not.toBeNull();
    expect(body.slice(match!.start, match!.end)).toBe("EXPIRES");
  });

  it("returns the earliest match when several keywords are present", () => {
    // "password" (credential) appears before "credentials" -- earliest wins.
    const body = "Enter your password to confirm your credentials now.";
    const match = findBodyMatch(body, "credential_request");
    expect(match).not.toBeNull();
    expect(body.slice(match!.start, match!.end).toLowerCase()).toBe("password");
  });

  it("returns null when no keyword matches", () => {
    const body = "Thanks for the quick update on the project timeline.";
    expect(findBodyMatch(body, "urgency_language")).toBeNull();
  });

  it("does not match a short keyword buried inside a longer word", () => {
    // "must" must not light up inside "mustard"; no other urgency word here.
    const body = "The mustard is in the cupboard.";
    expect(findBodyMatch(body, "urgency_language")).toBeNull();
  });

  it("matches a group greeting like 'Hello Team'", () => {
    const body = "Hello Team, this is IT Support with an update.";
    const match = findBodyMatch(body, "generic_greeting");
    expect(match).not.toBeNull();
    expect(body.slice(match!.start, match!.end).toLowerCase()).toBe("hello team");
  });

  it("returns null for cues that have no body-keyword lexicon", () => {
    // Structured cues live in sender/links/attachments, not the body.
    const body = "Anything at all.";
    (["sender_domain", "mismatched_link", "unexpected_attachment", "suspicious_qr", "spelling_grammar"] as CueId[]).forEach(
      (cue) => expect(findBodyMatch(body, cue)).toBeNull(),
    );
  });
});

describe("CUE_REGION", () => {
  it("anchors every cue id to exactly one region", () => {
    // Guards against a new CueId being added to the vocabulary without a region.
    const cues = Object.keys(CUE_REGION) as CueId[];
    expect(cues.length).toBe(8);
    cues.forEach((c) => {
      expect(["sender", "body", "links", "attachments"]).toContain(CUE_REGION[c]);
    });
  });
});

describe("highlightClass", () => {
  it("adds the destructive highlight only when active", () => {
    expect(highlightClass(true)).toContain("bg-destructive/20");
    expect(highlightClass(false)).not.toContain("bg-destructive");
  });

  it("never adds horizontal padding/margin that would reflow the text", () => {
    // The old version used px-1 -mx-1, which shifted surrounding text on hover.
    expect(highlightClass(true)).not.toContain("px-1");
    expect(highlightClass(true)).not.toContain("-mx-1");
  });
});
