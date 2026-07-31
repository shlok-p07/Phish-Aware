import { describe, it, expect } from "bun:test";
import { decideSsoProvisioning, type SsoProvisionInput } from "./provisioning";

const NOW = new Date("2026-07-31T12:00:00Z");

function input(overrides: Partial<SsoProvisionInput> = {}): SsoProvisionInput {
  return {
    email: "alice@acme.com",
    emailVerified: true,
    requireVerifiedEmail: true,
    allowedDomains: ["acme.com"],
    member: null,
    orphan: null,
    invitation: null,
    activeSeats: 3,
    seatLimit: 50,
    now: NOW,
    ...overrides,
  };
}

const pendingInvite = {
  id: "inv1",
  role: "employee" as const,
  status: "pending" as const,
  expiresAt: new Date("2026-08-14T12:00:00Z"),
};

describe("decideSsoProvisioning — domain gating", () => {
  it("rejects an email outside the allowed domains", () => {
    expect(decideSsoProvisioning(input({ email: "carol@other.com" }))).toEqual({
      kind: "reject",
      code: "domain_not_allowed",
    });
  });

  it("checks the domain before anything else, even for an existing member", () => {
    const decision = decideSsoProvisioning(
      input({ email: "carol@other.com", member: { id: "u1", status: "active" } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "domain_not_allowed" });
  });

  it("skips the domain check when no domains are configured", () => {
    const decision = decideSsoProvisioning(
      input({
        email: "carol@other.com",
        allowedDomains: [],
        member: { id: "u1", status: "active" },
      }),
    );
    expect(decision).toEqual({ kind: "login", userId: "u1" });
  });
});

describe("decideSsoProvisioning — email verification", () => {
  it("rejects an explicitly unverified email", () => {
    expect(decideSsoProvisioning(input({ emailVerified: false }))).toEqual({
      kind: "reject",
      code: "email_unverified",
    });
  });

  it("allows an absent claim when the domain is allowlisted (Entra emits no email_verified)", () => {
    const decision = decideSsoProvisioning(
      input({ emailVerified: null, member: { id: "u1", status: "active" } }),
    );
    expect(decision).toEqual({ kind: "login", userId: "u1" });
  });

  it("rejects an absent claim when there is no domain restriction to stand in for it", () => {
    const decision = decideSsoProvisioning(
      input({
        emailVerified: null,
        allowedDomains: [],
        member: { id: "u1", status: "active" },
      }),
    );
    expect(decision).toEqual({ kind: "reject", code: "email_unverified" });
  });

  it("ignores verification entirely when the connection does not require it", () => {
    const decision = decideSsoProvisioning(
      input({
        emailVerified: false,
        requireVerifiedEmail: false,
        member: { id: "u1", status: "active" },
      }),
    );
    expect(decision).toEqual({ kind: "login", userId: "u1" });
  });
});

describe("decideSsoProvisioning — existing members", () => {
  it("logs in an active member", () => {
    expect(decideSsoProvisioning(input({ member: { id: "u1", status: "active" } }))).toEqual({
      kind: "login",
      userId: "u1",
    });
  });

  it("logs in a legacy 'invited' member row so it can be flipped to active", () => {
    expect(decideSsoProvisioning(input({ member: { id: "u1", status: "invited" } }))).toEqual({
      kind: "login",
      userId: "u1",
    });
  });

  it("rejects a disabled member", () => {
    expect(decideSsoProvisioning(input({ member: { id: "u1", status: "disabled" } }))).toEqual({
      kind: "reject",
      code: "account_disabled",
    });
  });

  it("prefers the member row over a leftover invitation", () => {
    const decision = decideSsoProvisioning(
      input({ member: { id: "u1", status: "active" }, invitation: pendingInvite }),
    );
    expect(decision).toEqual({ kind: "login", userId: "u1" });
  });

  it("ignores the seat limit for someone who is already a member", () => {
    const decision = decideSsoProvisioning(
      input({ member: { id: "u1", status: "active" }, activeSeats: 50, seatLimit: 50 }),
    );
    expect(decision).toEqual({ kind: "login", userId: "u1" });
  });
});

describe("decideSsoProvisioning — invitations", () => {
  it("creates a user from a pending invitation", () => {
    expect(decideSsoProvisioning(input({ invitation: pendingInvite }))).toEqual({
      kind: "create",
      role: "employee",
      invitationId: "inv1",
    });
  });

  it("carries the invited role through", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, role: "admin" } }),
    );
    expect(decision).toEqual({ kind: "create", role: "admin", invitationId: "inv1" });
  });

  it("adopts an existing orgless account instead of creating a second one", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: pendingInvite, orphan: { id: "orphan1" } }),
    );
    expect(decision).toEqual({
      kind: "adopt",
      userId: "orphan1",
      role: "employee",
      invitationId: "inv1",
    });
  });

  it("rejects a revoked invitation", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, status: "revoked" } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "invitation_revoked" });
  });

  it("rejects an already-accepted invitation with no member row (they were removed)", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, status: "accepted" } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "not_a_member" });
  });

  it("rejects an invitation stored as expired", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, status: "expired" } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "invitation_expired" });
  });

  it("rejects a pending invitation whose expiry has passed", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, expiresAt: new Date("2026-07-30T12:00:00Z") } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "invitation_expired" });
  });

  it("treats an expiry exactly at now as expired", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, expiresAt: NOW } }),
    );
    expect(decision).toEqual({ kind: "reject", code: "invitation_expired" });
  });

  it("accepts an invitation that never expires", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: { ...pendingInvite, expiresAt: null } }),
    );
    expect(decision).toEqual({ kind: "create", role: "employee", invitationId: "inv1" });
  });
});

describe("decideSsoProvisioning — seats", () => {
  it("rejects when the org is full", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: pendingInvite, activeSeats: 50, seatLimit: 50 }),
    );
    expect(decision).toEqual({ kind: "reject", code: "seat_limit_reached" });
  });

  it("allows the last seat", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: pendingInvite, activeSeats: 49, seatLimit: 50 }),
    );
    expect(decision.kind).toBe("create");
  });

  it("treats a seat limit of 0 as unlimited", () => {
    const decision = decideSsoProvisioning(
      input({ invitation: pendingInvite, activeSeats: 9999, seatLimit: 0 }),
    );
    expect(decision.kind).toBe("create");
  });

  it("checks the seat limit before adopting", () => {
    const decision = decideSsoProvisioning(
      input({
        invitation: pendingInvite,
        orphan: { id: "orphan1" },
        activeSeats: 50,
        seatLimit: 50,
      }),
    );
    expect(decision).toEqual({ kind: "reject", code: "seat_limit_reached" });
  });
});

describe("decideSsoProvisioning — strangers", () => {
  it("rejects someone with no member row and no invitation", () => {
    expect(decideSsoProvisioning(input())).toEqual({ kind: "reject", code: "not_a_member" });
  });

  it("rejects an orgless account holder who was never invited", () => {
    expect(decideSsoProvisioning(input({ orphan: { id: "orphan1" } }))).toEqual({
      kind: "reject",
      code: "not_a_member",
    });
  });
});
