import baseline from "../../../../eval/baseline.json";
import { PIPELINES, gate, runAllSets } from "@/lib/coach/eval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the 30 questions, the held-out phrasings and the decline set through the coach code, then applies the gate. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("pipeline") ?? "current";
  if (!PIPELINES.some((p) => p.key === key)) return Response.json({ error: "Unknown pipeline" }, { status: 400 });
  const started = performance.now();
  const run = runAllSets(key);
  const decision = gate(run, baseline);
  return Response.json(
    { run, decision, baseline: { score: baseline.score, wrongLines: baseline.wrongLines }, ranAt: new Date().toISOString(), ms: Math.round(performance.now() - started) },
    { headers: { "cache-control": "no-store" } },
  );
}
