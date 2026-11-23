import { MAX_QUESTION, handleAskPost } from "@/lib/coach/ask-request";
import { answerQuestion } from "@/lib/coach/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * JSON for scripts and the eval runner: GET /api/ask?q=... (optional &pick=LINE-ID).
 * The verbatim guard is always on here; there are no knobs to turn it off.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const question = (url.searchParams.get("q") ?? "").slice(0, MAX_QUESTION).trim();
  if (!question) return Response.json({ error: "Pass a question as ?q=" }, { status: 400 });
  const pick = url.searchParams.get("pick") ?? undefined;
  if (pick !== undefined && !/^[A-Z0-9]+-\d+\.\d+$/.test(pick)) return Response.json({ error: "pick must be a line ID such as OPN-3.2" }, { status: 400 });
  return Response.json(answerQuestion(question, { guard: true, pick }), { headers: { "cache-control": "no-store" } });
}

/** Streams the answer over SSE. Body: { question, pick? }. */
export function POST(request: Request) {
  return handleAskPost(request, false);
}
