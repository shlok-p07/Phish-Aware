import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * Vitest covers the DOM-rendering component tests. Everything else -- domain
 * logic, API route handlers, pure helpers -- stays on `bun test`, which runs
 * them in about two seconds and needs no DOM.
 *
 * The split is by file extension, not by directory, so it is visible at a
 * glance which runner owns a file:
 *
 *   *.vitest.tsx   -> Vitest   (component rendering, `bun run test:ui`)
 *   *.test.ts(x)   -> bun test (logic and routes, `bun run test`)
 *
 * Bun's default test globs are *.test.*, *_test.*, *.spec.* and *_spec.*, so
 * a ".vitest." file is invisible to it and nothing runs twice.
 *
 * Why these files and not all of them: six UI tests drive shared mock helpers
 * built on Bun's mock.module(), which replaces a module globally at call time.
 * Vitest's vi.mock() is hoisted to the top of the *test file* by its transform
 * and cannot be invoked from a helper in another module, so those six need
 * their mocking restructured (config-level aliasing) before they can move.
 * They remain on bun test and pass there.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.vitest.{ts,tsx}"],
    setupFiles: ["./test/vitest-setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // Report against the components these tests actually exercise, rather
      // than the whole repo, so the number means something.
      include: ["src/components/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "**/*.test.*", "**/*.vitest.*"],
    },
  },
});
