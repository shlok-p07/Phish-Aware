import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RetentionCard, describeNextDue, type RetentionSummaryView } from "./retention-card";

const view = (over: Partial<RetentionSummaryView> = {}): RetentionSummaryView => ({
  mastered: 0,
  due: 0,
  tracked: 0,
  masteryStreak: 3,
  nextDueAt: null,
  masteredTargets: [],
  dueTargets: [],
  targets: [],
  ...over,
});

describe("describeNextDue", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("returns null when nothing is scheduled", () => {
    expect(describeNextDue(null, now)).toBeNull();
    expect(describeNextDue(undefined, now)).toBeNull();
  });

  it("does not throw on a malformed timestamp", () => {
    expect(describeNextDue("not-a-date", now)).toBeNull();
  });

  it("describes near dates in days", () => {
    expect(describeNextDue("2026-08-21T12:00:00.000Z", now)).toBe("tomorrow");
    expect(describeNextDue("2026-08-23T12:00:00.000Z", now)).toBe("in 3 days");
  });

  it("rounds distant dates to weeks rather than implying precision", () => {
    expect(describeNextDue("2026-08-27T12:00:00.000Z", now)).toBe("in about a week");
    expect(describeNextDue("2026-09-10T12:00:00.000Z", now)).toBe("in about 3 weeks");
  });

  it("treats an already-passed date as today", () => {
    expect(describeNextDue("2026-08-19T12:00:00.000Z", now)).toBe("today");
  });
});

describe("RetentionCard progress", () => {
  it("shows how close each target is, not just how many are mastered", () => {
    // The complaint this answers: mastery takes three in a row and reviews are
    // scheduled a day out, so a learner who had just practised saw a flat zero
    // and concluded nothing was tracking.
    render(
      <RetentionCard
        retention={view({
          tracked: 2,
          mastered: 0,
          targets: [
            { label: "Mismatched sender domain", streak: 2, mastered: false, due: false },
            { label: "Urgency or pressure to act fast", streak: 1, mastered: false, due: false },
          ],
        })}
      />,
    );
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("Mismatched sender domain")).toBeTruthy();
  });

  it("marks a mastered target as done rather than showing a fraction", () => {
    render(
      <RetentionCard
        retention={view({
          tracked: 1,
          mastered: 1,
          targets: [{ label: "Suspicious QR code", streak: 3, mastered: true, due: false }],
        })}
      />,
    );
    expect(screen.getByText("Mastered")).toBeTruthy();
    expect(screen.queryByText("3/3")).toBeNull();
  });

  it("keeps the list short enough to scan", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      label: `Target ${i}`, streak: 1, mastered: false, due: false,
    }));
    render(<RetentionCard retention={view({ tracked: 12, targets: many })} />);
    expect(screen.queryByText("Target 8")).toBeNull();
  });
});

describe("RetentionCard", () => {
  it("invites a first-time learner in rather than reporting zero", () => {
    render(<RetentionCard retention={view()} />);
    expect(screen.getByRole("link", { name: /start practising/i })).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("names what is due instead of only counting it", () => {
    render(
      <RetentionCard
        retention={view({
          tracked: 4,
          mastered: 1,
          due: 2,
          masteredTargets: ["Unexpected attachment"],
          dueTargets: ["Mismatched sender domain", "Urgency or pressure to act fast"],
        })}
      />,
    );
    expect(screen.getByText(/Mismatched sender domain/)).toBeTruthy();
    expect(screen.getByText(/Coming back up \(2\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /practise these/i })).toBeTruthy();
  });

  it("shows mastered red flags as earned", () => {
    render(
      <RetentionCard
        retention={view({ tracked: 2, mastered: 2, masteredTargets: ["Suspicious QR code"] })}
      />,
    );
    expect(screen.getByText("Suspicious QR code")).toBeTruthy();
  });

  it("says when the next review lands if nothing is due", () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    render(<RetentionCard retention={view({ tracked: 3, mastered: 3, nextDueAt: soon })} />);
    expect(screen.getByText(/next review comes up in 3 days/i)).toBeTruthy();
  });

  it("does not claim a next review it does not have", () => {
    render(<RetentionCard retention={view({ tracked: 1, mastered: 0 })} />);
    expect(screen.getByText(/Nothing due right now\.$/)).toBeTruthy();
  });
});
