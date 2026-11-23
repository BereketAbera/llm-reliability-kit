import baseline from "../../../../eval/baseline.json";
import { PIPELINES, gate, runEval } from "@/lib/coach/eval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("pipeline") ?? "current";
  if (!PIPELINES.some((p) => p.key === key)) return Response.json({ error: "Unknown pipeline" }, { status: 400 });
  const started = performance.now();
  const report = runEval(key);
  const decision = gate(report, baseline);
  return Response.json(
    { report, decision, baseline: { score: baseline.score }, ranAt: new Date().toISOString(), ms: Math.round(performance.now() - started) },
    { headers: { "cache-control": "no-store" } },
  );
}
