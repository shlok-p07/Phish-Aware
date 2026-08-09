import type { ObjectId } from "mongodb";
import { installModuleMock } from "@/test/mock-module-registry";

/**
 * The one fake for "@/server/session", shared by every route test that needs
 * one -- three files used to install their own partial factory for this path
 * (two of them overriding createSession differently), which is the same
 * order-dependent trap documented in @/test/mock-module-registry.
 *
 * Route handlers only need two things from this module: a session to come back
 * from createSession(), and an identity to come back from getUserIdFromRequest().
 * Both are driven by mutable state here so each test file can set what it needs.
 * Everything else passes through to the real module -- the cookie plumbing is
 * next/headers' problem and is covered by src/server/session.ts's own tests.
 */

export const FAKE_SESSION_TOKEN = "test-session-token";

export const fakeSessionState = {
  /** Who getUserIdFromRequest() reports; null means "not signed in". */
  userId: null as ObjectId | null,
  /** How many times the route asked for a session to be created. */
  createdCount: 0,
};

export function resetFakeSessionState() {
  fakeSessionState.userId = null;
  fakeSessionState.createdCount = 0;
}

/** Idempotent -- safe to call from every test file that needs "@/server/session" faked. */
export async function installSessionMock() {
  const realSession = await import("@/server/session");
  installModuleMock("@/server/session", "@/test/mock-session", () => ({
    ...realSession,
    createSession: async () => {
      fakeSessionState.createdCount += 1;
      return FAKE_SESSION_TOKEN;
    },
    getUserIdFromRequest: async () => fakeSessionState.userId,
  }));
}
