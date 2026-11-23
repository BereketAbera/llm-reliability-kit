import type { Metadata } from "next";
import baseline from "../../../eval/baseline.json";
import { EvalBoard } from "@/components/eval/eval-board";
import { CodeBlock } from "@/components/site/code-block";
import { PageHeader, SectionTitle } from "@/components/site/page-header";
import { PIPELINES, gate, runAllSets } from "@/lib/coach/eval";
import { EVAL_SUITE, EVAL_THRESHOLD } from "@/lib/content/eval-suite";
import { readRepoFile } from "@/lib/excerpts";
import { DEFAULT_PARAMS } from "@/lib/reliability/scenario";
import { thousands } from "@/lib/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "30-question test" };

const COMMANDS: Array<[string, string]> = [
  ["pnpm eval", "Runs the 30 questions, the held-out phrasings and the decline set in-process. Exits 0 when the gate passes."],
  ["pnpm eval --url http://localhost:3203", "The same questions against a running build over HTTP, the way a publish step would."],
  ["pnpm eval --pipeline paraphrase-no-guard", "A bad change on purpose: the score drops and the command exits 1."],
  ["pnpm eval --update-baseline", "Records a new approved run, only when the gate passes."],
];

export default function EvalPage() {
  const pipelines = PIPELINES.map((p) => {
    const run = runAllSets(p.key);
    return { key: p.key, label: p.label, description: p.description, run, decision: gate(run, baseline) };
  });
  const current = pipelines[0].run;
  const misses = current.suite.rows.filter((row) => !row.onMethod);
  const workflow = readRepoFile(".github/workflows/publish-gate.yml");
  const replit = readRepoFile(".replit");
  const perQuestion = DEFAULT_PARAMS.promptTokens + DEFAULT_PARAMS.maxOutputTokens;
  const trimmedPerQuestion = DEFAULT_PARAMS.trimmedTokens + DEFAULT_PARAMS.maxOutputTokens;
  const minutes = (tokens: number) => Math.round((tokens / DEFAULT_PARAMS.tpm) * 10) / 10;
  return (
    <>
      <PageHeader eyebrow="Publish gate · measured, not guessed" title="The 30-question test">
        <p>
          Thirty fictional questions, written the way reps ask, each tied to the approved line a good answer must contain. An answer counts as on
          method only if it contains that line word for word (ignoring case, spacing and punctuation) or quotes the right source line exactly. Naming
          the method is not enough. Publishing is blocked below {EVAL_THRESHOLD}/{EVAL_SUITE.length}, if the score drops from the last approved run, or
          if more questions get a wrong approved line.
        </p>
        <p className="mt-2 text-sm">
          The answer bank never contains the test questions or near copies of them: a unit test checks it, and the publish build runs the unit tests.
          With the copies removed the suite still scores {current.suite.score}/{current.suite.total}.
        </p>
      </PageHeader>
      <EvalBoard pipelines={pipelines} baseline={{ score: baseline.score, wrongLines: baseline.wrongLines }} />

      <section aria-labelledby="gate-title" className="mt-10 space-y-6">
        <SectionTitle id="gate-title">Run it before every publish</SectionTitle>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 rounded-xl border bg-background p-5">
            <h3 className="text-base font-semibold">On Replit</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Replit runs the <code className="rounded bg-muted px-1">[deployment] build</code> command from <code className="rounded bg-muted px-1">.replit</code>{" "}
              before it publishes. Putting the test in that command means a failing score fails the build, so pressing Publish cannot ship it.
            </p>
            <CodeBlock className="mt-3" label=".replit" code={replit} wrap />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A GitHub Actions workflow that runs the same checks on every pull request is an optional extra. In this demo repo it has not run in CI
              yet, because the repo has not been pushed; its deploy step only runs by hand and skips itself when no deploy token is set.
            </p>
            <CodeBlock className="mt-3" label=".github/workflows/publish-gate.yml" code={workflow} collapsed="See the workflow file" />
          </div>
          <div className="min-w-0 rounded-xl border bg-background p-5">
            <h3 className="text-base font-semibold">From the command line</h3>
            <dl className="mt-3 divide-y text-sm">
              {COMMANDS.map(([command, meaning]) => (
                <div key={command} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-4">
                  <dt>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]">{command}</code>
                  </dt>
                  <dd className="text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Exit codes: 0 when the gate passes, 1 when it blocks, 2 for a typo in the options or a missing baseline file. A typo never turns a check off.
            </p>
            {misses.length ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The {misses.length === 1 ? "miss is a real gap" : `${misses.length} misses are real gaps`}, not noise:{" "}
                {misses.map((row, i) => (
                  <span key={row.id}>
                    {i > 0 ? (i === misses.length - 1 ? " and " : ", ") : ""}&ldquo;{row.question}&rdquo;
                  </span>
                ))}{" "}
                {misses.length === 1 ? "uses" : "use"} idioms the bank does not cover yet, so the coach declines instead of guessing. The fix is a new
                phrasing for the trainer to approve, then a re-run.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-background p-5">
          <h3 className="text-base font-semibold">With the real model</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This demo&apos;s answers are fixed, so every run scores the same. With your model in the loop, three things change:
          </p>
          <ul className="mt-3 grid gap-3 text-sm leading-relaxed md:grid-cols-3">
            <li className="rounded-lg bg-muted/60 p-3">
              <span className="font-semibold">It spends the reps&apos; budget.</span> One run is {EVAL_SUITE.length} × {thousands(perQuestion)} ={" "}
              {thousands(EVAL_SUITE.length * perQuestion)} tokens: about {minutes(EVAL_SUITE.length * perQuestion)} minutes of an assumed{" "}
              {thousands(DEFAULT_PARAMS.tpm)}-token-per-minute limit ({minutes(EVAL_SUITE.length * trimmedPerQuestion)} minutes with smaller prompts). Send it
              through the retry queue on a separate key or project, or off-peak, so it cannot starve live reps.
            </li>
            <li className="rounded-lg bg-muted/60 p-3">
              <span className="font-semibold">Answers can vary run to run.</span> Use temperature 0 for the test, and ask each off-method question once more
              before blocking (<code className="rounded bg-background px-1 font-mono text-[13px]">--recheck</code>), so one unlucky sample does not stop a good publish.
            </li>
            <li className="rounded-lg bg-muted/60 p-3">
              <span className="font-semibold">The key must be there at build time.</span> On Replit, the deployment&apos;s secrets need to be available to
              the build step that runs the test.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
