import type { Clock } from "./clock";
import { estimatePromptTokens, estimateTextTokens } from "./estimate";
import { TokenBucket, perMinuteBucket } from "./token-bucket";
import type { ChatRequestBody, Transport } from "./types";

export const SIMULATED_LABEL = "simulated provider: no real model calls";

export interface ProviderTier {
  label: string;
  tpm: number;
  rpm: number;
}

export interface SimulatedProviderOptions {
  tier: ProviderTier;
  clock: Clock;
  /** Tokens per minute already used by other traffic on the same key (other instances, other reps). */
  otherTrafficTpm?: number;
  /** Network time for the request to reach the provider. */
  networkMs?: number;
  /** Fixed time before the first token. */
  baseFirstTokenMs?: number;
  /** Extra time before the first token per 1,000 prompt tokens (reading the prompt is not free). */
  prefillMsPerThousand?: number;
  outputTokensPerSecond?: number;
  /** Returns true when the simulated model should reword the approved line (for the monitoring day). */
  rewrites?: () => boolean;
}

export interface ProviderStats {
  accepted: number;
  rejected: number;
  rejectedForTokens: number;
  rejectedForRequests: number;
  tokensCharged: number;
}

const encoder = new TextEncoder();

function formatWait(ms: number): string {
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m${((ms % 60_000) / 1000).toFixed(0)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.ceil(ms)}ms`;
}

/** The approved line a prompt carries, if any. */
export function approvedLineIn(body: ChatRequestBody): { id: string; text: string } | undefined {
  const text = body.messages.map((m) => m.content).join("\n");
  const match = text.match(/APPROVED LINE \[([A-Z0-9.-]+)\]: "([^"]+)"/);
  return match ? { id: match[1], text: match[2] } : undefined;
}

/** The simulated model returns the approved line it was given word for word, or declines. Deterministic. */
export function simulatedCompletion(body: ChatRequestBody, reword = false): string {
  const line = approvedLineIn(body);
  if (!line) return "I can only answer from the approved material. Try asking about a specific objection, email or call moment.";
  return reword ? `Try something like: ${line.text.split(" ").slice(0, -3).join(" ")}...` : line.text;
}

function chunkWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * An OpenAI-compatible chat completions endpoint that never calls a model.
 * It enforces tokens-per-minute and requests-per-minute like a real usage tier,
 * answers 429 with retry-after headers when a limit is hit, and streams over SSE.
 */
export class SimulatedProvider {
  readonly tokens: TokenBucket;
  readonly requests: TokenBucket;
  readonly stats: ProviderStats = {
    accepted: 0,
    rejected: 0,
    rejectedForTokens: 0,
    rejectedForRequests: 0,
    tokensCharged: 0,
  };
  private readonly options: Required<SimulatedProviderOptions>;
  private counter = 0;

  constructor(options: SimulatedProviderOptions) {
    this.options = {
      otherTrafficTpm: 0,
      networkMs: 40,
      baseFirstTokenMs: 300,
      prefillMsPerThousand: 35,
      outputTokensPerSecond: 50,
      rewrites: () => false,
      ...options,
    };
    const { tier, clock, otherTrafficTpm } = this.options;
    const spare = Math.max(0, tier.tpm - otherTrafficTpm);
    // Other traffic on the same key leaves less budget now and refills it more slowly.
    this.tokens = new TokenBucket(tier.tpm, spare / 60_000, clock, spare);
    this.requests = perMinuteBucket(tier.rpm, clock);
  }

  readonly transport: Transport = async (_url, init) => {
    const body = JSON.parse(init.body) as ChatRequestBody;
    return this.handle(body, init.signal);
  };

  private rateHeaders(): Headers {
    const { tier } = this.options;
    const tokensLeft = Math.floor(this.tokens.available());
    const requestsLeft = Math.floor(this.requests.available());
    const headers = new Headers({
      "x-simulated-provider": SIMULATED_LABEL,
      "x-ratelimit-limit-tokens": String(tier.tpm),
      "x-ratelimit-limit-requests": String(tier.rpm),
      "x-ratelimit-remaining-tokens": String(tokensLeft),
      "x-ratelimit-remaining-requests": String(requestsLeft),
      "x-ratelimit-reset-tokens": formatWait(this.tokens.msUntil(tier.tpm) === Infinity ? 60_000 : this.tokens.msUntil(tier.tpm)),
      "x-ratelimit-reset-requests": formatWait(this.requests.msUntil(tier.rpm)),
    });
    return headers;
  }

  private reject(kind: "tokens" | "requests", requested: number, waitMs: number, message?: string): Response {
    const { tier } = this.options;
    this.stats.rejected++;
    if (kind === "tokens") this.stats.rejectedForTokens++;
    else this.stats.rejectedForRequests++;
    const headers = this.rateHeaders();
    headers.set("content-type", "application/json");
    if (Number.isFinite(waitMs)) {
      headers.set("retry-after-ms", String(Math.ceil(waitMs)));
      headers.set("retry-after", String(Math.ceil(waitMs / 1000)));
    }
    const limit = kind === "tokens" ? tier.tpm : tier.rpm;
    const used = kind === "tokens" ? Math.round(tier.tpm - this.tokens.available()) : Math.round(tier.rpm - this.requests.available());
    const text =
      message ??
      `Rate limit reached for ${kind === "tokens" ? "tokens per min (TPM)" : "requests per min (RPM)"}: Limit ${limit}, Used ${used}, Requested ${requested}. Please try again in ${formatWait(waitMs)}.`;
    return new Response(JSON.stringify({ error: { message: text, type: kind, code: "rate_limit_exceeded" } }), {
      status: 429,
      headers,
    });
  }

  private async handle(body: ChatRequestBody, signal?: AbortSignal): Promise<Response> {
    const { clock, tier, networkMs } = this.options;
    await clock.sleep(networkMs);
    const promptTokens = estimatePromptTokens(body.messages);
    const cost = promptTokens + body.max_tokens;

    // Every request counts against requests per minute, accepted or not.
    if (!this.requests.tryTake(1)) {
      return this.reject("requests", 1, this.requests.msUntil(1));
    }
    if (cost > tier.tpm) {
      return this.reject("tokens", cost, Infinity, `Request too large: Limit ${tier.tpm} tokens per min, Requested ${cost}. Send fewer tokens.`);
    }
    if (!this.tokens.tryTake(cost)) {
      return this.reject("tokens", cost, this.tokens.msUntil(cost));
    }
    this.stats.accepted++;
    this.stats.tokensCharged += cost;
    return this.stream(body, promptTokens, signal);
  }

  private stream(body: ChatRequestBody, promptTokens: number, signal?: AbortSignal): Response {
    const { clock, baseFirstTokenMs, prefillMsPerThousand, outputTokensPerSecond } = this.options;
    const id = `chatcmpl-sim-${++this.counter}`;
    const text = simulatedCompletion(body, this.options.rewrites());
    const pieces = chunkWords(text);
    const msPerToken = 1000 / outputTokensPerSecond;
    const firstTokenMs = baseFirstTokenMs + (promptTokens / 1000) * prefillMsPerThousand;
    const completionTokens = estimateTextTokens(text);
    const model = body.model;

    async function* chunks(): AsyncGenerator<Uint8Array> {
      await clock.sleep(firstTokenMs);
      for (let i = 0; i < pieces.length; i++) {
        if (signal?.aborted) return;
        const delta = i === 0 ? { role: "assistant", content: pieces[i] } : { content: pieces[i] };
        const chunk = { id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: null }] };
        yield encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
        await clock.sleep(Math.max(1, estimateTextTokens(pieces[i])) * msPerToken);
      }
      const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
      const last = { id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage };
      yield encoder.encode(`data: ${JSON.stringify(last)}\n\n`);
      yield encoder.encode("data: [DONE]\n\n");
    }

    const iterator = chunks();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      async cancel() {
        await iterator.return(undefined);
      },
    });
    const headers = this.rateHeaders();
    headers.set("content-type", "text/event-stream; charset=utf-8");
    headers.set("cache-control", "no-cache");
    return new Response(stream, { status: 200, headers });
  }
}
