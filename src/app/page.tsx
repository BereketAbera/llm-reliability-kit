import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardTitle, SectionTitle } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";
import { runAllSets } from "@/lib/coach/eval";
import { ANSWER_BANK } from "@/lib/content/answer-bank";
import { CATALOG } from "@/lib/content/catalog";
import { percent, seconds, thousands } from "@/lib/format";
import { monitoringSnapshot } from "@/lib/monitoring/monitor";
import { DEFAULT_PARAMS, VARIANTS, runComparison } from "@/lib/reliability/scenario";
import type { VariantSummary } from "@/lib/reliability/timeline";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";

const linkClass = "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline";

function Card({ eyebrow, question, answer, links, children }: { eyebrow: string; question: string; answer: string; links: Array<{ href: string; label: string }>; children?: ReactNode }) {
  return (
    <article className="flex flex-col rounded-xl border bg-background p-5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-lg leading-snug font-semibold text-balance xl:min-h-[3lh]">{question}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer}</p>
      {children ? <div className="mt-3">{children}</div> : null}
      <div className="mt-auto flex flex-col items-start gap-1.5 pt-5">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass}>
            {link.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        ))}
      </div>
    </article>
  );
}

function ResultStat({ label, summary, tone, note }: { label: string; summary: VariantSummary; tone: "ok" | "warn" | "bad"; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold tabular", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad")}>
        {summary.succeeded}/{summary.total} <span className="text-sm font-normal text-muted-foreground">answered</span>
      </dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">
        {summary.failed} failed · slowest {seconds(summary.maxMs)}
      </dd>
      <dd className={cn("mt-1 text-xs font-medium", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad")}>{note}</dd>
    </div>
  );
}

