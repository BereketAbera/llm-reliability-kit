import { describe, expect, it } from "vitest";
import { getLine } from "@/lib/content/catalog";
import { HARSH_ERROR } from "@/lib/reliability/clients";
import { readSSE } from "@/lib/reliability/sse";
import { GET as askGet, POST as askPost } from "./ask/route";
import { GET as burstGet } from "./burst/route";
import { GET as evalGet } from "./eval/route";

async function events(response: Response) {
  const out: Array<{ event: string; data: unknown }> = [];
  for await (const message of readSSE(response.body!)) out.push({ event: message.event, data: JSON.parse(message.data) });
  return out;
}

describe("HTTP routes", () => {
  it("GET /api/ask returns the answer as JSON", async () => {
    const response = await askGet(new Request("http://test/api/ask?q=They%20say%20our%20price%20is%20too%20high"));
    const answer = (await response.json()) as { path: string; text: string };
    expect(answer.path).toBe("answer-bank");
    expect(answer.text).toBe(getLine("OBJ-1.2").line.text);
  });

  it("POST /api/ask streams route, pieces and the final answer over SSE", async () => {
    const response = await askPost(
      new Request("http://test/api/ask", { method: "POST", body: JSON.stringify({ question: "What should I say when I get their voicemail?" }) }),
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await events(response);
    expect(stream[0]).toMatchObject({ event: "route", data: { path: "retrieval" } });
    const text = stream.filter((e) => e.event === "delta").map((e) => (e.data as { text: string }).text).join("");
    expect(text).toBe(getLine("OPN-3.2").line.text);
    expect(stream.at(-1)?.event).toBe("done");
  });

  it("rejects an empty question", async () => {
    const response = await askPost(new Request("http://test/api/ask", { method: "POST", body: JSON.stringify({ question: " " }) }));
    expect(response.status).toBe(400);
  });

  it("GET /api/burst ends a failed naive request with a clean SSE error event", async () => {
    const response = await burstGet(new Request("http://test/api/burst?variant=naive&speed=200"));
    const stream = await events(response);
    const errors = stream.filter((e) => e.event === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].data).toMatchObject({ type: "error", error: { code: "provider_error", providerStatus: 429, userMessage: HARSH_ERROR } });
    expect(stream.at(-1)).toMatchObject({ event: "summary", data: { summary: { succeeded: 2, failed: 1 } } });
  });

  it("GET /api/burst for the resilient client has no error events in the post's scenario", async () => {
    const response = await burstGet(new Request("http://test/api/burst?variant=resilient&speed=200"));
    const stream = await events(response);
    expect(stream.filter((e) => e.event === "error")).toHaveLength(0);
    expect(stream.at(-1)).toMatchObject({ event: "summary", data: { summary: { succeeded: 3, failed: 0 } } });
  });

  it("GET /api/eval scores the suite and applies the gate", async () => {
    const response = await evalGet(new Request("http://test/api/eval?pipeline=current"));
    const data = (await response.json()) as { report: { score: number }; decision: { publish: boolean } };
    expect(data.report.score).toBe(28);
    expect(data.decision.publish).toBe(true);
  });
});
