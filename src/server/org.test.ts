import { describe, expect, it } from "bun:test";
import { hasSeatAvailable, type SeatUsage } from "./org";

function usage(overrides: Partial<SeatUsage> = {}): SeatUsage {
  return { activeSeats: 0, pendingInvitations: 0, seatLimit: 0, ...overrides };
}

describe("hasSeatAvailable", () => {
  it("treats a seat limit of 0 as unlimited, regardless of how many seats are taken", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 0, activeSeats: 1_000_000 }), true)).toBe(true);
    expect(hasSeatAvailable(usage({ seatLimit: 0, activeSeats: 1_000_000 }), false)).toBe(true);
  });

  it("allows one more seat when strictly under the limit", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 5, activeSeats: 4 }), false)).toBe(true);
  });

  it("refuses a seat exactly at the limit", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 5, activeSeats: 5 }), false)).toBe(false);
  });

  it("refuses a seat already over the limit", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 5, activeSeats: 6 }), false)).toBe(false);
  });

  it("counts pending invitations against the limit when asked to (invite time)", () => {
    const u = usage({ seatLimit: 3, activeSeats: 1, pendingInvitations: 2 });
    expect(hasSeatAvailable(u, true)).toBe(false); // 1 active + 2 pending == limit
  });

  it("ignores pending invitations when not asked to (accept time)", () => {
    // Same usage as above, but at accept time a revoked/expired pending
    // invitation shouldn't permanently hold a seat hostage.
    const u = usage({ seatLimit: 3, activeSeats: 1, pendingInvitations: 2 });
    expect(hasSeatAvailable(u, false)).toBe(true); // only 1 active < limit of 3
  });

  it("refuses a single-seat org's only seat once it's taken", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 1, activeSeats: 1 }), false)).toBe(false);
  });

  it("allows the very first member of a freshly limited org", () => {
    expect(hasSeatAvailable(usage({ seatLimit: 1, activeSeats: 0 }), false)).toBe(true);
  });

  it("treats a negative seatLimit the same as unlimited", () => {
    // seatLimit is admin-set and validated elsewhere, but a defensive <= 0
    // check (rather than === 0) means a corrupt/negative value fails open to
    // unlimited rather than refusing every single request.
    expect(hasSeatAvailable(usage({ seatLimit: -1, activeSeats: 500 }), false)).toBe(true);
  });
});
