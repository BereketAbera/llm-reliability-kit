import { encodeSSE } from "./sse";

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

/** Wraps an async producer in a text/event-stream Response. */
export function sseResponse(produce: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeSSE(event, data)));
        } catch {
          open = false;
        }
      };
      try {
        await produce(send, signal);
      } catch (error) {
        send("run_error", { message: error instanceof Error ? error.message : String(error) });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
