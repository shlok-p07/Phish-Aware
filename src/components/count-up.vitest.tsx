import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountUp } from "./count-up";

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes("prefers-reduced-motion"),
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  document.documentElement.className = "";
  setReducedMotion(false);
});
afterEach(() => vi.useRealTimers());

describe("CountUp", () => {
  it("renders the value it is given", async () => {
    render(<CountUp value={42} />);
    expect(await screen.findByText("42")).toBeInTheDocument();
  });

  it("shows the final value immediately when the OS asks for reduced motion", async () => {
    setReducedMotion(true);
    render(<CountUp value={120} />);
    expect(await screen.findByText("120")).toBeInTheDocument();
  });

  it("shows the final value immediately when the app toggle is on", async () => {
    document.documentElement.classList.add("reduce-motion");
    render(<CountUp value={77} />);
    expect(await screen.findByText("77")).toBeInTheDocument();
  });

  it("applies a prefix without disturbing the number", async () => {
    setReducedMotion(true);
    render(<CountUp value={15} prefix="+" />);
    expect(await screen.findByText("+15")).toBeInTheDocument();
  });

  it("announces politely, so the award is not missed by a screen reader", async () => {
    setReducedMotion(true);
    render(<CountUp value={9} />);
    const el = await screen.findByText("9");
    expect(el).toHaveAttribute("aria-live", "polite");
  });

  it("does not animate on mount, so the first paint is already correct", async () => {
    const spy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    render(<CountUp value={15} prefix="+" />);
    expect(await screen.findByText("+15")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reaches the new value after the animation window", async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });

    const { rerender } = render(<CountUp value={0} durationMs={100} />);
    rerender(<CountUp value={50} durationMs={100} />);
    await act(async () => {
      now = 200; // past the end of the window
      frames.forEach((f) => f(now));
    });
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("does not start a fresh animation when the value has not changed", async () => {
    const spy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { rerender } = render(<CountUp value={5} />);
    const afterMount = spy.mock.calls.length;
    rerender(<CountUp value={5} />);
    expect(spy.mock.calls.length).toBe(afterMount);
  });

  it("never renders a placeholder in place of the real number", async () => {
    // Under reduced motion the effect returns without touching state, so the
    // value must come straight through rather than starting from zero.
    setReducedMotion(true);
    render(<CountUp value={33} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(await screen.findByText("33")).toBeInTheDocument();
  });
});
