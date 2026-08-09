import { describe, expect, it } from "bun:test";
import { createMockModuleRegistry } from "@/test/mock-module-registry";

/**
 * Guards the guard. These run against throwaway registries rather than the
 * process-wide singleton -- installing through that one would really replace
 * modules for the rest of the test run, which is the irreversible thing the
 * registry exists to ration.
 */
function trackingRegistry() {
  const installs: string[] = [];
  const registry = createMockModuleRegistry((specifier) => {
    installs.push(specifier);
  });
  return { ...registry, installs };
}

const FACTORY = () => ({});

describe("mock module registry", () => {
  it("installs the first claim on a path", () => {
    const { installModuleMock, installs } = trackingRegistry();
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);
    expect(installs).toEqual(["@/db"]);
  });

  it("is idempotent for the same owner, so every test file can call its installer", () => {
    const { installModuleMock, installs } = trackingRegistry();
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);

    // Re-installing would swap the factory out from under modules that already
    // bound to the first one, so the repeat claims have to be no-ops.
    expect(installs).toEqual(["@/db"]);
  });

  it("refuses a second owner on the same path -- the order-dependent bug this exists to stop", () => {
    const { installModuleMock, installs } = trackingRegistry();
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);

    expect(() => installModuleMock("@/db", "@/test/mock-users-collection", FACTORY)).toThrow(
      /Two different modules both mock "@\/db"/,
    );
    // The loser must not have been installed -- throwing after replacing the
    // module would leave exactly the corruption the error is warning about.
    expect(installs).toEqual(["@/db"]);
  });

  it("names both owners in the error, since the fix is to merge them", () => {
    const { installModuleMock } = trackingRegistry();
    installModuleMock("@/server/session", "@/test/mock-session", FACTORY);

    expect(() => installModuleMock("@/server/session", "@/app/api/auth/login/route.test", FACTORY))
      .toThrow(/@\/test\/mock-session installed it first, now @\/app\/api\/auth\/login\/route\.test/);
  });

  it("keeps different paths independent", () => {
    const { installModuleMock, installs, mockOwner } = trackingRegistry();
    installModuleMock("@/db", "@/test/mock-mongo", FACTORY);
    installModuleMock("@/server/session", "@/test/mock-session", FACTORY);

    expect(installs).toEqual(["@/db", "@/server/session"]);
    expect(mockOwner("@/db")).toBe("@/test/mock-mongo");
    expect(mockOwner("@/server/session")).toBe("@/test/mock-session");
    expect(mockOwner("next/navigation")).toBeUndefined();
  });
});
