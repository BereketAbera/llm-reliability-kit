import { describe, expect, it } from "vitest";
import { getLine } from "@/lib/content/catalog";
import { HARSH_ERROR } from "@/lib/reliability/clients";
import { readSSE } from "@/lib/reliability/sse";
import { GET as askGet, POST as askPost } from "./ask/route";
import { GET as burstGet } from "./burst/route";
import { POST as demoAskPost } from "./demo/ask/route";
import { GET as evalGet } from "./eval/route";

async function events(response: Response) {
  const out: Array<{ event: string; data: unknown }> = [];
  for await (const message of readSSE(response.body!)) out.push({ event: message.event, data: JSON.parse(message.data) });
  return out;
}

const post = (handler: (request: Request) => Promise<Response> | Response, body: string) =>
  handler(new Request("http://test/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body }));

describe("HTTP routes", () => {
  it("GET /api/ask returns the answer as JSON", async () => {
    const response = await askGet(new Request("http://test/api/ask?q=They%20say%20our%20price%20is%20too%20high"));
    const answer = (await response.json()) as { path: string; text: string };
    expect(answer.path).toBe("answer-bank");
    expect(answer.text).toBe(getLine("OBJ-1.2").line.text);
  });

  it("GET /api/ask keeps the verbatim guard on whatever the caller asks for", async () => {
    const q = encodeURIComponent("What should I say when I get their voicemail?");
    const response = await askGet(new Request(`http://test/api/ask?q=${q}&paraphrase=1&guard=0`));
    const answer = (await response.json()) as { text: string; guard: { checked: boolean } };
    expect(answer.text).toBe(getLine("OPN-3.2").line.text);
    expect(answer.guard.checked).toBe(true);
  });

  it("POST /api/ask streams route, pieces and the final answer over SSE", async () => {
    const response = await post(askPost, JSON.stringify({ question: "What should I say when I get their voicemail?" }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await events(response);
    expect(stream[0]).toMatchObject({ event: "route", data: { path: "retrieval" } });
    const text = stream.filter((e) => e.event === "delta").map((e) => (e.data as { text: string }).text).join("");
    expect(text).toBe(getLine("OPN-3.2").line.text);
    expect(stream.at(-1)?.event).toBe("done");
  });

  it("POST /api/ask answers with the line the rep picked", async () => {
    const stream = await events(await post(askPost, JSON.stringify({ question: "How do I close a sale?", pick: "CLS-5.2" })));
    expect(stream.at(-1)).toMatchObject({ event: "done", data: { path: "retrieval", chosen: true, quote: { lineId: "CLS-5.2" } } });
  });

  it("rejects bad bodies with a 400 and a clear message", async () => {
    const cases: Array<[string, string]> = [
      ["null", "Send JSON: { question }"],
      ["[1,2]", "Send JSON: { question }"],
      ['"hello"', "Send JSON: { question }"],
      ["{bad", "Send JSON: { question }"],
      ['{"question":123}', "question must be a non-empty string"],
      ['{"question":" "}', "question must be a non-empty string"],
      ['{"question":"hi","pick":"drop table"}', "pick must be a line ID such as OPN-3.2"],
    ];
    for (const [body, error] of cases) {
      const response = await post(askPost, body);
      expect(response.status, body).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
  });

  it("only the demo route can simulate a rewriting model, and the guard still catches it", async () => {
    const body = JSON.stringify({ question: "What should I say when I get their voicemail?", paraphrase: true });
    const plain = (await events(await post(askPost, body))).at(-1)?.data as { guard: { action: string } };
    expect(plain.guard.action).toBe("none");
    const demo = (await events(await post(demoAskPost, body))).at(-1)?.data as { text: string; guard: { action: string } };
    expect(demo.guard.action).toBe("restored-exact-line");
    expect(demo.text).toBe(getLine("OPN-3.2").line.text);
  });

  it("GET /api/burst ends a failed naive request with a clean SSE error event", async () => {
    const response = await burstGet(new Request("http://test/api/burst?variant=naive&speed=200"));
    const stream = await events(response);
    const errors = stream.filter((e) => e.event === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].data).toMatchObject({ type: "error", error: { code: "provider_error", providerStatus: 429, userMessage: HARSH_ERROR } });
    expect(stream.at(-1)).toMatchObject({ event: "summary", data: { summary: { succeeded: 2, failed: 1 } } });
  });

  it("GET /api/burst for the retry queue has no error events in the post's scenario", async () => {
    const response = await burstGet(new Request("http://test/api/burst?variant=resilient&speed=200"));
    const stream = await events(response);
    expect(stream.filter((e) => e.event === "error")).toHaveLength(0);
    expect(stream.at(-1)).toMatchObject({ event: "summary", data: { summary: { succeeded: 3, failed: 0 } } });
  });

  it("GET /api/eval scores all three sets and applies the gate", async () => {
    const response = await evalGet(new Request("http://test/api/eval?pipeline=current"));
    const data = (await response.json()) as { run: { suite: { score: number }; heldOut: { total: number }; decline: { total: number } }; decision: { publish: boolean; wrongLines: number } };
    expect(data.run.suite.score).toBe(28);
    expect(data.run.heldOut.total).toBeGreaterThan(0);
    expect(data.run.decline.total).toBeGreaterThan(0);
    expect(data.decision).toMatchObject({ publish: true, wrongLines: 0 });
  });
});
