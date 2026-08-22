import { installModuleMock } from "@/test/mock-module-registry";

/**
 * A cookie jar standing in for next/headers' cookies().
 *
 * The real one throws outside a request scope, which is why session.ts had no
 * tests of its own -- and why the comment in @/test/mock-session claiming the
 * cookie plumbing was "covered by session.ts's own tests" was untrue. This is
 * the smallest jar those tests need: get, set, delete, and a way to inspect
 * what attributes a cookie was actually written with, since httpOnly and
 * sameSite are the whole point of a session cookie.
 */
export type RecordedCookie = {
  value: string;
  options: Record<string, unknown>;
};

export const fakeCookieState = {
  jar: new Map<string, RecordedCookie>(),
  deleted: [] as string[],
};

export function resetFakeCookieState() {
  fakeCookieState.jar = new Map();
  fakeCookieState.deleted = [];
}

/** Idempotent -- safe to call from every test file that needs next/headers faked. */
export async function installNextHeadersMock() {
  installModuleMock("next/headers", "@/test/mock-next-headers", () => ({
    cookies: async () => ({
      get: (name: string) => {
        const found = fakeCookieState.jar.get(name);
        return found ? { name, value: found.value } : undefined;
      },
      set: (name: string, value: string, options: Record<string, unknown> = {}) => {
        fakeCookieState.jar.set(name, { value, options });
      },
      delete: (name: string) => {
        fakeCookieState.jar.delete(name);
        fakeCookieState.deleted.push(name);
      },
    }),
  }));
}
