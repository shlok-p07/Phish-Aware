import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LessonScreenView } from "./lesson-screen";
import type { LessonScreen } from "@/db/models/lessons";

const anatomy: LessonScreen = {
  kind: "anatomy",
  heading: "Where to look",
  intro: "Each note points at one detail.",
  sample: {
    displayName: "Microsoft 365 Support",
    address: "no-reply@ms365-secure-billing.com",
    subject: "Action required",
    body: "Dear User,",
    linkText: "Confirm my account",
    linkHref: "https://ms365-secure-billing.com/verify",
  },
  callouts: [
    { target: "address", detail: "Read it right to left." },
    { target: "body", detail: "It does not know your name." },
  ],
};

const checkpoint: LessonScreen = {
  kind: "checkpoint",
  heading: "Before you move on",
  prompt: "Which is the strongest reason?",
  options: [
    { label: "The domain is not the employer's", correct: true, feedback: "Correct, and this catches the most attacks." },
    { label: "HR never emails about pensions", correct: false, feedback: "Not quite. Judge the address, not the topic." },
  ],
};

describe("LessonScreenView", () => {
  it("renders a legacy prose screen that has no kind at all", () => {
    // Every lesson written before screens became a union omits `kind`.
    const s = { heading: "What it is", body: "First para.\n\nSecond para." } as LessonScreen;
    render(<LessonScreenView screen={s} />);
    expect(screen.getByRole("heading", { name: "What it is" })).toBeInTheDocument();
    expect(screen.getByText("First para.")).toBeInTheDocument();
    expect(screen.getByText("Second para.")).toBeInTheDocument();
  });


  it("shows the real address and the real link target, not just the labels", () => {
    render(<LessonScreenView screen={anatomy} />);
    // Exact strings, not a shared substring: the domain appears in both the
    // sender address and the link target, and asserting each separately is the
    // point -- a learner has to check both.
    expect(screen.getByText("<no-reply@ms365-secure-billing.com>")).toBeInTheDocument();
    expect(screen.getByText("https://ms365-secure-billing.com/verify")).toBeInTheDocument();
  });

  it("keeps callout detail collapsed until asked, so the screen is not a wall of text", () => {
    render(<LessonScreenView screen={anatomy} />);
    expect(screen.queryByText("Read it right to left.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /The real address/ }));
    expect(screen.getByText("Read it right to left.")).toBeInTheDocument();
  });

  it("opens a callout on focus, so keyboard and mouse behave the same", () => {
    render(<LessonScreenView screen={anatomy} />);
    fireEvent.focus(screen.getByRole("button", { name: /The greeting/ }));
    expect(screen.getByText("It does not know your name.")).toBeInTheDocument();
  });

  it("never renders the sample link as a navigable anchor", () => {
    render(<LessonScreenView screen={anatomy} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows genuine and fake together on a comparison screen", () => {
    const s: LessonScreen = {
      kind: "compare",
      heading: "Side by side",
      intro: "The differences are always in the same places.",
      rows: [
        {
          label: "Sender address",
          genuine: "noreply@microsoft.com",
          fake: "no-reply@ms365-secure-billing.com",
          note: "One ends in microsoft.com.",
        },
      ],
    };
    render(<LessonScreenView screen={s} />);
    expect(screen.getByText("noreply@microsoft.com")).toBeInTheDocument();
    expect(screen.getByText("no-reply@ms365-secure-billing.com")).toBeInTheDocument();
    expect(screen.getByText("One ends in microsoft.com.")).toBeInTheDocument();
  });

  it("gives each step both a good sign and a warning sign", () => {
    const s: LessonScreen = {
      kind: "steps",
      heading: "Four checks",
      intro: "Fifteen seconds.",
      steps: [
        {
          action: "Read the sender's actual address.",
          lookFor: "The piece before .com.",
          warningSign: "Extra words joined by hyphens.",
        },
      ],
    };
    render(<LessonScreenView screen={s} />);
    expect(screen.getByText("The piece before .com.")).toBeInTheDocument();
    expect(screen.getByText("Extra words joined by hyphens.")).toBeInTheDocument();
  });


  it("withholds feedback until an answer is chosen", () => {
    render(<LessonScreenView screen={checkpoint} />);
    expect(screen.queryByText(/Correct, and this catches/)).not.toBeInTheDocument();
  });

  it("explains a correct answer", () => {
    render(<LessonScreenView screen={checkpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /domain is not the employer/ }));
    expect(screen.getByText(/Correct, and this catches/)).toBeInTheDocument();
    expect(screen.getByText(/That is the one/)).toBeInTheDocument();
  });

  it("explains a wrong answer rather than only marking it wrong", () => {
    render(<LessonScreenView screen={checkpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /never emails about pensions/ }));
    expect(screen.getByText(/Judge the address, not the topic/)).toBeInTheDocument();
  });

  it("announces feedback for a screen reader", () => {
    render(<LessonScreenView screen={checkpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /domain is not the employer/ }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

/**
 * Typographic consistency across screen kinds.
 *
 * The reported symptom was "lines and words flowing onto the other lines", and
 * there were two separate causes. The `intro` paragraphs carried a 68ch measure
 * while every sibling paragraph had none and ran the full container, so one
 * lesson wrapped prose at two different widths. And the genuine/fake comparison
 * used `break-all`, which splits a token at any character -- so a 56-character
 * address like the one in the real email lesson became "account-security-nore"
 * then "ply@accountprotection." That is contradicted by the reason
 * `.pa-inspectable` exists, which the class's own comment spells out.
 *
 * Asserted as rules rather than appearance, so this cannot regress the next time
 * a screen kind is added.
 */
describe("LessonScreenView typography", () => {
  const screens: LessonScreen[] = [
    { heading: "Legacy", body: "One para.\n\nTwo para." } as LessonScreen,
    anatomy,
    checkpoint,
    {
      kind: "compare",
      heading: "Side by side",
      intro: "The differences are always in the same places.",
      rows: [
        {
          label: "Sender address",
          genuine: "noreply@microsoft.com",
          fake: "account-security-noreply@accountprotection.microsoft.com",
          note: "One ends in microsoft.com.",
        },
      ],
    },
    {
      kind: "steps",
      heading: "Four checks",
      intro: "Fifteen seconds.",
      steps: [
        {
          action: "Read the sender's actual address.",
          lookFor: "The piece before .com.",
          warningSign: "Extra words joined by hyphens.",
        },
      ],
    },
  ];

  it("never uses break-all, which splits a word mid-token", () => {
    for (const s of screens) {
      const { container } = render(<LessonScreenView screen={s} />);
      expect(container.querySelectorAll("[class*='break-all']")).toHaveLength(0);
    }
  });

  it("lets a long address break at a sensible point instead", () => {
    const { container } = render(<LessonScreenView screen={screens[3]!} />);
    const mono = Array.from(container.querySelectorAll(".font-mono"));
    expect(mono.length).toBeGreaterThan(0);
    for (const el of mono) {
      expect(el.className).toContain("pa-inspectable");
    }
  });

  it("uses one measure for body prose rather than two", () => {
    const measures = new Set<string>();
    for (const s of screens) {
      const { container } = render(<LessonScreenView screen={s} />);
      for (const el of Array.from(container.querySelectorAll("p"))) {
        const found = el.className.match(/pa-measure(-wide)?/)?.[0];
        if (found) measures.add(found);
      }
    }
    // The bug was pa-measure on intros and nothing on their siblings.
    expect([...measures]).toEqual(["pa-measure-wide"]);
  });

  it("stacks the comparison until there is room for two columns", () => {
    const { container } = render(<LessonScreenView screen={screens[3]!} />);
    const grid = container.querySelector("[class*='grid-cols-2']");
    expect(grid?.className).toContain("md:grid-cols-2");
    expect(grid?.className).not.toContain("sm:grid-cols-2");
  });
});
