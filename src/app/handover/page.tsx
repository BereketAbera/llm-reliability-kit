import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/site/page-header";
import { ANSWER_BANK } from "@/lib/content/answer-bank";
import { CATALOG } from "@/lib/content/catalog";
import { EVAL_SUITE, EVAL_THRESHOLD } from "@/lib/content/eval-suite";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Handover notes" };

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-xl border bg-background p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 max-w-[68ch] space-y-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]";

export default function HandoverPage() {
  return (
    <>
      <PageHeader eyebrow="Plain-language handover" title="Handover notes">
        <p>
          What the README says, written for the person who owns the content: how it is loaded, how to add or approve a document, and how to run the
          test. Engineering detail lives in the README and on <Link className="font-medium text-primary underline underline-offset-4" href="/how-it-works">How it works</Link>.
        </p>
      </PageHeader>
      <div className="space-y-6">
        <Block id="loaded" title="How the content is loaded">
          <p>
            Every training document lives in one library ({CATALOG.documents.length} current documents and {CATALOG.scripts.length} approved lines in
            this demo). Each document has a name, a version number and a status: draft, approved or superseded.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Only the newest approved version of each document is ever searched. Older versions stay for history and are never used in answers.</li>
            <li>
              Each section starts with one line that explains why the method works, then the exact lines to say or write. Every line has a permanent ID,
              such as <span className={code}>OBJ-1.2</span>, and every answer shows which line it used.
            </li>
            <li>
              On your app the library is in Postgres. The database itself refuses two approved versions of the same document, so there is always exactly
              one current version.
            </li>
          </ul>
        </Block>

        <Block id="add" title="How to add or approve a document">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Add the new document, or the new version of an existing one, as a draft. Drafts are never shown to reps.</li>
            <li>Read it through in the draft view. Each line that reps should say word for word goes in as its own line.</li>
            <li>
              Approve it. Approving marks the previous version as superseded in the same step, so there is never a moment with two current versions.
            </li>
            <li>Run the 30-question test (below). If the score drops, the new wording changed an answer reps relied on: check it before publishing.</li>
          </ol>
          <p>
            In this demo the library is a code file (<span className={code}>src/lib/content/library.ts</span>): adding a{" "}
            <span className={code}>defineDocument</span> entry to its one list is all it takes, and the README has the exact steps.
          </p>
        </Block>

        <Block id="bank" title="How to add an approved answer">
          <p>
            The answer bank holds the trainer&apos;s approved answers to the most common questions ({ANSWER_BANK.length} in this demo). An entry points
            at a line in the library by its ID, so the wording always comes from the approved document. To add one, pick the line, add a few ways reps
            ask for it, and run the test. Never paste the test questions themselves into the bank: the test would then only measure that it can recognise
            its own questions, and a check stops it.
          </p>
        </Block>

        <Block id="test" title="How to run the test">
          <p>
            The test asks the coach {EVAL_SUITE.length} questions (on your app, the 30 you already use) and checks that each answer contains the
            approved line word for word. It also asks reworded questions it has never seen and off-topic questions it should decline.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Run it with <span className={code}>pnpm eval</span>. It prints every question, the line used, and the decision.
            </li>
            <li>
              Publishing stops if the score falls below {EVAL_THRESHOLD} out of {EVAL_SUITE.length}, drops from the last approved run, or if more
              questions get a wrong approved line than before.
            </li>
            <li>
              On Replit the test runs inside the publish build, so pressing Publish cannot ship a change that fails it. After an approved change, record
              the new score with <span className={code}>pnpm eval --update-baseline</span>.
            </li>
            <li>
              A separate check fails the build if any approved line can no longer be found by the search: the &ldquo;content silently blocked&rdquo;
              kind of bug.
            </li>
          </ul>
        </Block>

        <Block id="start" title="What I need to start">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>A log export with one failed request, headers included, to see which limit the 429s hit and whose key it is.</li>
            <li>Your 30 test questions and the lines a good answer must use.</li>
            <li>Access to the Replit project, and which key the AI integration uses.</li>
          </ul>
        </Block>
      </div>
    </>
  );
}
