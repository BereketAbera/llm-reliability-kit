import type { Metadata } from "next";
import { AskConsole } from "@/components/ask/ask-console";
import { PageHeader } from "@/components/site/page-header";
import { Badge } from "@/components/ui/badge";
import { answerQuestion } from "@/lib/coach/coach";
import { ANSWER_BANK } from "@/lib/content/answer-bank";
import { CATALOG, validateLibrary } from "@/lib/content/catalog";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Ask the coach" };

export default function AskPage() {
  const example = answerQuestion("They say our price is too high");
  const issues = validateLibrary();
  return (
    <>
      <PageHeader eyebrow="Exact lines · answer bank first" title="Ask the coach">
        <p>
          Common rep questions are answered from a bank of {ANSWER_BANK.length} approved answers, word for word, followed by one offer:
          &ldquo;Want to know why this works?&rdquo; Everything else falls back to search over the training documents and returns the exact source
          line with its citation. If nothing approved fits, the coach says so instead of giving generic advice.
        </p>
      </PageHeader>
      <AskConsole
        initialAnswer={example}
        library={
          <section aria-labelledby="library-title" className="rounded-xl border bg-background p-4 sm:p-5">
            <h2 id="library-title" className="text-base font-semibold">
              Document library
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {CATALOG.documents.length} current documents · {CATALOG.scripts.length} approved lines · {CATALOG.excluded.length} superseded version excluded ·{" "}
              {issues.length === 0 ? "no duplicates" : `${issues.length} issues`}
            </p>
            <ul className="mt-3 divide-y text-sm">
              {[...CATALOG.documents, ...CATALOG.excluded].map((doc) => {
                const current = CATALOG.documents.includes(doc);
                return (
                  <li key={`${doc.slug}-${doc.version}`} className={current ? "flex items-center justify-between gap-3 py-2" : "flex items-center justify-between gap-3 py-2 text-muted-foreground"}>
                    <span className="min-w-0">
                      <span className="font-medium">{doc.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {doc.sections.length} sections · {doc.code} · approved {doc.approvedOn}
                        {current ? "" : " · never searched"}
                      </span>
                    </span>
                    <Badge variant={current ? "secondary" : "outline"} className="shrink-0">
                      {current ? `v${doc.version} current` : `v${doc.version} superseded`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        }
      />
    </>
  );
}
