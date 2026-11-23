import { ArrowRight, BellRing, BookOpenCheck, Gauge, ListChecks } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { runEval } from "@/lib/coach/eval";
import { ANSWER_BANK } from "@/lib/content/answer-bank";
import { CATALOG } from "@/lib/content/catalog";
import { seconds } from "@/lib/format";
import { DEFAULT_PARAMS, runComparison } from "@/lib/reliability/scenario";

export const dynamic = "force-static";

function Card({ icon, question, answer, href, cta, children }: { icon: ReactNode; question: string; answer: string; href: string; cta: string; children?: ReactNode }) {
  return (
    <article className="flex flex-col rounded-xl border bg-background p-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h2 className="mt-4 text-lg leading-snug font-semibold text-balance">{question}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      <div className="mt-auto pt-5">
        <Link href={href} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
          {cta} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const runs = await runComparison(DEFAULT_PARAMS);
  const report = runEval("current");
  const bad = runEval("paraphrase-no-guard");
  const { naive, resilient, trimmed } = runs;

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="mb-3 text-sm font-medium text-primary">A working answer for a live AI sales coach</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Coach reliability kit</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Reliable answers when several reps ask at once, the trainer&apos;s exact lines instead of paraphrases, and a 30-question test that stops a
            bad publish. Built on a fictional method written for this demo, the Clear Next Step method (fictional).
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/burst">
                Run the burst <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/ask">Ask the coach</Link>
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-background p-4">
          <div>
            <dt className="text-xs text-muted-foreground">Naive client</dt>
            <dd className="mt-1 text-2xl font-semibold text-bad tabular">
              {naive.summary.succeeded}/{naive.summary.total}
            </dd>
            <dd className="text-xs text-muted-foreground">answered, {naive.summary.rateLimited} × 429</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resilient</dt>
            <dd className="mt-1 text-2xl font-semibold text-ok tabular">
              {resilient.summary.succeeded}/{resilient.summary.total}
            </dd>
            <dd className="text-xs text-muted-foreground">p95 {seconds(resilient.summary.p95Ms, 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">+ trimmed prompt</dt>
            <dd className="mt-1 text-2xl font-semibold text-ok tabular">
              {trimmed.summary.succeeded}/{trimmed.summary.total}
            </dd>
            <dd className="text-xs text-muted-foreground">p95 {seconds(trimmed.summary.p95Ms)}</dd>
          </div>
          <p className="col-span-3 border-t pt-3 text-xs text-muted-foreground">
            Three reps at once, 14,500-token prompts, 30,000 tokens per minute. Simulated provider: no real model calls.
          </p>
        </dl>
      </section>

      <section aria-label="The questions this demo answers" className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          icon={<Gauge className="size-5" aria-hidden />}
          question="Why do one in three requests fail when three reps ask at once?"
          answer="Three prompts of 14,500 tokens plus 500 output tokens need 45,000 tokens in the same minute. A 30,000 tokens-per-minute tier fits two. The third gets a 429."
          href="/burst"
          cta="Open the Burst lab"
        />
        <Card
          icon={<BookOpenCheck className="size-5" aria-hidden />}
          question="How does the coach use the exact approved lines?"
          answer={`Common questions hit a bank of ${ANSWER_BANK.length} approved answers returned exactly as stored. Everything else finds the exact source line by ID, and a verbatim check restores it if a model rewrites it.`}
          href="/ask"
          cta="Ask the coach"
        >
          <p className="text-xs text-muted-foreground">
            {CATALOG.documents.length} current documents · {CATALOG.scripts.length} approved lines · old versions never searched
          </p>
        </Card>
        <Card
          icon={<ListChecks className="size-5" aria-hidden />}
          question="How do we know a change didn't make answers worse?"
          answer={`Thirty questions scored on exact lines before every publish. The current pipeline scores ${report.score}/30. A change that lets the model paraphrase drops it to ${bad.score}/30, and the gate blocks it.`}
          href="/eval"
          cta="See the eval gate"
        />
        <Card
          icon={<BellRing className="size-5" aria-hidden />}
          question="How would we notice failures in production?"
          answer="Every answer is logged with its path, outcome and latency. Alerts fire on failed answers and on error rate, with a simple error-rate view over the day."
          href="/monitoring"
          cta="Open monitoring"
        />
      </section>

      <section className="mt-12 rounded-xl border bg-background p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight">What is real here</h2>
        <div className="mt-4 grid gap-6 text-sm leading-relaxed md:grid-cols-3">
          <div>
            <h3 className="font-semibold">Running code, not mockups</h3>
            <p className="mt-1 text-muted-foreground">
              The clients, token bucket, backoff, matcher, retrieval and scorer are the TypeScript that produces every number on these pages, with
              unit, integration and end-to-end tests.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">A simulated provider</h3>
            <p className="mt-1 text-muted-foreground">
              An OpenAI-compatible endpoint that enforces tokens and requests per minute, returns 429 with retry-after, and streams over SSE. It never
              calls a model, so every run is repeatable.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Fictional content</h3>
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
