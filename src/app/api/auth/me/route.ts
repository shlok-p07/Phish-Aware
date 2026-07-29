import { usersCollection } from "@/db";
import { GetCurrentUserResponse } from "@/api-zod";
import { toUserDto } from "@/server/dto";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) {
    return error(401, "Not authenticated");
  }
  return json(GetCurrentUserResponse.parse(toUserDto(user)));
});
