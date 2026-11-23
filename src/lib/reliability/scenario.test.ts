import { describe, expect, it } from "vitest";
import { answerQuestion } from "../coach/coach";
import { HARSH_ERROR, calmMessage, createResilientClient } from "./clients";
import { VirtualClock } from "./clock";
import { SimulatedProvider } from "./provider";
import { seededRandom } from "./random";
import { BURST_QUESTIONS, DEFAULT_PARAMS, PRESETS, buildMessages, runComparison, runVariant } from "./scenario";
import { readSSE } from "./sse";
import type { ChatRequestBody } from "./types";

function body(promptTokens: number): string {
  const request: ChatRequestBody = {
    model: "sim",
    messages: buildMessages("They say our price is too high", promptTokens),
    max_tokens: 500,
    stream: true,
  };
  return JSON.stringify(request);
}

describe("simulated provider", () => {
  it("enforces tokens per minute with a 429 and retry-after headers, and streams SSE otherwise", async () => {
    const clock = new VirtualClock();
    const provider = new SimulatedProvider({ tier: { label: "test", tpm: 30_000, rpm: 500 }, clock });
    const send = () => provider.transport("https://example.invalid", { method: "POST", headers: {}, body: body(14_500) });
    const responses = await clock.run(Promise.all([send(), send(), send()]));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 429]);

    const limited = responses[2];
    expect(Number(limited.headers.get("retry-after-ms"))).toBeGreaterThan(29_000);
    expect(limited.headers.get("retry-after")).toBe("30");
    expect(limited.headers.get("x-ratelimit-limit-tokens")).toBe("30000");
    expect(limited.headers.get("x-simulated-provider")).toContain("no real model calls");
    const error = (await limited.json()) as { error: { type: string; message: string } };
    expect(error.error.type).toBe("tokens");
    expect(error.error.message).toContain("tokens per min");

    const ok = responses[0];
    expect(ok.headers.get("content-type")).toContain("text/event-stream");
    const read = async () => {
      const data: string[] = [];
      for await (const message of readSSE(ok.body!)) data.push(message.data);
      return data;
    };
    const data = await clock.run(read());
    expect(data.at(-1)).toBe("[DONE]");
    expect(data.join("")).toContain('"usage"');
  });

  it("counts requests per minute too", async () => {
    const clock = new VirtualClock();
    const provider = new SimulatedProvider({ tier: { label: "test", tpm: 1_000_000, rpm: 2 }, clock });
    const send = () => provider.transport("https://example.invalid", { method: "POST", headers: {}, body: body(1_000) });
    const statuses = await clock.run(Promise.all([send(), send(), send()]).then((rs) => rs.map((r) => r.status)));
    expect(statuses).toEqual([200, 200, 429]);
    expect(provider.stats.rejectedForRequests).toBe(1);
  });
});

describe("burst scenario (seed 7)", () => {
  it("naive client fails one in three; resilient and trimmed answer everyone", async () => {
    const { naive, resilient, trimmed } = await runComparison(DEFAULT_PARAMS);

    expect(naive.summary).toMatchObject({ total: 3, succeeded: 2, failed: 1, rateLimited: 1 });
    const failed = naive.timelines.find((t) => t.outcome === "error")!;
    expect(failed.error).toMatchObject({ providerStatus: 429, userMessage: HARSH_ERROR });

    expect(resilient.summary).toMatchObject({ total: 3, succeeded: 3, failed: 0, rateLimited: 0 });
    expect(resilient.provider.rejected).toBe(0);
    // The third rep waited for the budget to refill instead of failing.
    expect(resilient.summary.p95Ms).toBeGreaterThan(29_000);

    expect(trimmed.summary).toMatchObject({ total: 3, succeeded: 3, failed: 0, rateLimited: 0 });
    expect(trimmed.summary.p95Ms).toBeLessThan(3_000);
  });

  it("is deterministic: same params and seed, same events", async () => {
    const a = await runVariant(DEFAULT_PARAMS, "resilient");
    const b = await runVariant(DEFAULT_PARAMS, "resilient");
    expect(b.events).toEqual(a.events);
    expect(b.summary).toEqual(a.summary);
  });

  it("with a shared key, honors retry-after and fails calmly when the budget is not there", async () => {
    const preset = PRESETS.find((p) => p.key === "shared-key")!;
    const resilient = await runVariant(preset.params, "resilient");
    expect(resilient.summary.rateLimited).toBeGreaterThan(0);
    for (const event of resilient.events) {
      if (event.type !== "backoff") continue;
      const hint = resilient.events.find((e) => e.type === "rate_limited" && e.id === event.id && e.t === event.t);
      expect(hint && hint.type === "rate_limited" ? hint.retryAfterMs : undefined).toBeDefined();
      if (hint && hint.type === "rate_limited") expect(event.delayMs).toBeGreaterThanOrEqual(hint.retryAfterMs!);
    }
    for (const timeline of resilient.timelines.filter((t) => t.outcome === "error")) {
      expect(timeline.error).toMatchObject({ code: "busy", retryable: true });
      expect(timeline.error?.userMessage).not.toBe(HARSH_ERROR);
      // Nothing is saved or retried for the rep, so the message must not say so.
      expect(timeline.error?.userMessage).not.toMatch(/saved|will retry/);
    }
    const trimmed = await runVariant(preset.params, "trimmed");
    expect(trimmed.summary.failed).toBe(0);
  });

  it("rejects a prompt that can never fit before sending it", async () => {
    const clock = new VirtualClock();
    const provider = new SimulatedProvider({ tier: { label: "test", tpm: 10_000, rpm: 500 }, clock });
    const client = createResilientClient({ transport: provider.transport, clock, random: seededRandom(1), limits: { tpm: 10_000, rpm: 500 } });
    const events: string[] = [];
    const result = await clock.run(
      client.complete({ id: 1, question: "q", messages: buildMessages("They say our price is too high", 14_500), maxTokens: 500 }, (e) => events.push(e.type)),
    );
    expect(result.error?.code).toBe("too_large");
    expect(provider.stats.accepted + provider.stats.rejected).toBe(0);
    expect(events).toEqual(["error"]);
  });
});

describe("burst questions", () => {
  it("are questions the answer bank does not cover, so each one calls the model", () => {
    expect(BURST_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    for (const question of BURST_QUESTIONS) expect(answerQuestion(question).path, question).toBe("retrieval");
  });

  it("carry the approved line each rep should see", async () => {
    const { resilient } = await runComparison(DEFAULT_PARAMS);
    for (const timeline of resilient.timelines) {
      expect(timeline.lineId).toBeDefined();
      expect(timeline.text).toBe(answerQuestion(timeline.question).quote?.text);
    }
  });
});

describe("calm busy message", () => {
  it("says when to try again, and never quotes a wait longer than the client would wait", () => {
    expect(calmMessage(20_000, 45_000)).toBe("Lots of reps are asking right now. Tap Try again in about 20 seconds.");
    expect(calmMessage(78_000, 45_000)).toBe("Lots of reps are asking right now. Tap Try again in a minute or two.");
    expect(calmMessage(undefined)).toBe("Lots of reps are asking right now. Tap Try again in a moment.");
  });
});
