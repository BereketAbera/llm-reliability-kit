export interface SSEMessage {
  event: string;
  data: string;
  id?: string;
}

// excerpt:start sse-encode
/** One server-sent event. Multi-line data is split into several data: lines. */
export function encodeSSE(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const lines = payload.split("\n").map((line) => `data: ${line}`);
  return `event: ${event}\n${lines.join("\n")}\n\n`;
}
// excerpt:end sse-encode

function parseBlock(block: string): SSEMessage | null {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n"), id };
}

/** Incremental text/event-stream parser: chunks may split anywhere. */
export class SSEParser {
  private buffer = "";

  push(chunk: string): SSEMessage[] {
    this.buffer = (this.buffer + chunk).replace(/\r\n?/g, "\n");
    const messages: SSEMessage[] = [];
    let index = this.buffer.indexOf("\n\n");
    while (index !== -1) {
      const message = parseBlock(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 2);
      if (message) messages.push(message);
      index = this.buffer.indexOf("\n\n");
    }
    return messages;
  }

  /** True when the stream ended part-way through an event (that event is dropped). */
  droppedPartial = false;

  /**
   * End of stream. Per the SSE spec, an event without its closing blank line is
   * incomplete and is discarded, never dispatched.
   */
  flush(): SSEMessage[] {
    this.droppedPartial = this.buffer.trim().length > 0;
    this.buffer = "";
    return [];
  }
}

export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const message of parser.push(decoder.decode(value, { stream: true }))) yield message;
    }
    for (const message of parser.push(decoder.decode())) yield message;
    for (const message of parser.flush()) yield message;
  } finally {
    reader.releaseLock();
  }
}
