import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DomainReveal } from "./domain-reveal";

describe("DomainReveal", () => {
  it("shows the whole address up front, so the trick is not given away", () => {
    render(<DomainReveal />);

    // Two elements carry the domain: the address itself and the explanation
    // that names it. Both are meant to.
    expect(screen.getAllByText("session-verify.net").length).toBeGreaterThan(0);
    expect(screen.getByText(/would your team click this/i)).toBeInTheDocument();
    // The explanation is the payoff; it must not be visible before the reveal.
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals the explanation on hover", () => {
    render(<DomainReveal />);
    const card = screen.getByRole("button");

    fireEvent.pointerEnter(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/last two parts before the first single slash/i)).toBeVisible();
  });

  it("reveals on focus too, so a keyboard reaches the point of the product", () => {
    render(<DomainReveal />);
    const card = screen.getByRole("button");

    fireEvent.focus(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles on click, which is the only way in on a touch screen", () => {
    render(<DomainReveal />);
    const card = screen.getByRole("button");

    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "false");
  });

  it("hides again when the pointer leaves", () => {
    render(<DomainReveal />);
    const card = screen.getByRole("button");

    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);

    expect(card).toHaveAttribute("aria-expanded", "false");
  });

  it("names the real owner rather than the reassuring part", () => {
    render(<DomainReveal />);
    fireEvent.pointerEnter(screen.getByRole("button"));

    // The whole lesson: microsoftonline.com is present but is not the owner.
    const explanation = screen.getByText(/last two parts before the first single slash/i);
    expect(explanation.textContent).toContain("session-verify.net");
    // Present, but not as the owner: that is the whole lesson.
    expect(explanation.textContent).toContain("microsoftonline.com");
  });

  it("is a real button, so it is reachable and announced", () => {
    render(<DomainReveal />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
