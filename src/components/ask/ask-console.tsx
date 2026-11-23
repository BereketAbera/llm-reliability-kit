"use client";

import { BookOpen, ChevronDown, ChevronRight, CircleHelp, Flag, ListTree, Loader2, RotateCw, Search, ShieldCheck, Split } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CoachAnswer } from "@/lib/coach/coach";
import { recordLocalRun } from "@/lib/local-runs";
import { readSSE } from "@/lib/reliability/sse";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  { label: "They say our price is too high", note: "answer bank" },
  { label: "She needs to run it by her boss first", note: "answer bank" },
  { label: "pirce is to hihg", note: "typos" },
  { label: "What should I say when I get their voicemail?", note: "retrieval" },
  { label: "How do I close a sale?", note: "asks which one" },
  { label: "What's the best CRM for a small team?", note: "no match" },
];

const PATH_LABEL: Record<CoachAnswer["path"], string> = {
  "answer-bank": "Answer bank",
  retrieval: "Retrieval",
  clarify: "Which one?",
  "no-match": "No approved line",
};

const CALM_ERROR = "The coach didn't answer this time. Your question is still here.";
const INTERRUPTED = "The answer was interrupted. Tap Try again.";

class InterruptedError extends Error {}

function parse<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    throw new InterruptedError("A piece of the answer arrived damaged");
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** POST once more after a short, jittered pause if the server is busy (429) or briefly unavailable (503). */
async function postWithRetry(url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
    if ((response.status === 429 || response.status === 503) && attempt === 0) {
      const hinted = Number(response.headers.get("retry-after")) * 1000;
      await sleep(Math.min(3_000, hinted > 0 ? hinted : 600) + Math.random() * 400, signal);
      continue;
    }
    return response;
  }
}

