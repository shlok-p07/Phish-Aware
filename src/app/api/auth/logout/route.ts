import { destroySession } from "@/server/session";
import { withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async () => {
  await destroySession();
  return new Response(null, { status: 204 });
});
