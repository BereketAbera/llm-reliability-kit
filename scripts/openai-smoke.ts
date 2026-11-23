/**
 * pnpm smoke:openai: sends one coaching question through the resilient client to
 * a real OpenAI-compatible endpoint, only when OPENAI_API_KEY is set. Otherwise it
 * sends nothing.
 *
 *   OPENAI_API_KEY   the key (on Replit, the key your AI integration provides)
 *   OPENAI_BASE_URL  default https://api.openai.com/v1 (on Replit, the integration's base URL)
 *   OPENAI_MODEL     default gpt-4o
 *   OPENAI_TPM / OPENAI_RPM   the limits to plan for (default 30000 / 500; read yours
 *                    from the x-ratelimit-limit-* headers of any response)
 */
import { DEFAULT_MODEL, createResilientClient } from "../src/lib/reliability/clients";
import { realClock } from "../src/lib/reliability/clock";
import { openAITransport } from "../src/lib/reliability/openai";
import { buildMessages } from "../src/lib/reliability/scenario";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY is not set, so nothing was sent. The demo uses the simulated provider.");
    return;
  }
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const client = createResilientClient({
    transport: openAITransport(apiKey),
    url: `${base}/chat/completions`,
    clock: realClock,
    random: Math.random,
    limits: { tpm: Number(process.env.OPENAI_TPM ?? 30_000), rpm: Number(process.env.OPENAI_RPM ?? 500) },
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  });
  const question = "What should I say when I get their voicemail?";
  console.log(`Sending one question to ${base}/chat/completions`);
  const result = await client.complete({ id: 1, question, messages: buildMessages(question, 1_500), maxTokens: 200 }, (event) => {
    if (event.type !== "delta") console.log(event.type, new Date(event.t).toISOString());
  });
  console.log(result.ok ? `\n${result.text}` : `\nFailed: ${result.error?.message}`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
