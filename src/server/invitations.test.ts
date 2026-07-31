import { describe, it, expect } from "bun:test";
import {
  generateInviteToken,
  invitationExpiry,
  invitationState,
  isInvitationUsable,
  INVITATION_TTL_MS,
} from "./invitations";

const NOW = new Date("2026-07-31T12:00:00Z");

describe("generateInviteToken", () => {
  it("is 43 base64url chars (32 bytes)", () => {
    expect(generateInviteToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is URL-path safe", () => {
    for (let i = 0; i < 50; i += 1) {
      const token = generateInviteToken();
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, generateInviteToken));
    expect(seen.size).toBe(200);
  });
});

describe("invitationExpiry", () => {
  it("is 14 days out", () => {
    expect(invitationExpiry(NOW).getTime()).toBe(NOW.getTime() + INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

describe("invitationState", () => {
  it("keeps a live pending invitation pending", () => {
    const future = new Date(NOW.getTime() + 1000);
    expect(invitationState({ status: "pending", expiresAt: future }, NOW)).toBe("pending");
  });

  it("reports a lapsed pending invitation as expired without a write", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(invitationState({ status: "pending", expiresAt: past }, NOW)).toBe("expired");
  });

  it("treats an expiry exactly at now as expired", () => {
    expect(invitationState({ status: "pending", expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("treats a null expiry as never expiring", () => {
    expect(invitationState({ status: "pending", expiresAt: null }, NOW)).toBe("pending");
  });

  it("passes non-pending statuses straight through, expiry notwithstanding", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(invitationState({ status: "accepted", expiresAt: past }, NOW)).toBe("accepted");
    expect(invitationState({ status: "revoked", expiresAt: past }, NOW)).toBe("revoked");
    expect(invitationState({ status: "expired", expiresAt: null }, NOW)).toBe("expired");
  });
});

describe("isInvitationUsable", () => {
  it("is true only for a live pending invitation", () => {
    const future = new Date(NOW.getTime() + 1000);
    const past = new Date(NOW.getTime() - 1000);
    expect(isInvitationUsable({ status: "pending", expiresAt: future }, NOW)).toBe(true);
    expect(isInvitationUsable({ status: "pending", expiresAt: past }, NOW)).toBe(false);
    expect(isInvitationUsable({ status: "accepted", expiresAt: future }, NOW)).toBe(false);
    expect(isInvitationUsable({ status: "revoked", expiresAt: future }, NOW)).toBe(false);
  });
});
