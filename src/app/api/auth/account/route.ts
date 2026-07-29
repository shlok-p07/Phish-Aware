import { deleteAccount } from "@/server/session";
import { requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/** Permanently delete the authenticated user's account and all their data. */
export const DELETE = withErrorHandling(async () => {
  const userId = await requireUserId();
  await deleteAccount(userId);
  return new Response(null, { status: 204 });
});
