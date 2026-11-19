import { ListCueOptionsResponse } from "@/api-zod";
import { CUE_OPTIONS } from "@/server/cues";
import { json, parseResponse, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(async () => {
  return json(parseResponse(ListCueOptionsResponse, CUE_OPTIONS));
});
