import { describe, expect, it } from "bun:test";
import { HttpError, readJsonBody, withErrorHandling } from "./http";

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

describe("readJsonBody", () => {
  it("returns the parsed body when it is valid JSON", async () => {
    const body = await readJsonBody<{ a: number }>({ json: async () => ({ a: 1 }) });
    expect(body).toEqual({ a: 1 });
  });

  it("turns an unparseable body into a 400, not a 500", async () => {
    // req.json() throws a SyntaxError on a malformed body. Unhandled, that fell
    // through to the 500 branch, so a client sending bad JSON was told the
    // server had failed -- which misreports whose fault it is and buries real
    // outages among client noise in whatever watches the error rate.
    const handler = withErrorHandling(async () => {
      await readJsonBody({
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      });
      return new Response("unreachable");
    });

    const res = await handler();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body is not valid JSON" });
  });

  it("does not swallow an error the handler raises for its own reasons", async () => {
    const handler = withErrorHandling(async () => {
      throw new HttpError(409, "Already exists");
    });

    const res = await handler();

    expect(res.status).toBe(409);
  });
});
