import { z } from "zod";
import type { SurveyFeatures } from "@/lib/onboarding-survey";

const AwarenessPredictionResponse = z.object({
  awareness_score: z.number().min(0).max(1),
  model_version: z.string().min(1),
}).strict();

export type AwarenessPrediction = z.infer<typeof AwarenessPredictionResponse>;

export class MlServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MlServiceError";
  }
}

export async function predictAwareness(
  features: SurveyFeatures,
  diagnosticAccuracy: number,
): Promise<AwarenessPrediction> {
  const configuredUrl = process.env.ML_SERVICE_URL?.trim();
  if (!configuredUrl) {
    throw new MlServiceError("ML_SERVICE_URL is not configured");
  }
  const configuredTimeout = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? "60000");
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 60_000;
  const url = `${configuredUrl.replace(/\/+$/, "")}/predictions/awareness`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...features, diagnostic_accuracy: diagnosticAccuracy }),
      // The first request verifies and loads a ~515 MB model. Later requests
      // reuse the cached predictor and are substantially faster.
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (cause) {
    throw new MlServiceError("Awareness model service could not be reached", undefined, {
      cause,
    });
  }
  if (!response.ok) {
    throw new MlServiceError(
      `Awareness model service returned HTTP ${response.status}`,
      response.status,
    );
  }
  const parsed = AwarenessPredictionResponse.safeParse(await response.json());
  if (!parsed.success) {
    throw new MlServiceError("Awareness model service returned an invalid response");
  }
  return parsed.data;
}
