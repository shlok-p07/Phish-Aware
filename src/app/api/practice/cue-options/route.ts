import { ListCueOptionsResponse } from "@/api-zod";
import { CUE_OPTIONS } from "@/server/cues";
import { json, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(async () => {
  return json(ListCueOptionsResponse.parse(CUE_OPTIONS));
});
