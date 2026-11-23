import { readRepoFile } from "@/lib/excerpts";

/**
 * One minute of token budget: why exactly one request in three gets a 429, and
 * what the retry queue and smaller prompts change. design/token_budget.py draws
 * public/diagrams/token-budget.svg (design/build.sh); it is inlined at build time
 * so the labels use the page's font. Its <title> and <desc> are the text alternative.
 */
export function TokenBudgetFigure({ caption }: { caption: string }) {
  const file = readRepoFile("public/diagrams/token-budget.svg");
  const svg = file.slice(file.indexOf("<svg"));
  return (
    <figure className="max-w-[380px]">
      <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full [&>svg]:font-sans" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mt-2 text-sm leading-relaxed text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
