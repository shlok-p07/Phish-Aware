import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ObjectId } from "mongodb";
import { getUserIdFromRequest } from "./session";
import { usersCollection, type UserDoc } from "@/db";

/** Thrown by requireUserId; caught by withErrorHandling to produce a 401. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Optional machine-readable code, included alongside `error` when set. */
    public code?: string,
  ) {
    super(message);
  }
}

/** Resolve the current user id or throw a 401. */
export async function requireUserId(): Promise<ObjectId> {
  const userId = await getUserIdFromRequest();
  if (userId === null) {
    throw new HttpError(401, "Not authenticated");
  }
  return userId;
}

/**
 * Resolve the current user id, or null when signed out.
 *
 * For endpoints that serve everyone but personalise for a signed-in caller --
 * the lesson library reads the same either way, it just cannot say which ones
 * you have finished.
 */
export async function optionalUserId(): Promise<ObjectId | null> {
  return getUserIdFromRequest();
}

/**
 * Resolve the current user and require them to be an admin of an org.
 * Throws 401 if unauthenticated, 403 if not an org admin.
 */
export async function requireOrgAdmin(): Promise<UserDoc & { orgId: ObjectId }> {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user || !user.orgId || user.role !== "admin") {
    throw new HttpError(403, "Admin access required");
  }
  return user as UserDoc & { orgId: ObjectId };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wrap a route handler so thrown HttpErrors and ZodErrors become clean JSON
 * responses (mirrors the Express error behavior).
 */
function isDatabaseUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  const message = err.message.toLowerCase();
  return (
    message.includes("mongodb_uri") ||
    message.includes("mongodb") ||
    message.includes("connect") ||
    message.includes("topology") ||
    message.includes("econnrefused") ||
    message.includes("timed out") ||
    message.includes("server selection")
  );
}

/**
 * Reads a JSON request body, turning an unparseable one into a 400.
 *
 * `req.json()` throws a SyntaxError on a malformed body, and an unhandled
 * SyntaxError falls through to the 500 branch below -- so a client sending bad
 * JSON was told the server had failed. That misreports whose fault it is, and it
 * buries a real outage among client noise in whatever watches the error rate.
 *
 * A body that parses but is the wrong shape is still the caller's problem too,
 * and is already handled: the Zod branch turns that into a 400 with details.
 */
export async function readJsonBody<T>(req: { json: () => Promise<unknown> }): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return err.code
          ? NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
          : error(err.status, err.message);
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.issues },
          { status: 400 },
        );
      }
      if (isDatabaseUnavailableError(err)) {
        console.error("Database unavailable during request", err);
        return error(503, "Database unavailable. Please try again later.");
      }
      console.error(err);
      return error(500, "Internal server error");
    }
  };
}
