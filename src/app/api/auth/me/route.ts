import { usersCollection } from "@/db";
import { GetCurrentUserResponse } from "@/api-zod";
import { toUserDto } from "@/server/dto";
import { workspaceForMember } from "@/server/orgWorkspace";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) {
    return error(401, "Not authenticated");
  }
  // Carried alongside identity rather than fetched separately: the app shell
  // already awaits this request, so an organisation's branding arrives with the
  // first render instead of flashing in afterwards on every page load.
  const workspace = await workspaceForMember(user.orgId ?? null);
  return json(GetCurrentUserResponse.parse({ ...toUserDto(user), workspace }));
});
