import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TokenBudgetFigure } from "@/components/how-it-works/token-budget-figure";
import { CodeBlock } from "@/components/site/code-block";
import { OnThisPage } from "@/components/site/on-this-page";
import { PageHeader } from "@/components/site/page-header";
import { thousands } from "@/lib/format";
import { excerpt, readRepoFile } from "@/lib/excerpts";
import { DEFAULT_PARAMS } from "@/lib/reliability/scenario";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "How it works" };

const link = "font-medium text-primary underline underline-offset-4";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 border-t pt-8 lg:scroll-mt-24">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed [&>ol]:max-w-[68ch] [&>p]:max-w-[68ch] [&>ul]:max-w-[68ch]">{children}</div>
    </section>
  );
}

function Code({ file, name, what }: { file: string; name: string; what: string }) {
  return <CodeBlock label={file} code={excerpt(file, name)} collapsed={`Show the code: ${what}`} />;
}

const TOC = [
  ["check-first", "What to check first for the 429s"],
  ["the-fix", "The fix: wait for budget, retry on the provider's schedule"],
  ["setup", "Provider setup for a group of reps"],
  ["exact-lines", "How the coach keeps the exact lines"],
  ["library", "The document library in Postgres"],
  ["gate", "The publish gate"],
  ["monitoring", "Monitoring"],
  ["real-model", "Running against a real model"],
] as const;

