import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserIdFromRequest } from "./session";

/** Thrown by requireUserId; caught by withErrorHandling to produce a 401. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve the current user id or throw a 401. */
export async function requireUserId(): Promise<number> {
  const userId = await getUserIdFromRequest();
  if (userId === null) {
    throw new HttpError(401, "Not authenticated");
  }
  return userId;
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
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return error(err.status, err.message);
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.issues },
          { status: 400 },
        );
      }
      console.error(err);
      return error(500, "Internal server error");
    }
  };
}