export default async function HomePage() {
  const [runs, monitoring] = await Promise.all([runComparison(DEFAULT_PARAMS), monitoringSnapshot()]);
  const evalRun = runAllSets("current");
  const bad = runAllSets("paraphrase-no-guard");
  const { naive, resilient, trimmed } = runs;
  const slowWait = (resilient.summary.maxMs ?? 0) > 15_000;
  const perRequest = DEFAULT_PARAMS.promptTokens + DEFAULT_PARAMS.maxOutputTokens;

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="mb-3 text-sm font-medium text-primary">A working answer for a live AI sales coach</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Coach reliability kit</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Reliable answers when several reps ask at once, the trainer&apos;s exact lines instead of paraphrases, and a 30-question test that stops a
            bad publish. Built on the Clear Next Step method, a fictional sales method written for this demo.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/burst">
                See the 429 fix <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/ask">Ask the coach</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Three reps ask at once</p>
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
            <ResultStat label={VARIANTS.naive.title} summary={naive.summary} tone="bad" note={naive.summary.failed === 1 ? "1 rep sees an error" : `${naive.summary.failed} reps see an error`} />
            <ResultStat
              label={VARIANTS.resilient.title}
              summary={resilient.summary}
              tone={slowWait ? "warn" : "ok"}
              note={slowWait ? `Answered, but one rep waits ${seconds(resilient.summary.maxMs)}` : "Everyone answered"}
            />
            <ResultStat label={VARIANTS.trimmed.title} summary={trimmed.summary} tone="ok" note="Everyone answered quickly" />
          </dl>
          <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            {thousands(DEFAULT_PARAMS.promptTokens)}-token prompts against an assumed {thousands(DEFAULT_PARAMS.tpm)} tokens-per-minute limit.
            Answer-bank hits never call the model, so common questions cannot hit a 429 (about {percent(monitoring.bankShare)} of questions in the
            simulated day). Simulated provider: no real model calls.
          </p>
        </div>
      </section>

      <section aria-labelledby="milestone-title" className="mt-12 rounded-xl border bg-background p-5 sm:p-6">
        <SectionTitle id="milestone-title">Your first milestone: the 429 fix and the 30-question test</SectionTitle>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              ["Read one failed request", "The 429 headers in your logs say which limit was hit, how much is left and whose key it is: Replit's AI integration or an OpenAI account you control."],
              ["Wrap your OpenAI call", "Put the retry-queue client around the call you have today: token-aware waiting, backoff that honors retry-after, and “Lots of reps are asking right now” instead of an error."],
              ["Load your 30 questions", "Your questions and the exact lines a good answer must use go into the test format. Today's score becomes the baseline."],
              ["Gate the Replit publish", "The deployment build runs the test. If the score drops, or more questions get a wrong line, the build fails and nothing is published."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-3 rounded-lg bg-muted/60 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular" aria-hidden>
                  {index + 1}
                </span>
                <span className="min-w-0 text-sm leading-relaxed">
                  <span className="block font-semibold">{title}</span>
                  <span className="text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="text-sm leading-relaxed">
            <CardTitle as="h3">What I need from you</CardTitle>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>A log export with one failed request, headers included.</li>
              <li>Your 30 questions and the lines a good answer must use.</li>
              <li>Access to the Replit project, and which key the AI integration uses.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              The library test also catches the bug you just fixed: it fails the build if any approved line can no longer be found.
            </p>
            <Link href="/handover" className={cn(linkClass, "mt-3")}>
              Read the handover notes <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="The questions this demo answers" className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          eyebrow="Your question 2"
          question="Why do one in three requests fail when three reps ask at once?"
          answer={`Three prompts of ${thousands(DEFAULT_PARAMS.promptTokens)} tokens plus ${thousands(DEFAULT_PARAMS.maxOutputTokens)} output tokens need ${thousands(3 * perRequest)} tokens in the same minute. An assumed ${thousands(DEFAULT_PARAMS.tpm)} tokens-per-minute limit fits two; the third gets a 429.`}
          links={[
            { href: "/how-it-works#check-first", label: "What I would check first" },
            { href: "/burst", label: "See the 429 fix" },
          ]}
        />
        <Card
          eyebrow="Your question 3"
          question="How does the coach use the exact approved lines?"
          answer={`Common questions hit a bank of ${ANSWER_BANK.length} approved answers returned exactly as stored. Everything else finds the exact source line by ID, a verbatim check restores it if a model rewrites it, and when two lines fit the coach asks which one.`}
          links={[
            { href: "/how-it-works#exact-lines", label: "How the exact lines are kept" },
            { href: "/ask", label: "Ask the coach" },
          ]}
        >
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <li>{CATALOG.documents.length} current documents</li>
            <li>{CATALOG.scripts.length} approved lines</li>
            <li>old versions never searched</li>
          </ul>
        </Card>
        <Card
          eyebrow="Task 4: the regression test"
          question="How do we know a change didn't make answers worse?"
          answer={`Thirty fictional questions scored on exact lines before every publish: ${evalRun.suite.score}/30 today. A change that lets the model paraphrase drops it to ${bad.suite.score}/30, and the gate blocks it. ${evalRun.heldOut.total} held-out phrasings get ${evalRun.heldOut.outcomes["wrong-line"]} wrong lines.`}
          links={[{ href: "/eval", label: "See the 30-question test" }]}
        />
        <Card
          eyebrow="Task 5: monitoring"
          question="How would we notice failures in production?"
          answer="Each answer is logged with its path, outcome and wait. Alerts fire on unanswered questions and on the error rate, with a simple error-rate view. The page shows an illustrative day of simulated traffic run through the same clients."
          links={[{ href: "/monitoring", label: "Open monitoring" }]}
        />
      </section>

      <section aria-labelledby="real-title" className="mt-12 rounded-xl border bg-background p-5 sm:p-6">
        <SectionTitle id="real-title">What is real here</SectionTitle>
        <div className="mt-4 grid gap-6 text-sm leading-relaxed md:grid-cols-3">
          <div>
            <CardTitle as="h3">Running code behind the numbers</CardTitle>
            <p className="mt-1 text-muted-foreground">
              The clients, token bucket, backoff, matcher, retrieval and scorer are the TypeScript behind the numbers on the 429, Ask and 30-question
              pages, with unit, integration and end-to-end tests. Monitoring runs a simulated day of traffic through the same clients.
            </p>
          </div>
          <div>
            <CardTitle as="h3">A simulated provider</CardTitle>
            <p className="mt-1 text-muted-foreground">
              An OpenAI-compatible endpoint that enforces tokens and requests per minute, returns 429 with retry-after, and streams over SSE. It never
              calls a model, so every run is repeatable. The limits are assumptions to check against your own headers.
            </p>
          </div>
          <div>
            <CardTitle as="h3">Fictional content</CardTitle>
            <p className="mt-1 text-muted-foreground">
              The Clear Next Step method, its documents, answers and test questions were written for this demo. No real trainer&apos;s material is
              used. <Link className="font-medium text-primary underline underline-offset-4" href="/how-it-works">How it works</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