export default function HowItWorksPage() {
  const tpm = thousands(DEFAULT_PARAMS.tpm);
  const prompt = thousands(DEFAULT_PARAMS.promptTokens);
  return (
    <>
      <PageHeader eyebrow="Plain language first, the code one click away" title="How it works">
        <p>
          The short version: the 429s come from sending more tokens in one minute than the plan allows, so the fix is to queue and retry on the
          provider&apos;s schedule and, above all, to send smaller prompts. Exact lines are kept by never letting the model write them. And nothing
          ships unless the 30-question test still passes. The code under each section is read from the source at build time.
        </p>
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <OnThisPage items={TOC} />

        <div className="prose-code min-w-0 space-y-10">
          <Section id="check-first" title="What to check first for the 429s">
            <p>
              The post says about one request in three fails when three arrive together, with prompts of about {prompt} tokens. That pattern points at
              the tokens-per-minute limit before anything else.
            </p>
            <TokenBudgetFigure
              caption={`Each request reserves its prompt plus up to ${DEFAULT_PARAMS.maxOutputTokens} output tokens the moment it arrives.`}
            />
            <p>What I would check, in order:</p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                <strong>Read one failed response in full.</strong> The 429 body and the <code>x-ratelimit-*</code> headers say whether the limit hit was
                tokens per minute or requests per minute, the limit itself, how much is left, and when it resets. If the platform&apos;s wrapper drops
                those details, log them before they are lost.
              </li>
              <li>
                <strong>Compare tokens per minute with prompt size times concurrency.</strong> Each request reserves its prompt plus its max output
                tokens when it arrives. Three requests of {prompt} + {DEFAULT_PARAMS.maxOutputTokens} tokens need{" "}
                {thousands(3 * (DEFAULT_PARAMS.promptTokens + DEFAULT_PARAMS.maxOutputTokens))} tokens at once. On a {tpm} tokens-per-minute limit, two
                fit and the third is rejected: exactly one in three. The {tpm} is an assumption (Tier 1 for gpt-4o-class models);{" "}
                <code>x-ratelimit-limit-tokens</code> on one of your 429s confirms the real number.
              </li>
              <li>
                <strong>Check concurrency and retries.</strong> Are requests sent the moment they arrive, with no queue? Is there a retry, and does it
                wait for <code>retry-after</code> or fire again immediately? Rejected requests still count against requests per minute, so fast
                retries make it worse.
              </li>
              <li>
                <strong>Find out whose limit it is.</strong> The app calls OpenAI through Replit&apos;s AI integration, so first confirm whether the 429
                comes from Replit&apos;s proxy or from an OpenAI account you control. The answer decides the fix: if the limit belongs to the
                integration, you may not be able to raise it yourself, and moving to your own key with a known tier may be the real change. Every rep,
                and every server instance, shares whichever budget that is.
              </li>
              <li>
                <strong>Check max_tokens.</strong> A generous value reserves budget the short coaching answer never uses.
              </li>
            </ol>
            <p>
              <Link className={link} href="/burst">
                Fixing the 429s
              </Link>{" "}
              reproduces this with a simulated provider that enforces both limits and returns 429 with <code>retry-after</code> and{" "}
              <code>x-ratelimit-*</code> headers.
            </p>
          </Section>

          <Section id="the-fix" title="The fix: wait for budget, retry on the provider's schedule">
            <p>
              <strong>Token-aware admission.</strong> Before sending, the client estimates the request&apos;s tokens and waits in a local token
              bucket that mirrors the provider&apos;s limit. A request the provider would reject is never sent; it waits its turn instead.
            </p>
            <Code file="src/lib/reliability/clients.ts" name="admission" what="token-aware admission" />
            <p>
              <strong>Backoff with full jitter that honors retry-after.</strong> When a 429 still gets through (another instance or another app on
              the same key used the budget), the client waits at least as long as the provider asked, never less, and caps the number of retries.
            </p>
            <Code file="src/lib/reliability/backoff.ts" name="backoff" what="backoff with full jitter" />
            <Code file="src/lib/reliability/backoff.ts" name="with-retry" what="the retry loop" />
            <p>
              <strong>Admission is single file, with a concurrency cap.</strong> While one request waits out a retry-after, nobody behind it sends a
              request that would only get the same 429.
            </p>
            <Code file="src/lib/reliability/clients.ts" name="resilient-send" what="single-file admission" />
            <p>
              <strong>Fail fast, with a clear message.</strong> If the queue ahead already needs more budget than a rep can reasonably wait for (45 seconds), the
              client says so at once. Every failure leaves the server as a clean <code>event: error</code> with a code and a retry hint, which the app
              turns into &ldquo;Lots of reps are asking right now. Tap Try again in about 20 seconds&rdquo; instead of &ldquo;The coaching response
              could not finish&rdquo;. The message promises only what happens: nothing is saved or retried behind the rep&apos;s back.
            </p>
            <Code file="src/lib/reliability/clients.ts" name="shed" what="failing fast" />
            <Code file="src/lib/reliability/clients.ts" name="clean-error" what="the try-again message" />
          </Section>

          <Section id="setup" title="Provider setup for a group of reps">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Measure the prompt, then trim it.</strong> The biggest lever, if the {prompt} tokens are mostly pasted reference text. That is a
                hypothesis: a token breakdown of one real prompt confirms it. If so, sending the matched section and top lines (a target of about{" "}
                {thousands(DEFAULT_PARAMS.trimmedTokens)} tokens) lets the same plan serve about three times as many questions a minute, and answers start
                sooner. The trim ships only if the 30-question score holds; the last bug silently cut content, so this one is gated.
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
                <strong>One budget per key.</strong> If Replit runs more than one instance of the app, keep the token bucket in the Postgres you already
                have (or Redis) so the instances share it instead of each assuming the whole budget.
              </li>
              <li>
                <strong>Put the stable instructions first</strong> so the provider&apos;s prompt caching can reuse them; it cuts latency and cost.
              </li>
            </ul>
          </Section>

          <Section id="exact-lines" title="How the coach keeps the exact lines">
            <p>
              The model can&apos;t paraphrase a line it never writes. Common questions go to an answer bank first. A keyword group has to pin the
              situation (&ldquo;no&rdquo; with &ldquo;budget&rdquo;, not &ldquo;budget&rdquo; alone), and a bare topic word counts only when the rep is
              reporting what the buyer said. Above the threshold, the approved text is returned exactly as stored, then one follow-up: &ldquo;Want to
              know why this works?&rdquo;
            </p>
            <Code file="src/lib/coach/matcher.ts" name="bank-score" what="answer-bank scoring" />
            <p>
              Below the threshold, search runs over individual approved lines, not whole documents, so an objection or email type lands on the exact
              source line with its citation. Words found in almost every question (&ldquo;give me a good line&rdquo;) never count as evidence, a line
              needs two of the question&apos;s words from what its section is about, an email question never gets a call line, and when two sections
              fit about equally the coach asks which one instead of guessing. When nothing approved fits, it says so.
            </p>
            <Code file="src/lib/coach/retrieval.ts" name="retrieve" what="line retrieval" />
            <p>
              If a model writes the reply around that line, a verbatim check confirms the line is still there word for word and restores it if not.
              Typos are fixed only when nothing matched as typed, and only for words that are not real English (&ldquo;pirce&rdquo;, never
              &ldquo;bake&rdquo;).
            </p>
            <Code file="src/lib/coach/coach.ts" name="answer" what="the answer pipeline" />
            <Code file="src/lib/coach/text.ts" name="normalize" what="the verbatim check" />
            <p>
              The bank stores a line ID, not a copy of the text, so the bank and the documents can&apos;t drift apart. Only the newest approved version
              of each document is searched, and a test fails the build if two current documents share a name, an approved line appears twice, or any
              approved line can no longer be found: the &ldquo;content silently blocked&rdquo; kind of bug.
            </p>
          </Section>

          <Section id="library" title="The document library in Postgres">
            <p>
              The demo keeps its documents in memory, but the model is the one your Postgres library needs. Each document has a slug, a version and a
              status; a partial unique index allows only one approved version per slug, so &ldquo;one current version of each document, no
              duplicates&rdquo; is enforced by the database itself. Approving a new version supersedes the old one in the same transaction. Search runs
              per line, over current documents only, with section titles and tags weighted above the line text.
            </p>
            <p>
              The schema below ran against Postgres 17 while this demo was built: the index rejected a second approved version, search returned only
              current lines, and approval swapped versions in one step.
            </p>
            <CodeBlock label="db/schema.sql" code={readRepoFile("db/schema.sql")} collapsed="Show the SQL: db/schema.sql" />
          </Section>

          <Section id="gate" title="The publish gate">
            <p>
              Thirty questions, each with the approved line IDs a correct answer must use. The scorer is strict on purpose: the line word for word, or no
              credit. Alongside them run held-out phrasings and questions that should be declined, so the gate also sees wrong lines, not just misses.
            </p>
            <Code file="src/lib/coach/scorer.ts" name="scorer" what="the scorer" />
            <Code file="src/lib/coach/eval.ts" name="gate" what="the gate" />
            <p>
              <code>pnpm eval</code> runs this and exits non-zero when the gate fails. On Replit, it goes in the <code>[deployment] build</code> command,
              so a failing score fails the build and nothing is published. See{" "}
              <Link className={link} href="/eval">
                the 30-question test
              </Link>
              .
            </p>
          </Section>

          <Section id="monitoring" title="Monitoring">
            <p>
              Each answer is logged with its path (answer bank, retrieval, no match), outcome, wait and attempts. A question is unanswered if the rep got
              an error or was told to try again; the error rate is unanswered questions over questions asked, in 15-minute windows. Alerts fire on three
              unanswered questions within five minutes, an error rate above 5%, slow answers, and (as information) each time the verbatim check had to
              restore a line.
            </p>
            <Code file="src/lib/monitoring/monitor.ts" name="error-rate" what="the error rate" />
          </Section>

          <Section id="real-model" title="Running against a real model">
            <p>
              The clients take any fetch-compatible transport. The demo plugs in the simulated provider; with <code>OPENAI_API_KEY</code> set,{" "}
              <code>pnpm smoke:openai</code> sends one question through the same resilient client to the real API. <code>OPENAI_BASE_URL</code> points
              it at another OpenAI-compatible endpoint, such as the one Replit&apos;s AI integration provides. The deployed demo has no key and makes no
              real model calls.
            </p>
            <Code file="src/lib/reliability/openai.ts" name="openai" what="the real-API transport" />
          </Section>
        </div>
      </div>
    </>
  );
}
