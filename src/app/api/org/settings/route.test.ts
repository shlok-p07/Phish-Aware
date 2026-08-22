import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { PATCH } = await import("./route");

const ORG = new ObjectId();
const ADMIN = new ObjectId();

function seed() {
  fakeDbState.users.push({ _id: ADMIN, orgId: ORG, role: "admin", name: "Admin" });
  fakeDbState.organizations.push({
    _id: ORG,
    orgId: ORG,
    name: "Acme Ltd",
    domain: null,
    settings: { seatLimit: 50 },
  });
  fakeSessionState.userId = ADMIN;
}

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/org/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

const org = () => fakeDbState.organizations[0];

describe("PATCH /api/org/settings", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seed();
  });

  it("accepts a sensible seat limit", async () => {
    const res = await patch({ seatLimit: 25 });

    expect(res.status).toBe(200);
    expect((org().settings as { seatLimit: number }).seatLimit).toBe(25);
  });

  it.each([["abc"], [0], [-5], [1.7], [null], [100_001]])(
    "rejects %p rather than coercing it to a seat limit",
    async (value) => {
      const res = await patch({ seatLimit: value });

      // Coercion turned "abc" and null into 0, which silently blocks every
      // future invitation with nothing to say why.
      expect(res.status).toBe(400);
    },
  );

  it("refuses to rename an organization to nothing", async () => {
    const res = await patch({ name: "   " });

    expect(res.status).toBe(400);
    expect(org().name).toBe("Acme Ltd");
  });

  it("refuses an unreasonably long name", async () => {
    const res = await patch({ name: "x".repeat(200) });

    expect(res.status).toBe(400);
    expect(org().name).toBe("Acme Ltd");
  });

  it("trims a name that is otherwise fine", async () => {
    const res = await patch({ name: "  Northline Bank  " });

    expect(res.status).toBe(200);
    expect(org().name).toBe("Northline Bank");
  });

  it("leaves the seat limit alone when only the name is sent", async () => {
    await patch({ name: "Renamed" });

    const stored = org();
    const limit = stored["settings.seatLimit"] ?? (stored.settings as { seatLimit: number }).seatLimit;
    expect(limit).toBe(50);
  });

  it("rejects a malformed body as a client error, not a server fault", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/org/settings", {
        method: "PATCH",
        body: "{ not json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("refuses a non-admin caller", async () => {
    const outsider = new ObjectId();
    fakeDbState.users.push({ _id: outsider, orgId: ORG, role: "employee", name: "Employee" });
    fakeSessionState.userId = outsider;

    const res = await patch({ seatLimit: 10 });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/org/settings: workspace customisation", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seed();
  });

  const workspace = () =>
    (org().settings as {
      branding?: { accentColor?: string | null; logoUrl?: string | null; welcomeMessage?: string | null };
      reporting?: { channel?: string | null; instructions?: string | null };
      practiceVectors?: string[];
    });

  it("stores a normalised accent colour", async () => {
    const res = await patch({ branding: { accentColor: "#0F766E" } });
    expect(res.status).toBe(200);
    expect(workspace().branding?.accentColor).toBe("#0f766e");
  });

  it("stores a reporting channel lowercased", async () => {
    const res = await patch({ reporting: { channel: "Phishing@Acme.test" } });
    expect(res.status).toBe(200);
    expect(workspace().reporting?.channel).toBe("phishing@acme.test");
  });

  it("clears a field when given an empty string", async () => {
    await patch({ branding: { accentColor: "#0f766e" } });
    const res = await patch({ branding: { accentColor: "" } });
    expect(res.status).toBe(200);
    expect(workspace().branding?.accentColor).toBeNull();
  });

  it("leaves fields it was not asked about alone", async () => {
    // A partial save must not silently blank the rest of the workspace.
    await patch({
      branding: { accentColor: "#0f766e", welcomeMessage: "Hello from security." },
      reporting: { channel: "phishing@acme.test" },
    });
    const res = await patch({ branding: { accentColor: "#b91c1c" } });
    expect(res.status).toBe(200);
    expect(workspace().branding?.welcomeMessage).toBe("Hello from security.");
    expect(workspace().reporting?.channel).toBe("phishing@acme.test");
  });

  it("does not disturb the seat limit already stored beside it", async () => {
    const res = await patch({ branding: { accentColor: "#0f766e" } });
    expect(res.status).toBe(200);
    expect((org().settings as { seatLimit: number }).seatLimit).toBe(50);
  });

  it("treats every channel selected as no restriction", async () => {
    const res = await patch({
      practiceVectors: ["email", "sms", "voice", "qr", "social", "web"],
    });
    expect(res.status).toBe(200);
    expect(workspace().practiceVectors).toEqual([]);
  });

  it.each([
    ["a CSS breakout", { branding: { accentColor: "#fff; background: url(https://evil.test/x)" } }],
    ["a named colour", { branding: { accentColor: "red" } }],
    ["a javascript: logo", { branding: { logoUrl: "javascript:alert(1)" } }],
    ["a data: logo", { branding: { logoUrl: "data:image/svg+xml,<svg onload=alert(1)>" } }],
    ["an http logo", { branding: { logoUrl: "http://cdn.evil.test/l.png" } }],
    ["a logo with credentials", { branding: { logoUrl: "https://u:p@cdn.test/l.png" } }],
    ["a javascript: reporting channel", { reporting: { channel: "javascript:alert(1)" } }],
    ["an unknown practice channel", { practiceVectors: ["carrier-pigeon"] }],
    ["practiceVectors as a string", { practiceVectors: "email" }],
  ])("rejects %s", async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    // And nothing is written: a rejected save must not partially apply.
    expect(org().settings).toEqual({ seatLimit: 50 });
  });
});
