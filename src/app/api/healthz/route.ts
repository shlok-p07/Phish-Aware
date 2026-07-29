import { HealthCheckResponse } from "@/api-zod";
import { json, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(async () => {
  return json(HealthCheckResponse.parse({ status: "ok" }));
});
