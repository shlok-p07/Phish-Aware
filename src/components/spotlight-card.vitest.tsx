import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpotlightCard } from "./spotlight-card";

/** happy-dom has no matchMedia by default; every test states what it is on. */
function setMedia(matches: (query: string) => boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

const hoveringPointer = (q: string) => q.includes("hover: hover");
const reducedMotion = (q: string) => q.includes("prefers-reduced-motion") || q.includes("hover: hover");

beforeEach(() => {
  setMedia(hoveringPointer);
  vi.stubGlobal(
    "requestAnimationFrame",
    ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame,
  );
  vi.stubGlobal("cancelAnimationFrame", (() => {}) as typeof cancelAnimationFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpotlightCard", () => {
  it("renders its children and a decorative wash", () => {
    const { container } = render(
      <SpotlightCard>
        <p>Inside</p>
      </SpotlightCard>,
    );

    expect(screen.getByText("Inside")).toBeInTheDocument();
    const wash = container.querySelector(".pa-spotlight-wash");
    // Decorative: it must not be announced, and must not be able to swallow a
    // click on anything inside the card.
    expect(wash).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the caller's classes so it can still be a card", () => {
    const { container } = render(<SpotlightCard className="rounded-xl border">x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]")!;
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("border");
  });

  it("can be a semantic element where that fits", () => {
    const { container } = render(<SpotlightCard as="article">x</SpotlightCard>);
    expect(container.querySelector("article")).not.toBeNull();
  });

  it("tracks the pointer by writing custom properties, not by re-rendering", () => {
    const { container } = render(<SpotlightCard>x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]") as HTMLElement;

    fireEvent.pointerEnter(card);
    fireEvent.pointerMove(card, { clientX: 40, clientY: 25 });

    expect(card.style.getPropertyValue("--spot-opacity")).toBe("1");
    // Position lands in the custom properties the stylesheet reads.
    expect(card.style.getPropertyValue("--spot-x")).toMatch(/px$/);
    expect(card.style.getPropertyValue("--spot-y")).toMatch(/px$/);
  });

  it("clears the highlight when the pointer leaves", () => {
    const { container } = render(<SpotlightCard>x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]") as HTMLElement;

    fireEvent.pointerEnter(card);
    expect(card.style.getPropertyValue("--spot-opacity")).toBe("1");
    fireEvent.pointerLeave(card);

    // Left set, the wash would sit there permanently after the cursor moved on.
    expect(card.style.getPropertyValue("--spot-opacity")).toBe("");
  });

  it("does nothing on a device with no hovering pointer", () => {
    setMedia((q) => !q.includes("hover: hover") && !q.includes("prefers-reduced-motion"));
    const { container } = render(<SpotlightCard>x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]") as HTMLElement;

    fireEvent.pointerEnter(card);
    fireEvent.pointerMove(card, { clientX: 10, clientY: 10 });

    // On a phone the highlight would otherwise stick where a finger last landed.
    expect(card.style.getPropertyValue("--spot-opacity")).toBe("");
    expect(card.style.getPropertyValue("--spot-x")).toBe("");
  });

  it("does nothing when the visitor asked for reduced motion", () => {
    setMedia(reducedMotion);
    const { container } = render(<SpotlightCard>x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]") as HTMLElement;

    fireEvent.pointerEnter(card);
    fireEvent.pointerMove(card, { clientX: 10, clientY: 10 });

    expect(card.style.getPropertyValue("--spot-opacity")).toBe("");
  });

  it("stops listening when unmounted", () => {
    const { container, unmount } = render(<SpotlightCard>x</SpotlightCard>);
    const card = container.querySelector("[data-spotlight]") as HTMLElement;
    const remove = vi.spyOn(card, "removeEventListener");

    unmount();

    // Three listeners in, three out -- a card grid mounts and unmounts these on
    // every navigation.
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
