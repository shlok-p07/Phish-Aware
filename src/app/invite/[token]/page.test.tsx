import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  installApiClientMock,
  apiClientMockState,
  resetApiClientMockState,
} from "@/test/mock-api-client";
import { installNextNavigationMock } from "@/test/mock-next-navigation";

installApiClientMock();
installNextNavigationMock();

const { InviteContent } = await import("./invite-content");

const PENDING_INVITATION = {
  orgName: "Acme Corp",
  email: "alice@acme.com",
  role: "employee" as const,
  department: null,
  expiresAt: "2026-08-14T12:00:00.000Z",
  ssoAvailable: false,
  ssoStartUrl: null,
  requiresExistingAccount: false,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InviteContent token="test-token" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetApiClientMockState();
});

afterEach(() => {
  cleanup();
});

describe("InviteContent", () => {
  it("shows the org name and the invited address", async () => {
    apiClientMockState.invitation = PENDING_INVITATION;
    renderPage();
    expect(await screen.findByText(/Join Acme Corp/i)).toBeDefined();
    expect(await screen.findByText("alice@acme.com")).toBeDefined();
  });

  it("offers the password form when the address has no existing account", async () => {
    apiClientMockState.invitation = PENDING_INVITATION;
    renderPage();
    expect(await screen.findByLabelText(/Your name/i)).toBeDefined();
    expect(await screen.findByLabelText(/^Password$/i)).toBeDefined();
    expect(await screen.findByRole("button", { name: /Join organization/i })).toBeDefined();
  });

  it("mentions admin access for an admin invitation", async () => {
    apiClientMockState.invitation = { ...PENDING_INVITATION, role: "admin" as const };
    renderPage();
    expect(await screen.findByText(/with admin access/i)).toBeDefined();
  });

  it("tells them the department their admin pinned, so the survey skipping it isn't a surprise", async () => {
    apiClientMockState.invitation = { ...PENDING_INVITATION, department: "Legal" };
    renderPage();
    expect(await screen.findByText("Legal")).toBeDefined();
    expect(await screen.findByText(/so we won't ask/i)).toBeDefined();
  });

  it("says nothing about a department when the admin left it open", async () => {
    apiClientMockState.invitation = PENDING_INVITATION;
    renderPage();
    expect(await screen.findByText(/Join Acme Corp/i)).toBeDefined();
    expect(screen.queryByText(/so we won't ask/i)).toBeNull();
  });

  it("leads with the SSO button when the org has a provider", async () => {
    apiClientMockState.invitation = {
      ...PENDING_INVITATION,
      ssoAvailable: true,
      ssoStartUrl: "/api/auth/sso/start?email=alice%40acme.com",
    };
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Continue with your company account/i }),
    ).toBeDefined();
  });

  it("replaces the password form with a sign-in prompt when an account already exists", async () => {
    apiClientMockState.invitation = { ...PENDING_INVITATION, requiresExistingAccount: true };
    renderPage();
    expect(await screen.findByText(/You already have a PhishAware account/i)).toBeDefined();
    expect(await screen.findByRole("link", { name: /Sign in/i })).toBeDefined();
    // The whole point of the guard: no way to set a password on someone else's address.
    expect(screen.queryByRole("button", { name: /Join organization/i })).toBeNull();
  });

  it("explains an expired or revoked invitation", async () => {
    apiClientMockState.invitation = null;
    apiClientMockState.invitationError = { status: 410 };
    renderPage();
    expect(await screen.findByText(/no longer valid/i)).toBeDefined();
    expect(await screen.findByText(/expired, been revoked, or already been used/i)).toBeDefined();
  });

  it("explains an unknown token", async () => {
    apiClientMockState.invitation = null;
    apiClientMockState.invitationError = { status: 404 };
    renderPage();
    expect(await screen.findByText(/Invitation not found/i)).toBeDefined();
  });

  it("shows a loading state while the lookup is in flight", async () => {
    apiClientMockState.invitation = null;
    apiClientMockState.invitationLoading = true;
    renderPage();
    expect(await screen.findByText(/Checking your invitation/i)).toBeDefined();
  });
});
