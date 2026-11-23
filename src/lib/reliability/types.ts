export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  stream: true;
  stream_options?: { include_usage: boolean };
}

/** fetch-compatible: the real API and the simulated provider plug in the same way. */
export type Transport = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<Response>;

export interface RateLimits {
  /** Tokens per minute. */
  tpm: number;
  /** Requests per minute. */
  rpm: number;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
