import type { ChatMessage } from "./types";

/**
 * A rough, conservative estimate: about four characters per token for English.
 * The simulated provider counts with the same rule; a real tokenizer differs a
 * little, which is why the client still handles any 429 that slips through.
 */
export const CHARS_PER_TOKEN = 4;
const PER_MESSAGE_OVERHEAD = 4;

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimatePromptTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTextTokens(message.content) + PER_MESSAGE_OVERHEAD, 3);
}
