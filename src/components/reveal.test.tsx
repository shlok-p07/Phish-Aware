import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup, act } from "@testing-library/react";
import { Reveal } from "./reveal";

/**
 * happy-dom doesn't implement IntersectionObserver, so this mock stands in
 * for the browser: it records every observed element/callback pair and lets
 * tests fire a synthetic intersection entry on demand.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}

  fire(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  // @ts-expect-error -- test-only global stub, not a full IntersectionObserver
  global.IntersectionObserver = FakeIntersectionObserver;
});

afterEach(() => {
  cleanup();
});

describe("Reveal", () => {
  it("starts hidden (no reveal-visible class) before intersecting", () => {
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const node = screen.getByText("content").parentElement!;
    expect(node.className).toContain("reveal");
    expect(node.className).not.toContain("reveal-visible");
  });

  it("adds reveal-visible once IntersectionObserver reports intersecting", () => {
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const node = screen.getByText("content").parentElement!;

    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.observed).toContain(node);

    act(() => observer.fire(true));
    expect(node.className).toContain("reveal-visible");
  });

  it("does not add reveal-visible when reported as not intersecting", () => {
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const node = screen.getByText("content").parentElement!;
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => observer.fire(false));
    expect(node.className).not.toContain("reveal-visible");
  });

  it("disconnects the observer once revealed (fires only once)", () => {
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const observer = FakeIntersectionObserver.instances[0]!;
    act(() => observer.fire(true));
    expect(observer.disconnected).toBe(true);
  });

  it("merges a caller-provided className alongside the reveal classes", () => {
    render(
      <Reveal className="custom-class">
        <p>content</p>
      </Reveal>,
    );
    const node = screen.getByText("content").parentElement!;
    expect(node.className).toContain("custom-class");
    expect(node.className).toContain("reveal");
  });
});
