import { describe, expect, it, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { InboxPreview } from "./inbox-preview";

afterEach(() => {
  cleanup();
});

describe("InboxPreview", () => {
  it("starts with no cue highlighted", () => {
    render(<InboxPreview />);
    const senderDomain = screen.getByText(/it-support@accounts-verify-portal\.com/);
    expect(senderDomain.className).not.toContain("bg-destructive/15");
  });

  it("highlights the sender domain when its cue chip is hovered", () => {
    render(<InboxPreview />);
    const chip = screen.getByRole("button", { name: /Mismatched sender domain/i });
    const senderDomain = screen.getByText(/it-support@accounts-verify-portal\.com/);

    fireEvent.mouseEnter(chip);
    expect(senderDomain.className).toContain("bg-destructive/15");

    fireEvent.mouseLeave(chip);
    expect(senderDomain.className).not.toContain("bg-destructive/15");
  });

  it("highlights the urgency sentence when its cue chip is hovered", () => {
    render(<InboxPreview />);
    const chip = screen.getByRole("button", { name: /Urgency or pressure to act fast/i });
    const sentence = screen.getByText(/Click below to confirm your identity/);

    fireEvent.mouseEnter(chip);
    expect(sentence.className).toContain("bg-destructive/15");
  });

  it("rings the fake button when the mismatched-link cue chip is hovered", () => {
    render(<InboxPreview />);
    const chip = screen.getByRole("button", { name: /Suspicious or mismatched link/i });
    const fakeButton = screen.getByText("Verify My Account →");

    fireEvent.mouseEnter(chip);
    expect(fakeButton.className).toContain("ring-2");

    fireEvent.mouseLeave(chip);
    expect(fakeButton.className).not.toContain("ring-2");
  });

  it("only one cue is highlighted at a time", () => {
    render(<InboxPreview />);
    const senderChip = screen.getByRole("button", { name: /Mismatched sender domain/i });
    const urgencyChip = screen.getByRole("button", { name: /Urgency or pressure to act fast/i });
    const senderDomain = screen.getByText(/it-support@accounts-verify-portal\.com/);
    const sentence = screen.getByText(/Click below to confirm your identity/);

    fireEvent.mouseEnter(senderChip);
    fireEvent.mouseEnter(urgencyChip);

    expect(sentence.className).toContain("bg-destructive/15");
    expect(senderDomain.className).not.toContain("bg-destructive/15");
  });

  it("also highlights on keyboard focus, not just mouse hover (accessibility)", () => {
    render(<InboxPreview />);
    const chip = screen.getByRole("button", { name: /Mismatched sender domain/i });
    const senderDomain = screen.getByText(/it-support@accounts-verify-portal\.com/);

    fireEvent.focus(chip);
    expect(senderDomain.className).toContain("bg-destructive/15");

    fireEvent.blur(chip);
    expect(senderDomain.className).not.toContain("bg-destructive/15");
  });

  it("renders all three cue chips with the real cue vocabulary labels", () => {
    render(<InboxPreview />);
    expect(screen.getByRole("button", { name: /Mismatched sender domain/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Urgency or pressure to act fast/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Suspicious or mismatched link/i })).toBeTruthy();
  });
});
