import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SmsPreview } from "./sms-preview";

afterEach(() => {
  cleanup();
});

describe("SmsPreview", () => {
  it("starts with no cue highlighted", () => {
    render(<SmsPreview />);
    const link = screen.getByText(/zendesk-auth\.us\/confirm/);
    expect(link.parentElement!.className).not.toContain("bg-destructive/15");
  });

  it("highlights the urgency sentence when its cue chip is hovered", () => {
    render(<SmsPreview />);
    const chip = screen.getByRole("button", { name: /Urgency or pressure to act fast/i });
    const sentence = screen.getByText(/verify your login ASAP/);

    fireEvent.mouseEnter(chip);
    expect(sentence.className).toContain("bg-destructive/15");

    fireEvent.mouseLeave(chip);
    expect(sentence.className).not.toContain("bg-destructive/15");
  });

  it("highlights the link when the mismatched-link cue chip is hovered", () => {
    render(<SmsPreview />);
    const chip = screen.getByRole("button", { name: /Suspicious or mismatched link/i });
    const link = screen.getByText(/zendesk-auth\.us\/confirm/);

    fireEvent.mouseEnter(chip);
    expect(link.parentElement!.className).toContain("bg-destructive/15");

    fireEvent.mouseLeave(chip);
    expect(link.parentElement!.className).not.toContain("bg-destructive/15");
  });

  it("only one cue is highlighted at a time", () => {
    render(<SmsPreview />);
    const urgencyChip = screen.getByRole("button", { name: /Urgency or pressure to act fast/i });
    const linkChip = screen.getByRole("button", { name: /Suspicious or mismatched link/i });
    const sentence = screen.getByText(/verify your login ASAP/);
    const link = screen.getByText(/zendesk-auth\.us\/confirm/);

    fireEvent.mouseEnter(urgencyChip);
    fireEvent.mouseEnter(linkChip);

    expect(link.parentElement!.className).toContain("bg-destructive/15");
    expect(sentence.className).not.toContain("bg-destructive/15");
  });

  it("also highlights on keyboard focus, not just mouse hover (accessibility)", () => {
    render(<SmsPreview />);
    const chip = screen.getByRole("button", { name: /Urgency or pressure to act fast/i });
    const sentence = screen.getByText(/verify your login ASAP/);

    fireEvent.focus(chip);
    expect(sentence.className).toContain("bg-destructive/15");

    fireEvent.blur(chip);
    expect(sentence.className).not.toContain("bg-destructive/15");
  });

  it("renders both cue chips with the real cue vocabulary labels", () => {
    render(<SmsPreview />);
    expect(screen.getByRole("button", { name: /Urgency or pressure to act fast/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Suspicious or mismatched link/i })).toBeTruthy();
  });
});
