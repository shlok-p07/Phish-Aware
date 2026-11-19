import { describe, expect, it } from "bun:test";
import * as z from "zod";
import { HttpError, parseResponse, readJsonBody, withErrorHandling } from "./http";

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

describe("request vs response validation", () => {
  const BodySchema = z.object({ name: z.string() });
  const ResponseSchema = z.object({ id: z.string() });

  it("answers 400 when the request fails its schema", async () => {
    const handler = withErrorHandling(async () => {
      BodySchema.parse({ name: 42 });
      return new Response(null);
    });

    const response = await handler();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid request" });
  });

  it("answers 500 when the server's own response fails its schema", async () => {
    // A server bug, so the client must not be told its request was invalid.
    const handler = withErrorHandling(async () => {
      parseResponse(ResponseSchema, { id: 7 });
      return new Response(null);
    });
    const logged = console.error;
    console.error = () => {};
    try {
      const response = await handler();
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
    } finally {
      console.error = logged;
    }
  });

  it("returns the parsed response, with unknown keys stripped, when it is valid", () => {
    expect(parseResponse(ResponseSchema, { id: "a", extra: true })).toEqual({ id: "a" });
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
