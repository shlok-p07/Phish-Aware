import { mock } from "bun:test";

/**
 * The single chokepoint for every mock.module() call in this repo.
 *
 * Bun's mock.module() is process-global: it replaces a module's exports for
 * every importer in the whole test run, and it cannot be undone. Critically, it
 * does *not* re-bind imports that were already resolved -- a module that
 * imported the real thing before the mock landed keeps the real thing, and a
 * module imported afterwards gets the fake. So when two files each install
 * their own factory for the same path, which one wins is decided by test-file
 * import order, and the loser's tests silently read a fake they never seeded.
 * The symptom is the nastiest kind: every file passes on its own and some
 * unrelated third file's presence makes them fail in the full run.
 *
 * That is not hypothetical -- it is exactly how "@/db" broke here, with a
 * partial users-only fake and the comprehensive src/test/mock-mongo.ts both
 * claiming it, each with its own private `installed` flag so the second
 * claimant quietly no-opped instead of winning.
 *
 * Routing every install through this registry makes the invariant -- one
 * factory per module path, for the entire process -- enforced rather than
 * merely intended. A second, different owner is a hard error at install time
 * instead of a mystery failure later. An eslint no-restricted-syntax rule
 * keeps mock.module() out of every other file so the chokepoint can't be
 * bypassed; see eslint.config.mjs.
 */

export interface MockModuleRegistry {
  /**
   * Installs `factory` as the process-wide fake for `specifier`.
   *
   * Idempotent for a given `owner`, so every test file that needs a shared mock
   * can call its installer unconditionally. A different `owner` claiming the
   * same `specifier` throws, because that is the order-dependent bug above.
   *
   * `specifier` must be written the way the code under test resolves it (the
   * "@/..." alias for app modules) -- Bun resolves a relative specifier against
   * the file *calling* mock.module(), which is this one, not the installer's.
   *
   * `owner` is the installer's own module path, e.g. "@/test/mock-mongo".
   */
  installModuleMock(specifier: string, owner: string, factory: () => unknown): void;
  /** Which module installed the fake for `specifier`, if any. */
  mockOwner(specifier: string): string | undefined;
}

/**
 * Built over an injected `install` so the ownership rules can be tested against
 * a throwaway registry -- exercising the real singleton would mean really
 * replacing modules for the rest of the process, which is exactly the
 * irreversible thing this file exists to ration.
 */
export function createMockModuleRegistry(
  install: (specifier: string, factory: () => unknown) => void,
): MockModuleRegistry {
  /** Module specifier -> the id of the module that installed its fake. */
  const owners = new Map<string, string>();

  return {
    installModuleMock(specifier, owner, factory) {
      const existing = owners.get(specifier);
      if (existing === owner) return;
      if (existing !== undefined) {
        throw new Error(
          `Two different modules both mock "${specifier}": ${existing} installed it first, ` +
            `now ${owner} wants it too. Bun's mock.module() is process-global and the winner ` +
            `depends on test-file import order, so this would make tests pass alone and fail ` +
            `in the full run. Extend ${existing} to cover what ${owner} needs (give it mutable ` +
            `state the way @/test/mock-mongo does) and have both callers share it.`,
        );
      }
      owners.set(specifier, owner);
      install(specifier, factory);
    },
    mockOwner(specifier) {
      return owners.get(specifier);
    },
  };
}

const registry = createMockModuleRegistry((specifier, factory) => mock.module(specifier, factory));

export const installModuleMock = registry.installModuleMock;
export const mockOwner = registry.mockOwner;
