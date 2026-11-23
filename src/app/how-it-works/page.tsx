import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/site/code-block";
import { PageHeader } from "@/components/site/page-header";
import { excerpt } from "@/lib/excerpts";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "How it works" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t pt-8">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

const TOC = [
  ["check-first", "What to check first for the 429s"],
  ["the-fix", "The fix: queue, retry, fail calmly"],
  ["setup", "Provider setup for a group of reps"],
  ["exact-lines", "How the coach keeps the exact lines"],
  ["gate", "The publish gate"],
  ["monitoring", "Monitoring"],
  ["real-model", "Running against a real model"],
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader eyebrow="Plain language, real code" title="How it works">
        <p>
          The short version: the 429s come from sending more tokens in one minute than the plan allows, so the fix is to queue and retry on the
          provider&apos;s schedule and, above all, to send smaller prompts. Exact lines are kept by never letting the model write them. And nothing
          ships unless the 30-question test still passes. The code excerpts below are read from the source at build time.
        </p>
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">On this page</p>
          <ol className="space-y-1.5 text-sm">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="prose-code min-w-0 space-y-10">
          <Section id="check-first" title="What to check first for the 429s">
            <p>
              The logs say about one request in three fails when three arrive together, with prompts of about 14,500 tokens. That pattern points at the
              tokens-per-minute limit before anything else. In order:
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                <strong>Read one failed response in full.</strong> The 429 body and the <code>x-ratelimit-*</code> headers say whether the limit hit was
                tokens per minute or requests per minute, how much is left, and when it resets. If the platform&apos;s wrapper drops those details, log
                them before they are lost.
              </li>
              <li>
                <strong>Compare tokens per minute with prompt size times concurrency.</strong> Each request reserves its prompt plus its max output
                tokens when it arrives. Three requests of 14,500 + 500 tokens need 45,000 tokens at once. On a 30,000 tokens-per-minute limit, two
                fit and the third is rejected: exactly one in three.
              </li>
              <li>
                <strong>Check concurrency and retries.</strong> Are requests sent the moment they arrive, with no queue? Is there a retry, and does it
                wait for <code>retry-after</code> or fire again immediately? Rejected requests still count against requests per minute, so fast
                retries make it worse.
              </li>
              <li>
                <strong>Check the usage tier and which key is used.</strong> Limits belong to the account and model behind the key the app really
                calls. A key supplied through a hosting platform&apos;s integration may not have the limits of an account you control. Every rep, and
                every server instance, shares that one budget.
              </li>
              <li>
                <strong>Check max_tokens.</strong> A generous value reserves budget the short coaching answer never uses.
              </li>
            </ol>
            <p>
              The <Link className="font-medium text-primary underline underline-offset-4" href="/burst">Burst lab</Link> reproduces this with a
              simulated provider that enforces both limits and returns 429 with <code>retry-after</code> and <code>x-ratelimit-*</code> headers.
            </p>
          </Section>

          <Section id="the-fix" title="The fix: queue, retry, fail calmly">
            <p>
              <strong>Token-aware admission.</strong> Before sending, the client estimates the request&apos;s tokens and waits in a local token
              bucket that mirrors the provider&apos;s limit. A request the provider would reject is never sent; it waits its turn instead.
            </p>
            <CodeBlock label="src/lib/reliability/clients.ts" code={excerpt("src/lib/reliability/clients.ts", "admission")} />
            <p>
              <strong>Backoff with full jitter that honors retry-after.</strong> When a 429 still gets through (another instance or another app on
              the same key used the budget), the client waits at least as long as the provider asked, never less, and caps the number of retries.
            </p>
            <CodeBlock label="src/lib/reliability/backoff.ts" code={excerpt("src/lib/reliability/backoff.ts", "backoff")} />
            <CodeBlock label="src/lib/reliability/backoff.ts" code={excerpt("src/lib/reliability/backoff.ts", "with-retry")} />
            <p>
              <strong>Admission is single file, with a concurrency cap.</strong> While one request waits out a retry-after, nobody behind it
              sends a request that would only get the same 429.
            </p>
            <CodeBlock label="src/lib/reliability/clients.ts" code={excerpt("src/lib/reliability/clients.ts", "resilient-send")} />
            <p>
              <strong>Fail fast and calmly.</strong> If the queue ahead already needs more budget than a rep can reasonably wait for, the client says so
              at once. Every failure leaves the server as a clean <code>event: error</code> with a code and a retry hint, which the app turns into
              &ldquo;Lots of reps are asking right now. Your question is saved and will retry in about 20 seconds&rdquo; instead of &ldquo;The coaching
              response could not finish&rdquo;.
            </p>
            <CodeBlock label="src/lib/reliability/clients.ts" code={excerpt("src/lib/reliability/clients.ts", "shed")} />
            <CodeBlock label="src/lib/reliability/clients.ts" code={excerpt("src/lib/reliability/clients.ts", "clean-error")} />
          </Section>

          <Section id="setup" title="Provider setup for a group of reps">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Trim the prompt.</strong> The biggest lever. Line-level retrieval sends the matched section and top lines (about 4,000 tokens)
                instead of whole documents, so the same plan serves about three times as many questions a minute, and answers start sooner.
              </li>
              <li>
                <strong>Size the limit for the busiest minute.</strong> Reps asking at once × (prompt + max output). Ten reps with 4,500-token requests
                need 45,000 tokens per minute; with 15,000-token requests, 150,000.
              </li>
              <li>
                <strong>Use a key whose limits you know and can raise.</strong> Usage tiers go up with account history and spend; confirm the tier for
                the exact model in use.
              </li>
              <li>
                <strong>One budget per key.</strong> If the app runs on several instances, keep the token bucket in Postgres or Redis so they share it.
              </li>
              <li>
                <strong>Put the stable instructions first</strong> so the provider&apos;s prompt caching can reuse them; it cuts latency and cost.
              </li>
            </ul>
          </Section>

          <Section id="exact-lines" title="How the coach keeps the exact lines">
            <p>
              The model can&apos;t paraphrase a line it never writes. Common questions go to an answer bank first: keyword groups plus fuzzy matching
              against real rep phrasings, with typos corrected against the library&apos;s own words. Above the threshold, the approved text is returned
              exactly as stored, then one follow-up: &ldquo;Want to know why this works?&rdquo;
            </p>
            <CodeBlock label="src/lib/coach/matcher.ts" code={excerpt("src/lib/coach/matcher.ts", "bank-score")} />
            <p>
              Below the threshold, search runs over individual approved lines, not whole documents, so an objection or email type lands on the exact
              source line with its citation. If a model writes the reply around that line, a verbatim check confirms the line is still there word for
              word and restores it if not. When nothing approved fits, the coach says so rather than giving generic advice.
            </p>
            <CodeBlock label="src/lib/coach/coach.ts" code={excerpt("src/lib/coach/coach.ts", "answer")} />
            <CodeBlock label="src/lib/coach/text.ts" code={excerpt("src/lib/coach/text.ts", "normalize")} />
            <p>
              The bank stores a line ID, not a copy of the text, so the bank and the documents can&apos;t drift apart. Only the newest approved version
              of each document is searched, and a test fails the build if two current documents share a name or an approved line appears twice.
            </p>
          </Section>

          <Section id="gate" title="The publish gate">
            <p>
              Thirty questions, each with the approved line IDs a correct answer must use. The scorer is strict on purpose: the line word for word, or
              no credit.
            </p>
            <CodeBlock label="src/lib/coach/scorer.ts" code={excerpt("src/lib/coach/scorer.ts", "scorer")} />
            <CodeBlock label="src/lib/coach/eval.ts" code={excerpt("src/lib/coach/eval.ts", "gate")} />
            <p>
              <code>pnpm eval</code> runs this and exits non-zero when the gate fails; the GitHub Actions workflow runs it against the built app before
              the deploy step. See the <Link className="font-medium text-primary underline underline-offset-4" href="/eval">Eval gate</Link>.
            </p>
          </Section>

          <Section id="monitoring" title="Monitoring">
            <p>
              Each answer is logged with its path (answer bank, retrieval, no match), outcome, latency and attempts. The error rate is failed answers
              over requests in 15-minute windows. Alerts fire on three failed answers within five minutes, an error rate above 5%, slow answers, and
              (as information) each time the verbatim check had to restore a line.
            </p>
            <CodeBlock label="src/lib/monitoring/monitor.ts" code={excerpt("src/lib/monitoring/monitor.ts", "error-rate")} />
          </Section>

          <Section id="real-model" title="Running against a real model">
            <p>
              The clients take any fetch-compatible transport. The demo plugs in the simulated provider; with <code>OPENAI_API_KEY</code> set,{" "}
              <code>pnpm smoke:openai</code> sends one question through the same resilient client to the real API. The deployed demo has no key and
              makes no real model calls.
            </p>
            <CodeBlock label="src/lib/reliability/openai.ts" code={excerpt("src/lib/reliability/openai.ts", "openai")} />
          </Section>
        </div>
      </div>
    </>
  );
}
