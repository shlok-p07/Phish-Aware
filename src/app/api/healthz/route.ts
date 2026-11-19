import { HealthCheckResponse } from "@/api-zod";
import { json, parseResponse, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(async () => {
  return json(parseResponse(HealthCheckResponse, { status: "ok" }));
});
