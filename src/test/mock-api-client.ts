import { mock } from "bun:test";

/**
 * Bun's mock.module() replaces a module path globally for the whole test
 * process, not per-file -- if two test files each mock "@/api-client" with
 * their own partial factory, whichever one's factory is active when a page
 * component is evaluated wins for *everyone*, including files that need
 * different exports. One shared, comprehensive factory (configured per test
 * via this mutable state) avoids that collision entirely.
 */
type MutateHandlers = { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void };
type MutateFn = (payload: unknown, handlers: MutateHandlers) => void;

const noopMutate: MutateFn = () => {};

export const apiClientMockState = {
  nextPracticeScenario: null as unknown,
  cueOptions: [] as unknown[],
  submitAttempt: noopMutate,
  onboardingQuizQuestions: [] as unknown[],
  currentUser: null as unknown,
  submitOnboardingQuiz: noopMutate,
};

export function resetApiClientMockState() {
  apiClientMockState.nextPracticeScenario = null;
  apiClientMockState.cueOptions = [];
  apiClientMockState.submitAttempt = noopMutate;
  apiClientMockState.onboardingQuizQuestions = [];
  apiClientMockState.currentUser = null;
  apiClientMockState.submitOnboardingQuiz = noopMutate;
}

let installed = false;

/** Idempotent -- safe to call from every test file that needs @/api-client mocked. */
export function installApiClientMock() {
  if (installed) return;
  installed = true;
  mock.module("@/api-client", () => ({
    useGetNextPracticeScenario: () => ({
      data: apiClientMockState.nextPracticeScenario,
      isLoading: false,
      isError: false,
    }),
    useListCueOptions: () => ({ data: apiClientMockState.cueOptions, isLoading: false }),
    useSubmitAttempt: () => ({
      isPending: false,
      mutate: (payload: unknown, handlers: MutateHandlers) =>
        apiClientMockState.submitAttempt(payload, handlers),
    }),
    useGetOnboardingQuiz: () => ({
      data: apiClientMockState.onboardingQuizQuestions,
      isLoading: false,
    }),
    useGetCurrentUser: () => ({ data: apiClientMockState.currentUser }),
    useSubmitOnboardingQuiz: () => ({
      isPending: false,
      mutate: (payload: unknown, handlers: MutateHandlers) =>
        apiClientMockState.submitOnboardingQuiz(payload, handlers),
    }),
    getGetNextPracticeScenarioQueryKey: () => ["next-practice-scenario"],
    getGetDashboardQueryKey: () => ["dashboard"],
    getGetCurrentUserQueryKey: () => ["current-user"],
  }));
}
