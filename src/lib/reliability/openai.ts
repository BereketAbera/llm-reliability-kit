import type { Transport } from "./types";

// excerpt:start openai
/**
 * The real API plugs into the same clients as the simulated provider: both are
 * a fetch-compatible transport. Not used in the deployed demo (no key is set).
 */
export function openAITransport(apiKey: string): Transport {
  return (url, init) =>
    fetch(url, {
      method: init.method,
      body: init.body,
      signal: init.signal,
      headers: { ...init.headers, authorization: `Bearer ${apiKey}` },
    });
}
// excerpt:end openai
