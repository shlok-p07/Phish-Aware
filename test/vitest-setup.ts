// Adds the jest-dom matchers (toBeInTheDocument, toHaveClass, ...) and tears
// down the rendered tree between tests. Under `bun test` the equivalent is
// done per-file with an explicit afterEach(cleanup); Vitest can do it once
// here for every component test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
