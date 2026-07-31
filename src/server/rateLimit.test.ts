import { describe, it, expect, beforeEach } from "bun:test";
import { rateLimit, clientIp, __resetRateLimits } from "./rateLimit";

beforeEach(() => {
  __resetRateLimits();
});

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("k", 5, 60_000).ok).toBe(true);
    }
  });

  it("blocks the request after the limit", () => {
    for (let i = 0; i < 5; i += 1) {
      rateLimit("k", 5, 60_000);
    }
    const result = rateLimit("k", 5, 60_000);
    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", () => {
    for (let i = 0; i < 5; i += 1) {
      rateLimit("a", 5, 60_000);
    }
    expect(rateLimit("a", 5, 60_000).ok).toBe(false);
    expect(rateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("starts a fresh window once the old one lapses", async () => {
    expect(rateLimit("k", 1, 20).ok).toBe(true);
    expect(rateLimit("k", 1, 20).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(rateLimit("k", 1, 20).ok).toBe(true);
  });

  it("reports retryAfter in whole seconds", () => {
    rateLimit("k", 1, 60_000);
    expect(rateLimit("k", 1, 60_000).retryAfter).toBeLessThanOrEqual(60);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("trims whitespace", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to 'unknown' when no header is present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
