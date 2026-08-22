import { installModuleMock } from "@/test/mock-module-registry";

/**
 * The one fake for "@/server/scenarioGenerator", shared by every test that must
 * not reach a provider.
 *
 * Two files installed their own and the registry rejected it, which is exactly
 * what it is for: Bun's mock.module() is process-global, so whichever file
 * imported first would have won and both would have passed alone while one
 * failed in the full run.
 *
 * Driven by mutable state because the interesting cases are what happens when
 * generation succeeds, returns nothing, or throws -- and, for the pool's
 * in-flight guard, what happens while a call is still outstanding.
 */
export const fakeGeneratorState = {
  /** How many times generation was asked for. */
  calls: 0,
  /** What a successful call returns. null models "no content produced". */
  result: null as Record<string, unknown> | null,
  /** When true, generation rejects. */
  throws: false,
  /**
   * When set, generation parks until released, so a test can observe what
   * happens while a call is still in flight. Assigned the resolver once parked.
   */
  gate: null as null | (() => void),
};

export function resetFakeGeneratorState() {
  fakeGeneratorState.calls = 0;
  fakeGeneratorState.result = null;
  fakeGeneratorState.throws = false;
  fakeGeneratorState.gate = null;
}

/** Idempotent -- safe to call from every test file that needs the generator faked. */
export async function installScenarioGeneratorMock() {
  installModuleMock("@/server/scenarioGenerator", "@/test/mock-scenario-generator", () => ({
    generatePhishingScenario: async () => {
      fakeGeneratorState.calls += 1;
      if (fakeGeneratorState.gate) {
        await new Promise<void>((resolve) => {
          fakeGeneratorState.gate = resolve;
        });
      }
      if (fakeGeneratorState.throws) throw new Error("both providers exhausted");
      return fakeGeneratorState.result;
    },
  }));
}
