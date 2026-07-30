// Standalone seed runner. Invoked via `bun run db:seed` (see package.json).
// tsx loads this outside the Next.js runtime, so we load env from .env first.
import { seedIfEmpty } from "@/server/seed";
import { closeMongoClient } from "@/db";

async function main() {
  await seedIfEmpty();
  await closeMongoClient();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
