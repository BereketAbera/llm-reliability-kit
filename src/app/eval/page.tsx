import type { Metadata } from "next";
import baseline from "../../../eval/baseline.json";
import { EvalBoard } from "@/components/eval/eval-board";
import { CodeBlock } from "@/components/site/code-block";
import { PageHeader } from "@/components/site/page-header";
import { PIPELINES, gate, runEval } from "@/lib/coach/eval";
import { EVAL_THRESHOLD } from "@/lib/content/eval-suite";
import { readRepoFile } from "@/lib/excerpts";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Eval gate" };

export default function EvalPage() {
  const pipelines = PIPELINES.map((p) => {
    const report = runEval(p.key);
    return { key: p.key, label: p.label, description: p.description, report, decision: gate(report, baseline) };
  });
  const workflow = readRepoFile(".github/workflows/publish-gate.yml");
  return (
    <>
      <PageHeader eyebrow="Measured, not guessed" title="Eval gate">
        <p>
          Thirty questions reps really ask, each tied to the approved line a good answer must contain. An answer counts as on method only if it
          contains that line word for word (ignoring case, spacing and punctuation) or quotes the right source line exactly. Naming the method is
          not enough. Publishing is blocked below {EVAL_THRESHOLD}/30 or if the score drops from the last approved run.
        </p>
      </PageHeader>
      <EvalBoard pipelines={pipelines} baselineScore={baseline.score} />
      <section aria-labelledby="gate-title" className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 id="gate-title" className="text-xl font-semibold tracking-tight">
            Run it before every publish
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The same suite runs from the command line, in-process or against a running build over HTTP, and exits non-zero when the gate fails. The
            workflow below runs it on every pull request and before the deploy step.
          </p>
          <CodeBlock
            className="mt-4"
            label="Terminal"
            code={[
              "pnpm eval                                  # 28/30 · Gate: PASS",
              "pnpm eval --url http://localhost:3203      # same suite against a running build",
              "pnpm eval --pipeline paraphrase-no-guard   # 18/30 · Gate: BLOCKED, exit 1",
              "pnpm eval --update-baseline                # record a new approved score",
            ].join("\n")}
          />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The two misses are real gaps, not noise: idioms like &ldquo;sleep on it&rdquo; and &ldquo;gone dark&rdquo; are not in the bank yet, so
            the coach declines instead of guessing. The fix is two new phrasings for the trainer to approve, then a re-run.
          </p>
        </div>
        <CodeBlock className="min-w-0" label=".github/workflows/publish-gate.yml" code={workflow} />
      </section>
    </>
  );
}
