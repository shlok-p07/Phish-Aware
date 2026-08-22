import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  installApiClientMock,
  apiClientMockState,
  resetApiClientMockState,
} from "@/test/mock-api-client";
import { installNextNavigationMock } from "@/test/mock-next-navigation";

installApiClientMock();
installNextNavigationMock();

// The auth card animates its height between tabs via ResizeObserver, which
// happy-dom doesn't implement.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;

const { default: AuthPage } = await import("./page");

/** Where window.location.href was pointed, instead of actually navigating. */
let navigatedTo: string | null = null;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthPage />
    </QueryClientProvider>,
  );
}

/**
 * Both tab panels stay mounted (the inactive one is only visually hidden, so
 * the card can animate its height), so every query has to be scoped to the
 * login form or it matches the signup fields too.
 */
function loginForm() {
  return within(screen.getByRole("form", { name: "Log in" }));
}

function typeEmail(value: string) {
  const input = loginForm().getByPlaceholderText("you@example.com");
  fireEvent.change(input, { target: { value } });
  return input;
}

function clickPrimary() {
  fireEvent.click(loginForm().getByRole("button", { name: /^(Continue|Log in)$/ }));
}

beforeEach(() => {
  resetApiClientMockState();
  navigatedTo = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      search: "",
      pathname: "/auth",
      set href(v: string) {
        navigatedTo = v;
      },
      get href() {
        return navigatedTo ?? "http://localhost/auth";
      },
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("AuthPage: identifier-first sign in", () => {
  it("asks for an email first, with no password field visible", () => {
    renderPage();
    expect(loginForm().getByPlaceholderText("you@example.com")).toBeDefined();
    expect(loginForm().getByRole("button", { name: "Continue" })).toBeDefined();
    // The password input stays mounted for password managers, but hidden.
    const password = loginForm().getByPlaceholderText("••••••••");
    expect(password.closest("div.hidden")).not.toBeNull();
  });

  it("redirects to the identity provider when the domain has SSO", async () => {
    apiClientMockState.discoverSso = (_payload, handlers) =>
      handlers.onSuccess?.({
        ssoAvailable: true,
        orgName: "Acme Corp",
        providerKind: "auth0",
        startUrl: "/api/auth/sso/start?email=alice%40acme.test",
      });

    renderPage();
    typeEmail("alice@acme.test");
    clickPrimary();

    await waitFor(() => {
      expect(navigatedTo).toBe("/api/auth/sso/start?email=alice%40acme.test");
    });
  });

  it("reveals the password field when the domain has no SSO", async () => {
    apiClientMockState.discoverSso = (_payload, handlers) =>
      handlers.onSuccess?.({ ssoAvailable: false });

    renderPage();
    typeEmail("someone@gmail.com");
    clickPrimary();

    await waitFor(() => {
      expect(loginForm().getByRole("button", { name: "Log in" })).toBeDefined();
    });
    const password = loginForm().getByPlaceholderText("••••••••");
    expect(password.closest("div.hidden")).toBeNull();
    expect(navigatedTo).toBeNull();
  });

  it("still offers a password when the discovery lookup fails", async () => {
    // Discovery is a convenience, not a gate -- a network blip must not lock
    // people out of password sign-in.
    apiClientMockState.discoverSso = (_payload, handlers) =>
      handlers.onError?.(new Error("network down"));

    renderPage();
    typeEmail("someone@gmail.com");
    clickPrimary();

    await waitFor(() => {
      expect(loginForm().getByRole("button", { name: "Log in" })).toBeDefined();
    });
  });

  it("does not call discovery for an invalid email", async () => {
    // Two layers stop this: the input is type="email", so the browser's own
    // constraint validation blocks the submit, and onContinue re-checks with
    // zod before firing the request. Either way no lookup goes out and we stay
    // on the email step.
    let called = false;
    apiClientMockState.discoverSso = () => {
      called = true;
    };

    renderPage();
    typeEmail("not-an-email");
    clickPrimary();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(called).toBe(false);
    expect(loginForm().getByRole("button", { name: "Continue" })).toBeDefined();
    expect(navigatedTo).toBeNull();
  });

  it("lets you skip straight to a password", async () => {
    renderPage();
    fireEvent.click(loginForm().getByRole("button", { name: /Use a password instead/i }));
    await waitFor(() => {
      expect(loginForm().getByRole("button", { name: "Log in" })).toBeDefined();
    });
  });

  it("shows an unlock banner instead of a toast when the account is locked out", async () => {
    // A lockout is an instruction, not a retryable failure -- the password box
    // is cleared and the only useful next action is put on screen.
    apiClientMockState.discoverSso = (_payload, handlers) =>
      handlers.onSuccess?.({ ssoAvailable: false });
    apiClientMockState.login = (_payload, handlers) =>
      handlers.onError?.(
        Object.assign(new Error("HTTP 423 Locked"), {
          data: { error: "Too many failed sign-in attempts.", code: "ACCOUNT_LOCKED" },
        }),
      );

    renderPage();
    typeEmail("someone@gmail.com");
    clickPrimary();
    await waitFor(() => loginForm().getByRole("button", { name: "Log in" }));

    const password = loginForm().getByPlaceholderText("••••••••");
    fireEvent.change(password, { target: { value: "wrong" } });
    clickPrimary();

    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("Account locked")).toBeDefined();
    expect(within(banner).getByRole("button", { name: /Reset your password/i })).toBeDefined();
    expect((password as HTMLInputElement).value).toBe("");
  });

  it("labels the post-lock reset requirement differently from a live lock", async () => {
    apiClientMockState.login = (_payload, handlers) =>
      handlers.onError?.(
        Object.assign(new Error("HTTP 403 Forbidden"), {
          data: { error: "Reset your password to sign in again.", code: "PASSWORD_RESET_REQUIRED" },
        }),
      );

    renderPage();
    typeEmail("someone@gmail.com");
    // Editing the address bounces back to the email step, so the skip has to
    // come after it, not before.
    fireEvent.click(loginForm().getByRole("button", { name: /Use a password instead/i }));
    await waitFor(() => loginForm().getByRole("button", { name: "Log in" }));

    fireEvent.change(loginForm().getByPlaceholderText("••••••••"), { target: { value: "pw" } });
    clickPrimary();

    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("Password reset required")).toBeDefined();
  });

  it("clears the lockout banner once the address is changed", async () => {
    apiClientMockState.login = (_payload, handlers) =>
      handlers.onError?.(
        Object.assign(new Error("HTTP 423 Locked"), {
          data: { error: "Too many failed sign-in attempts.", code: "ACCOUNT_LOCKED" },
        }),
      );

    renderPage();
    typeEmail("someone@gmail.com");
    // Editing the address bounces back to the email step, so the skip has to
    // come after it, not before.
    fireEvent.click(loginForm().getByRole("button", { name: /Use a password instead/i }));
    await waitFor(() => loginForm().getByRole("button", { name: "Log in" }));

    fireEvent.change(loginForm().getByPlaceholderText("••••••••"), { target: { value: "pw" } });
    clickPrimary();
    await screen.findByRole("alert");

    // The banner was about the previous address, so it can't survive an edit.
    typeEmail("other@gmail.com");
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("returns to the email step when the address is edited", async () => {
    apiClientMockState.discoverSso = (_payload, handlers) =>
      handlers.onSuccess?.({ ssoAvailable: false });

    renderPage();
    typeEmail("someone@gmail.com");
    clickPrimary();
    await waitFor(() => loginForm().getByRole("button", { name: "Log in" }));

    // A different address may well resolve differently, so the lookup has to
    // run again rather than reusing the previous answer.
    typeEmail("alice@acme.test");
    await waitFor(() => {
      expect(loginForm().getByRole("button", { name: "Continue" })).toBeDefined();
    });
  });
});
