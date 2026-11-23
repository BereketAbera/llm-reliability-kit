import { realSleep } from "../reliability/clock";
import { sseResponse } from "../reliability/sse-response";
import { answerQuestion, type CoachOptions } from "./coach";

export const MAX_QUESTION = 400;

export type AskInput = { ok: true; question: string; pick?: string; paraphrase: boolean } | { ok: false; status: 400; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates a POST body. `allowDemoKnobs` is true only on the demo route, where the
 * page can simulate a model that rewrites lines. The verbatim guard is never optional.
 */
export function readAskBody(body: unknown, allowDemoKnobs: boolean): AskInput {
  if (!isRecord(body)) return { ok: false, status: 400, error: "Send JSON: { question }" };
  if (typeof body.question !== "string") return { ok: false, status: 400, error: "question must be a non-empty string" };
  const question = body.question.slice(0, MAX_QUESTION).trim();
  if (!question) return { ok: false, status: 400, error: "question must be a non-empty string" };
  if (body.pick !== undefined && (typeof body.pick !== "string" || !/^[A-Z0-9]+-\d+\.\d+$/.test(body.pick))) {
    return { ok: false, status: 400, error: "pick must be a line ID such as OPN-3.2" };
  }
  return { ok: true, question, pick: body.pick as string | undefined, paraphrase: allowDemoKnobs && body.paraphrase === true };
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

/** Streams the answer over SSE: which path answered, the text in pieces, then the full answer. */
export function streamAnswer(input: Extract<AskInput, { ok: true }>, signal: AbortSignal): Response {
  const options: CoachOptions = { guard: true, paraphrase: input.paraphrase, pick: input.pick };
  const answer = answerQuestion(input.question, options);
  return sseResponse(async (send, aborted) => {
    send("route", { path: answer.path, bank: answer.bank, trace: answer.trace });
    const pieces = answer.text.match(/\S+\s*/g) ?? [];
    for (let i = 0; i < pieces.length; i += 3) {
      if (aborted.aborted) return;
      send("delta", { text: pieces.slice(i, i + 3).join("") });
      await realSleep(22);
    }
    send("done", answer);
  }, signal);
}

export async function handleAskPost(request: Request, allowDemoKnobs: boolean): Promise<Response> {
  const json = await readJson(request);
  if (!json.ok) return Response.json({ error: "Send JSON: { question }" }, { status: 400 });
  const input = readAskBody(json.body, allowDemoKnobs);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  return streamAnswer(input, request.signal);
}
