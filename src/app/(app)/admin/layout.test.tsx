import { describe, expect, it } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installNextNavigationMock, nextNavigationMockState } from "@/test/mock-next-navigation";

/**
 * Regression test: a user with no org visiting /admin/create should hit
 * GET /api/org a handful of times at most, not in an unbounded loop. Mounts
 * the real AdminLayout wrapping the real CreateOrgPage against a real
 * QueryClient (only the network layer is faked) -- a stub child wouldn't
 * catch this, since the bug only reproduced with both components mounted
 * together sharing one query key.
 *
 * Note: src/test/mock-api-client.ts mocks "@/api-client" for other test
 * files, and Bun's mock.module can't be reverted once set. Every hook this
 * file's components use has to stay present in that shared mock so this
 * test can't crash if it loses that race, even though it should be getting
 * the real module.
 */

installNextNavigationMock();
nextNavigationMockState.pathname = "/admin/create";

let fetchCallsByUrl: Record<string, number> = {};

const originalFetch = global.fetch;

function installFetchMock() {
  fetchCallsByUrl = {};
  // @ts-expect-error -- simplified fetch signature for this test
  global.fetch = async (input: string) => {
    const url = typeof input === "string" ? input : String(input);
    fetchCallsByUrl[url] = (fetchCallsByUrl[url] ?? 0) + 1;

    if (url.includes("/api/auth/me")) {
      return new Response(
        JSON.stringify({
          id: "u1",
          name: "Test User",
          role: "employee",
          hasOrg: false,
          email: "t@example.com",
          isGuest: false,
          level: "beginner",
          xp: 0,
          streak: 0,
          badges: [],
          calibrationScore: 0,
          department: null,
          workType: null,
          onboardingCompleted: true,
          createdAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/org")) {
      return new Response(JSON.stringify({ error: "You don't belong to an organization yet" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 404 });
  };
}

describe("AdminLayout at /admin/create", () => {
  it("fetches GET /api/org a bounded number of times for a user with no org, not in an unbounded loop", async () => {
    installFetchMock();
    const { default: AdminLayout } = await import("./layout");
    const { default: CreateOrgPage } = await import("./create/page");
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AdminLayout>
          <CreateOrgPage />
        </AdminLayout>
      </QueryClientProvider>,
    );

    // Give react-query time to settle, and time for a runaway loop (if one
    // exists) to reveal itself before asserting.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const orgCalls = Object.entries(fetchCallsByUrl).find(([url]) => url.includes("/api/org"))?.[1] ?? 0;
    expect(orgCalls).toBeLessThanOrEqual(2);

    cleanup();
    global.fetch = originalFetch;
  });
});
