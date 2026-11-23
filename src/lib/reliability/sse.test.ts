import { describe, expect, it } from "vitest";
import { SSEParser, encodeSSE, readSSE } from "./sse";

describe("SSE", () => {
  it("round-trips events even when chunks split anywhere", () => {
    const text = encodeSSE("delta", { text: "Hello" }) + ": keep-alive comment\n\n" + encodeSSE("error", { code: "busy", retryable: true });
    for (let cut = 1; cut < text.length; cut += 7) {
      const parser = new SSEParser();
      const messages = [...parser.push(text.slice(0, cut)), ...parser.push(text.slice(cut)), ...parser.flush()];
      expect(messages.map((m) => m.event)).toEqual(["delta", "error"]);
      expect(JSON.parse(messages[1].data)).toEqual({ code: "busy", retryable: true });
    }
  });

  it("joins multi-line data and reads from a byte stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: line one\r\ndata: line two\r\n\r\ndata: [DO"));
        controller.enqueue(encoder.encode("NE]\n\n"));
        controller.close();
      },
    });
    const seen: string[] = [];
    for await (const message of readSSE(body)) seen.push(message.data);
    expect(seen).toEqual(["line one\nline two", "[DONE]"]);
  });
});
