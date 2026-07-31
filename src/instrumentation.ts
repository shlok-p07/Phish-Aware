/**
 * Next.js instrumentation hook: register() runs once when the server
 * process starts (next dev/start, including the Docker/Render standalone
 * server), never during `next build`. Provisioning the database here means
 * nobody -- teammate, CI, or Render -- ever has to run `bun run db:init`/
 * `db:seed` by hand: schema validators, indexes, and seed data are applied
 * automatically against whatever MONGODB_URI the environment provides.
 *
 * Failures are logged, not thrown: the app already degrades to a 503 on
 * Mongo-unavailable errors (see src/server/http.ts), so a slow/unreachable
 * Atlas cluster at boot shouldn't crash the whole server process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.MONGODB_URI) return;

  try {
    const { getDb } = await import("@/db");
    const { provisionDatabase } = await import("@/db/provision");
    const { seedIfEmpty } = await import("@/server/seed");

    const db = await getDb();
    await provisionDatabase(db);
    await seedIfEmpty();
    console.log("[instrumentation] database schema, indexes, and seed data are up to date.");
  } catch (err) {
    console.error("[instrumentation] database provisioning failed:", err);
  }
}
