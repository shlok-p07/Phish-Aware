import { mock } from "bun:test";

/**
 * Bun's mock.module() replaces a module path globally for the whole test
 * process, not per-file -- if multiple test files each mock "next/navigation"
 * with their own partial factory, whichever one's factory is active when a
 * page component is evaluated wins for *everyone*, including files that need
 * a different export (e.g. usePathname) the winning factory doesn't provide.
 * One shared, comprehensive factory (configured per test via this mutable
 * state) avoids that collision entirely -- see src/test/mock-api-client.ts
 * for the same pattern applied to "@/api-client".
 */
export const nextNavigationMockState = {
  pathname: "/",
  replace: (() => {}) as (href: string) => void,
  push: (() => {}) as (href: string) => void,
};

export function resetNextNavigationMockState() {
  nextNavigationMockState.pathname = "/";
  nextNavigationMockState.replace = () => {};
  nextNavigationMockState.push = () => {};
}

let installed = false;

/** Idempotent -- safe to call from every test file that needs "next/navigation" mocked. */
export function installNextNavigationMock() {
  if (installed) return;
  installed = true;
  mock.module("next/navigation", () => ({
    usePathname: () => nextNavigationMockState.pathname,
    useRouter: () => ({
      replace: (href: string) => nextNavigationMockState.replace(href),
      push: (href: string) => nextNavigationMockState.push(href),
    }),
  }));
}
