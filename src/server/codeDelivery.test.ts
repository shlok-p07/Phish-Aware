import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { deliverResetCode, resetCodeWebhookConfigured } from "./codeDelivery";

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.PASSWORD_RESET_WEBHOOK_URL;
const ORIGINAL_SECRET = process.env.PASSWORD_RESET_WEBHOOK_SECRET;

const delivery = {
  email: "alice@acme.test",
  code: "123456",
  expiresAt: new Date("2026-01-01T00:00:00.000Z"),
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  env.PASSWORD_RESET_WEBHOOK_URL = ORIGINAL_URL;
  env.PASSWORD_RESET_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

describe("resetCodeWebhookConfigured", () => {
  it("is false when unset or blank", () => {
    delete env.PASSWORD_RESET_WEBHOOK_URL;
    expect(resetCodeWebhookConfigured()).toBe(false);
    env.PASSWORD_RESET_WEBHOOK_URL = "   ";
    // Blank has to read as unset, or a half-filled deployment silently claims a
    // delivery channel it does not have.
    expect(resetCodeWebhookConfigured()).toBe(false);
  });

  it("is true once a URL is set", () => {
    env.PASSWORD_RESET_WEBHOOK_URL = "https://hooks.acme.test/reset";
    expect(resetCodeWebhookConfigured()).toBe(true);
  });
});

describe("deliverResetCode", () => {
  beforeEach(() => {
    env.PASSWORD_RESET_WEBHOOK_URL = "https://hooks.acme.test/reset";
    delete env.PASSWORD_RESET_WEBHOOK_SECRET;
  });

  it("does nothing and reports failure when no channel is configured", async () => {
    delete env.PASSWORD_RESET_WEBHOOK_URL;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    expect(await deliverResetCode(delivery)).toBe(false);
    expect(called).toBe(false);
  });

  it("posts the code to the configured endpoint", async () => {
    const seen: { url: string; body: unknown; auth: string | null } = {
      url: "",
      body: null,
      auth: "unset",
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.body = JSON.parse(String(init?.body));
      seen.auth = new Headers(init?.headers).get("authorization");
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    expect(await deliverResetCode(delivery)).toBe(true);
    expect(seen.url).toBe("https://hooks.acme.test/reset");
    expect(seen.body).toEqual({
      type: "password_reset_code",
      email: "alice@acme.test",
      code: "123456",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    expect(seen.auth).toBeNull();
  });

  it("sends the shared secret when one is configured", async () => {
    env.PASSWORD_RESET_WEBHOOK_SECRET = "s3cret";
    const captured: { auth: string | null } = { auth: null };
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      captured.auth = new Headers(init?.headers).get("authorization");
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await deliverResetCode(delivery);

    expect(captured.auth).toBe("Bearer s3cret");
  });

  it("reports failure on a rejected request rather than throwing", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    // The caller falls back to the admin path; a delivery hiccup must not fail
    // the whole request.
    expect(await deliverResetCode(delivery)).toBe(false);
  });

  it("reports failure when the endpoint is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await deliverResetCode(delivery)).toBe(false);
  });
});
