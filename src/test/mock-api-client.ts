import { installModuleMock } from "@/test/mock-module-registry";

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
  // Org / invitations / SSO
  org: null as unknown,
  createOrg: noopMutate,
  orgMembers: [] as unknown[],
  invitation: null as unknown,
  invitationError: null as unknown,
  invitationLoading: false,
  ssoConnection: null as unknown,
  acceptInvitation: noopMutate,
  inviteOrgMember: noopMutate,
  revokeOrgInvitation: noopMutate,
  getOrgInvitationLink: noopMutate,
  resendOrgInvitation: noopMutate,
  upsertOrgSsoConnection: noopMutate,
  testOrgSsoConnection: noopMutate,
  deleteOrgSsoConnection: noopMutate,
  discoverSso: noopMutate,
  login: noopMutate,
  signup: noopMutate,
  continueAsGuest: noopMutate,
  logout: noopMutate,
  sendChatbotMessage: noopMutate,
  requestPasswordReset: noopMutate,
  confirmPasswordReset: noopMutate,
};

export function resetApiClientMockState() {
  apiClientMockState.nextPracticeScenario = null;
  apiClientMockState.cueOptions = [];
  apiClientMockState.submitAttempt = noopMutate;
  apiClientMockState.onboardingQuizQuestions = [];
  apiClientMockState.currentUser = null;
  apiClientMockState.submitOnboardingQuiz = noopMutate;
  apiClientMockState.org = null;
  apiClientMockState.createOrg = noopMutate;
  apiClientMockState.orgMembers = [];
  apiClientMockState.invitation = null;
  apiClientMockState.invitationError = null;
  apiClientMockState.invitationLoading = false;
  apiClientMockState.ssoConnection = null;
  apiClientMockState.acceptInvitation = noopMutate;
  apiClientMockState.inviteOrgMember = noopMutate;
  apiClientMockState.revokeOrgInvitation = noopMutate;
  apiClientMockState.getOrgInvitationLink = noopMutate;
  apiClientMockState.resendOrgInvitation = noopMutate;
  apiClientMockState.upsertOrgSsoConnection = noopMutate;
  apiClientMockState.testOrgSsoConnection = noopMutate;
  apiClientMockState.deleteOrgSsoConnection = noopMutate;
  apiClientMockState.discoverSso = noopMutate;
  apiClientMockState.login = noopMutate;
  apiClientMockState.signup = noopMutate;
  apiClientMockState.continueAsGuest = noopMutate;
  apiClientMockState.logout = noopMutate;
  apiClientMockState.sendChatbotMessage = noopMutate;
  apiClientMockState.requestPasswordReset = noopMutate;
  apiClientMockState.confirmPasswordReset = noopMutate;
}

/** Orval shapes mutations as { isPending, mutate }; this keeps that uniform. */
function mutation(pick: () => MutateFn) {
  return () => ({
    isPending: false,
    mutate: (payload: unknown, handlers: MutateHandlers = {}) => pick()(payload, handlers),
  });
}

/** Idempotent -- safe to call from every test file that needs @/api-client mocked. */
export function installApiClientMock() {
  installModuleMock("@/api-client", "@/test/mock-api-client", () => ({
    useGetNextPracticeScenario: () => ({
      data: apiClientMockState.nextPracticeScenario,
      isLoading: false,
      isError: false,
    }),
    useListCueOptions: () => ({ data: apiClientMockState.cueOptions, isLoading: false }),
    useSubmitAttempt: mutation(() => apiClientMockState.submitAttempt),
    useGetOnboardingQuiz: () => ({
      data: apiClientMockState.onboardingQuizQuestions,
      isLoading: false,
    }),
    useGetCurrentUser: () => ({ data: apiClientMockState.currentUser }),
    useSubmitOnboardingQuiz: mutation(() => apiClientMockState.submitOnboardingQuiz),

    useGetOrg: () => ({ data: apiClientMockState.org }),
    useCreateOrg: mutation(() => apiClientMockState.createOrg),
    useListOrgMembers: () => ({ data: apiClientMockState.orgMembers }),
    useGetInvitation: () => ({
      data: apiClientMockState.invitation,
      isLoading: apiClientMockState.invitationLoading,
      error: apiClientMockState.invitationError,
    }),
    useGetOrgSsoConnection: () => ({ data: apiClientMockState.ssoConnection }),

    useAcceptInvitation: mutation(() => apiClientMockState.acceptInvitation),
    useInviteOrgMember: mutation(() => apiClientMockState.inviteOrgMember),
    useRemoveOrgMember: mutation(() => noopMutate),
    useUpdateOrgMemberRole: mutation(() => noopMutate),
    useRevokeOrgInvitation: mutation(() => apiClientMockState.revokeOrgInvitation),
    useGetOrgInvitationLink: mutation(() => apiClientMockState.getOrgInvitationLink),
    useResendOrgInvitation: mutation(() => apiClientMockState.resendOrgInvitation),
    useUpsertOrgSsoConnection: mutation(() => apiClientMockState.upsertOrgSsoConnection),
    useTestOrgSsoConnection: mutation(() => apiClientMockState.testOrgSsoConnection),
    useDeleteOrgSsoConnection: mutation(() => apiClientMockState.deleteOrgSsoConnection),
    useDiscoverSso: mutation(() => apiClientMockState.discoverSso),

    useLogin: mutation(() => apiClientMockState.login),
    useSignup: mutation(() => apiClientMockState.signup),
    useContinueAsGuest: mutation(() => apiClientMockState.continueAsGuest),
    useLogout: mutation(() => apiClientMockState.logout),
    useSendChatbotMessage: mutation(() => apiClientMockState.sendChatbotMessage),
    useRequestPasswordReset: mutation(() => apiClientMockState.requestPasswordReset),
    useConfirmPasswordReset: mutation(() => apiClientMockState.confirmPasswordReset),

    getGetNextPracticeScenarioQueryKey: () => ["next-practice-scenario"],
    getGetDashboardQueryKey: () => ["dashboard"],
    getGetCurrentUserQueryKey: () => ["current-user"],
    getListOrgMembersQueryKey: () => ["org-members"],
    getGetOrgQueryKey: () => ["org"],
    getGetOrgSsoConnectionQueryKey: () => ["org-sso"],
  }));
}
