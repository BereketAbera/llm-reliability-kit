/**
 * pnpm smoke:openai: sends one coaching question through the resilient client
 * to the real API, only when OPENAI_API_KEY is set. Otherwise it sends nothing.
 */
import { createResilientClient } from "../src/lib/reliability/clients";
import { realClock } from "../src/lib/reliability/clock";
import { openAITransport } from "../src/lib/reliability/openai";
import { buildMessages } from "../src/lib/reliability/scenario";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY is not set, so nothing was sent. The demo uses the simulated provider.");
    return;
  }
  const client = createResilientClient({
    transport: openAITransport(apiKey),
    clock: realClock,
    random: Math.random,
    limits: { tpm: Number(process.env.OPENAI_TPM ?? 30_000), rpm: Number(process.env.OPENAI_RPM ?? 500) },
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
  const question = "They say our price is too high";
  const result = await client.complete({ id: 1, question, messages: buildMessages(question, 1_500), maxTokens: 200 }, (event) => {
    if (event.type !== "delta") console.log(event.type, "t" in event ? new Date(event.t).toISOString() : "");
  });
  console.log(result.ok ? `\n${result.text}` : `\nFailed: ${result.error?.message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
