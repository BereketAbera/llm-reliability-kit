import { SIMULATED_LABEL } from "@/lib/reliability/provider";
import { VARIANT_KEYS, runVariant, sanitizeParams, type ScenarioParams, type VariantKey } from "@/lib/reliability/scenario";
import { sseResponse } from "@/lib/reliability/sse-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs one variant of the burst on a virtual clock and streams every client
 * event as it happens (paced so a person can watch). Errors arrive as a clean
 * `event: error` with a code and a calm message, never as a broken stream.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const variantParam = url.searchParams.get("variant") as VariantKey | null;
  const variant: VariantKey = variantParam && VARIANT_KEYS.includes(variantParam) ? variantParam : "resilient";
  const raw: Partial<Record<keyof ScenarioParams, unknown>> = {};
  for (const key of ["concurrency", "promptTokens", "trimmedTokens", "maxOutputTokens", "tpm", "rpm", "otherTrafficTpm", "seed"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null) raw[key] = value;
  }
  const params = sanitizeParams(raw);
  const speed = Math.min(200, Math.max(2, Number(url.searchParams.get("speed")) || 12));

  return sseResponse(async (send, signal) => {
    send("scenario", { variant, params, speed, provider: SIMULATED_LABEL });
    const run = await runVariant(params, variant, {
      pace: 1 / speed,
      maxPauseMs: 900,
      signal,
      keepDeltas: false,
      onEvent: (event) => send(event.type, event),
    });
    send("summary", { variant, summary: run.summary, provider: run.provider, promptTokens: run.promptTokens });
  }, request.signal);
}
