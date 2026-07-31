import { describe, expect, it } from "bun:test";
import { withErrorHandling } from "./http";

describe("withErrorHandling", () => {
  it("returns a 503 for database connection/configuration errors", async () => {
    const handler = withErrorHandling(async () => {
      throw new Error("MONGODB_URI must be set. Did you forget to provision a database?");
    });

    const response = await handler();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("Database unavailable"),
    });
  });
});