/** Approved lines keep their [fill-in] slots; they are styled so they read as slots, not as a template that failed. */
function withSlots(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <span key={index} className="font-normal whitespace-nowrap text-muted-foreground underline decoration-dashed underline-offset-4">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function AskConsole({ initialAnswer, library }: { initialAnswer: CoachAnswer; library?: ReactNode }) {
  const [question, setQuestion] = useState("");
  const [paraphrase, setParaphrase] = useState(false);
  const [answer, setAnswer] = useState<CoachAnswer | null>(initialAnswer);
  const [streamed, setStreamed] = useState(initialAnswer.text);
  const [route, setRoute] = useState<Pick<CoachAnswer, "path" | "bank"> | null>({ path: initialAnswer.path, bank: initialAnswer.bank });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [isExample, setIsExample] = useState(true);
  const [flagged, setFlagged] = useState(false);
  const [lastAsk, setLastAsk] = useState<{ question: string; pick?: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** On a phone the answer sits below the form: bring it into view when the rep asks. */
  function revealAnswer() {
    const node = answerRef.current;
    if (!node) return;
    const { top } = node.getBoundingClientRect();
    if (top > window.innerHeight * 0.6 || top < 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  }

  async function ask(text: string, pick?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setRoute(null);
    setStreamed("");
    setShowWhy(false);
    setIsExample(false);
    setFlagged(false);
    setLastAsk({ question: trimmed, pick });
    setAnnouncement("Finding the approved line.");
    requestAnimationFrame(revealAnswer);
    try {
      const response = await postWithRetry(paraphrase ? "/api/demo/ask" : "/api/ask", { question: trimmed, pick, ...(paraphrase ? { paraphrase: true } : {}) }, controller.signal);
      if (!response.ok || !response.body) {
        console.warn(`Coach request failed with HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }
      let final: CoachAnswer | null = null;
      for await (const message of readSSE(response.body)) {
        if (message.event === "route") setRoute(parse<Pick<CoachAnswer, "path" | "bank">>(message.data));
        else if (message.event === "delta") {
          const { text: piece } = parse<{ text: string }>(message.data);
          setStreamed((prev) => prev + piece);
        } else if (message.event === "done") final = parse<CoachAnswer>(message.data);
        else if (message.event === "run_error") throw new InterruptedError("The server stopped the answer");
      }
      // Never show a cut-off line as if it were the answer.
      if (!final) throw new InterruptedError("The stream ended before the answer was complete");
      setAnswer(final);
      setStreamed(final.text);
      setAnnouncement(final.path === "no-match" ? "No approved line for that question." : final.path === "clarify" ? "Two approved lines could fit. Pick one." : "Answer ready.");
      recordLocalRun({
        kind: "ask",
        label: trimmed,
        total: 1,
        failed: 0,
        paraphraseCaught: final.guard.action === "restored-exact-line" || undefined,
        detail: `${PATH_LABEL[final.path]}${final.quote ? ` · ${final.quote.lineId}` : ""}${final.guard.action === "restored-exact-line" ? " · paraphrase caught" : ""}`,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("Coach answer failed", err);
      setStreamed("");
      setRoute(null);
      setAnswer(null);
      const text = err instanceof InterruptedError ? INTERRUPTED : CALM_ERROR;
      setError(text);
      setAnnouncement(text);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const flag = () => {
    if (!answer) return;
    recordLocalRun({ kind: "flag", label: answer.question, total: 1, failed: 0, detail: "Flagged for the trainer: no approved line yet" });
    setFlagged(true);
  };

  const shown = answer;
  const path = route?.path ?? shown?.path;

  return (
    <div id="ask-grid" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:grid-rows-[auto_1fr]">
      <section aria-labelledby="ask-title" className="min-w-0 lg:col-start-1 lg:row-start-1">
        <form onSubmit={onSubmit} className="rounded-xl border bg-background p-4 sm:p-5">
          <h2 id="ask-title" className="sr-only">
            Ask a question
          </h2>
          <Label htmlFor="question" className="text-base font-semibold">
            What is happening on your call?
          </Label>
          <p id="question-help" className="mt-1 text-sm text-muted-foreground">
            Ask like a rep would. Common questions hit the answer bank; anything else searches the library for the exact line.
          </p>
          <Textarea
            id="question"
            aria-describedby="question-help"
            className="mt-3 min-h-24 text-base [overflow-wrap:anywhere]"
            placeholder="e.g. They said they need to think it over"
            value={question}
            maxLength={400}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch id="paraphrase" checked={paraphrase} onCheckedChange={setParaphrase} />
              <Label htmlFor="paraphrase" className="text-sm font-normal">
                Simulate a model that rewrites retrieved lines
              </Label>
            </div>
            <Button type="submit" size="lg" disabled={loading || !question.trim()}>
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              Ask the coach
            </Button>
          </div>
        </form>
      </section>

      <section
        ref={answerRef}
        id="answer"
        aria-labelledby="answer-title"
        aria-busy={loading}
        className="min-w-0 scroll-mt-20 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        <div className="rounded-xl border bg-background p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="answer-title" className="text-base font-semibold">
              Coach answer {isExample ? <span className="font-normal text-muted-foreground">(example)</span> : null}
            </h2>
            {route ? (
              <Badge variant={route.path === "no-match" || route.path === "clarify" ? "outline" : "secondary"} className="gap-1.5">
                {route.path === "answer-bank" ? <BookOpen aria-hidden /> : route.path === "retrieval" ? <Search aria-hidden /> : route.path === "clarify" ? <Split aria-hidden /> : <CircleHelp aria-hidden />}
                {PATH_LABEL[route.path]}
                {route.bank ? ` · ${route.bank.id}` : ""}
              </Badge>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn" role="alert">
              <p className="font-medium">{error}</p>
              {lastAsk ? (
                <Button variant="outline" className="mt-3 bg-background text-foreground" onClick={() => void ask(lastAsk.question, lastAsk.pick)} disabled={loading}>
                  <RotateCw aria-hidden /> Try again
                </Button>
              ) : null}
            </div>
          ) : null}

          {!error && loading && !streamed ? (
            <div className="mt-4" aria-hidden>
              <p className="text-sm text-muted-foreground">Finding the approved line…</p>
              <div className="mt-3 space-y-2 border-l-4 border-muted pl-4">
                <div className="h-4 w-11/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </div>
            </div>
          ) : null}

          {!error && streamed ? (
            <div className="mt-4">
              {shown?.question || lastAsk ? (
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="font-medium text-foreground">Rep:</span> {shown?.question ?? lastAsk?.question}
                </p>
              ) : null}
              <blockquote
                className={cn(
                  "mt-3 border-l-4 pl-4 text-lg leading-relaxed text-pretty [overflow-wrap:anywhere]",
                  path === "no-match" || path === "clarify" ? "border-muted text-muted-foreground" : "border-primary font-medium",
                )}
              >
                {path === "no-match" || path === "clarify" ? streamed : withSlots(streamed)}
              </blockquote>
              {shown?.quote ? (
                <>
                  {/\[[^\]]+\]/.test(shown.quote.text) ? <p className="mt-2 text-xs text-muted-foreground">Fill in the bracketed parts.</p> : null}
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground">{shown.quote.lineId}</span> · {shown.quote.documentTitle} v
                    {shown.quote.documentVersion}, “{shown.quote.sectionTitle}”
                    {shown.bank ? ` · approved by ${shown.bank.approvedBy} on ${shown.bank.approvedOn}` : ""}
                    {shown.chosen ? " · picked by the rep" : ""}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {shown?.path === "clarify" && shown.options ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Which situation is it?">
              {shown.options.map((option) => (
                <button
                  key={option.lineId}
                  type="button"
                  onClick={() => void ask(shown.question, option.lineId)}
                  className="rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary hover:bg-muted/60"
                >
                  <span className="block font-medium">{option.sectionTitle}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.documentTitle} · <span className="font-mono whitespace-nowrap">{option.lineId}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {shown?.path === "no-match" && !isExample ? (
            <div className="mt-4 border-t pt-4">
              {flagged ? (
                <p className="text-sm font-medium text-ok" role="status">
                  Flagged: it now appears in the trainer&apos;s review queue on Monitoring (kept in this browser for the demo).
                </p>
              ) : (
                <Button variant="outline" onClick={flag}>
                  <Flag aria-hidden /> Flag for the trainer
                </Button>
              )}
            </div>
          ) : null}

          {shown?.followUp ? (
            <div className="mt-5 border-t pt-4">
              <Button variant="outline" aria-expanded={showWhy} aria-controls="why-text" onClick={() => setShowWhy((v) => !v)}>
                <ChevronDown className={cn("transition-transform motion-reduce:transition-none", showWhy && "rotate-180")} aria-hidden />
                {showWhy ? "Hide why it works" : shown.followUp.prompt}
              </Button>
              {showWhy ? (
                <p id="why-text" className="mt-3 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
                  {shown.followUp.why}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {shown && (shown.path === "answer-bank" || shown.path === "retrieval") ? <GuardCard answer={shown} /> : null}
        {shown ? <Trace answer={shown} /> : null}
      </section>

      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Try one</h3>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <li key={example.label} className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setQuestion(example.label);
                    void ask(example.label);
                  }}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">{example.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{example.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {library}
      </div>
    </div>
  );
}

function GuardCard({ answer }: { answer: CoachAnswer }) {
  const restored = answer.guard.action === "restored-exact-line";
  const bank = answer.path === "answer-bank";
  return (
    <div className={cn("rounded-xl border p-4 sm:p-5", restored ? "border-warn/40 bg-warn-soft" : "bg-background")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className={cn("size-4", restored ? "text-warn" : "text-ok")} aria-hidden />
        Verbatim check: {restored ? "paraphrase caught, approved line restored" : "passed"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {bank
          ? "Answer-bank replies are returned exactly as stored and never pass through the model, so there is nothing to paraphrase."
          : restored
            ? "The model's draft did not contain the source line word for word, so the rep got the approved line instead. It is logged; in production it raises an info alert (Monitoring lists it under this browser's runs)."
            : "The answer contains the source line word for word."}
      </p>
      {restored && answer.guard.modelDraft ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">Model draft (not shown to the rep):</span> <span className="text-muted-foreground line-through">{answer.guard.modelDraft}</span>
        </p>
      ) : null}
    </div>
  );
}

function Trace({ answer }: { answer: CoachAnswer }) {
  const { trace } = answer;
  const bankShared = trace.bankCandidates.some((c) => c.score > 0);
  return (
    <details className="group rounded-xl border bg-background p-4 sm:p-5" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        <ListTree className="size-4 text-muted-foreground" aria-hidden />
        How it was answered
      </summary>
      <div className="mt-3 space-y-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Search stems (the words the search uses, shortened to their stem)</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {trace.terms.length ? (
              trace.terms.map((term, i) =>
                trace.content.includes(term) ? (
                  <code key={`${term}-${i}`} className="rounded bg-muted px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]">
                    {term}
                  </code>
                ) : (
                  <code key={`${term}-${i}`} title="Too common to count as evidence" className="rounded border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {term}
                    <span className="sr-only"> (too common to count)</span>
                  </code>
                ),
              )
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </p>
          {trace.terms.some((term) => !trace.content.includes(term)) ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Dashed stems are too common to count as evidence.</p>
          ) : null}
          {trace.corrections.length ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Typos fixed (nothing matched as typed): {trace.corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}</p>
          ) : null}
        </div>
        {trace.bankDecision !== "skipped" ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              1. Answer bank (threshold {trace.threshold}):{" "}
              <span className="text-foreground">
                {trace.bankDecision === "matched" ? "matched" : trace.bankDecision === "ambiguous" ? "two entries too close, so the coach asks which one" : "nothing above threshold, so it falls back"}
              </span>
            </p>
            {bankShared ? (
              <table className="mt-1.5 w-full text-xs">
                <caption className="sr-only">Top answer-bank candidates</caption>
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">Entry</th>
                    <th scope="col" className="hidden py-1 pr-3 font-medium sm:table-cell">Keyword</th>
                    <th scope="col" className="hidden py-1 pr-3 font-medium sm:table-cell">Similarity</th>
                    <th scope="col" className="py-1 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.bankCandidates.slice(0, 3).map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-1.5 pr-3">
                        <span className="font-mono whitespace-nowrap">{c.id}</span> {c.intent}
                      </td>
                      <td className="hidden py-1.5 pr-3 sm:table-cell">{c.keywordHit ? "hit" : "–"}</td>
                      <td className="hidden py-1.5 pr-3 tabular sm:table-cell">{c.similarity.toFixed(2)}</td>
                      <td className={cn("py-1.5 text-right font-semibold tabular", c.score >= trace.threshold ? "text-ok" : "text-muted-foreground")}>{c.score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No answer-bank entry shares a word with this question.</p>
            )}
          </div>
        ) : null}
        {answer.path !== "answer-bank" && trace.retrievalDecision !== "skipped" ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              2. Line search over current documents:{" "}
              <span className="text-foreground">
                {answer.chosen
                  ? `the rep picked ${answer.quote?.lineId}`
                  : trace.retrievalDecision === "answer"
                    ? `best line ${answer.quote?.lineId}`
                    : trace.retrievalDecision === "clarify"
                      ? `${trace.retrievalReason.toLowerCase()}, so the coach asks which one`
                      : `${trace.retrievalReason.toLowerCase()}, so the coach declines`}
              </span>
            </p>
            {trace.retrieved.length ? (
              <ul className="mt-1.5 space-y-1">
                {trace.retrieved.slice(0, 3).map((r) => (
                  <li key={r.lineId} className="flex gap-2 border-t pt-1.5 text-xs">
                    <span className="w-16 shrink-0 font-mono whitespace-nowrap">{r.lineId}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={r.preview}>
                      {r.preview}
                    </span>
                    <span className="shrink-0 tabular">{r.score.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
