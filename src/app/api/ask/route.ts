import { answerQuestion } from "@/lib/coach/coach";
import { realSleep } from "@/lib/reliability/clock";
import { sseResponse } from "@/lib/reliability/sse-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION = 400;

function readOptions(source: { paraphrase?: unknown; guard?: unknown }) {
  return {
    paraphrase: source.paraphrase === true || source.paraphrase === "1" || source.paraphrase === "true",
    guard: !(source.guard === false || source.guard === "0" || source.guard === "false"),
  };
}

/** JSON for scripts and the eval runner: GET /api/ask?q=... */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const question = (url.searchParams.get("q") ?? "").slice(0, MAX_QUESTION).trim();
  if (!question) return Response.json({ error: "Pass a question as ?q=" }, { status: 400 });
  const options = readOptions({ paraphrase: url.searchParams.get("paraphrase") ?? undefined, guard: url.searchParams.get("guard") ?? undefined });
  return Response.json(answerQuestion(question, options), { headers: { "cache-control": "no-store" } });
}

/** Streams the answer over SSE: which path answered, the text in pieces, then the full answer. */
export async function POST(request: Request) {
  let body: { question?: unknown; paraphrase?: unknown; guard?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send JSON: { question }" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, MAX_QUESTION).trim() : "";
  if (!question) return Response.json({ error: "Question is empty" }, { status: 400 });
  const answer = answerQuestion(question, readOptions(body));

  return sseResponse(async (send, signal) => {
    send("route", { path: answer.path, bank: answer.bank, trace: answer.trace });
    const pieces = answer.text.match(/\S+\s*/g) ?? [];
    for (let i = 0; i < pieces.length; i += 3) {
      if (signal.aborted) return;
      send("delta", { text: pieces.slice(i, i + 3).join("") });
      await realSleep(22);
    }
    send("done", answer);
  }, request.signal);
}
