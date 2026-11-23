"use client";

import { BookOpen, CircleHelp, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
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
  { label: "How do I confirm who does what before we hang up?", note: "retrieval" },
  { label: "What's the best CRM for a small team?", note: "no match" },
];

const PATH_LABEL: Record<CoachAnswer["path"], string> = {
  "answer-bank": "Answer bank",
  retrieval: "Retrieval",
  "no-match": "No approved line",
};

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
  const abortRef = useRef<AbortController | null>(null);

  async function ask(text: string) {
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
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ question: trimmed, paraphrase }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`The coach could not answer (${response.status}).`);
      for await (const message of readSSE(response.body)) {
        if (message.event === "route") setRoute(JSON.parse(message.data) as Pick<CoachAnswer, "path" | "bank">);
        else if (message.event === "delta") {
          const { text: piece } = JSON.parse(message.data) as { text: string };
          setStreamed((prev) => prev + piece);
        } else if (message.event === "done") {
          const final = JSON.parse(message.data) as CoachAnswer;
          setAnswer(final);
          setStreamed(final.text);
          recordLocalRun({ kind: "ask", label: trimmed, total: 1, failed: 0, detail: `${PATH_LABEL[final.path]}${final.quote ? ` · ${final.quote.lineId}` : ""}${final.guard.action === "restored-exact-line" ? " · paraphrase caught" : ""}` });
        } else if (message.event === "run_error") throw new Error("The coach stopped before finishing. Try again.");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const shown = answer ?? null;

  return (
    <div id="ask-grid" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section aria-labelledby="ask-title" className="space-y-5">
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
            className="mt-3 min-h-24 text-base"
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

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Try one</h3>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <li key={example.label}>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion(example.label);
                    void ask(example.label);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  {example.label}
                  <span className="text-xs text-muted-foreground">{example.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {library}
      </section>

      <section aria-labelledby="answer-title" aria-live="polite" aria-busy={loading} className="space-y-4">
        <div className="rounded-xl border bg-background p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="answer-title" className="text-base font-semibold">
              Coach answer {isExample ? <span className="font-normal text-muted-foreground">(example)</span> : null}
            </h2>
            {route ? (
              <Badge variant={route.path === "no-match" ? "outline" : "secondary"} className="gap-1.5">
                {route.path === "answer-bank" ? <BookOpen aria-hidden /> : route.path === "retrieval" ? <Search aria-hidden /> : <CircleHelp aria-hidden />}
                {PATH_LABEL[route.path]}
                {route.bank ? ` · ${route.bank.id}` : ""}
              </Badge>
            ) : null}
          </div>
          {error ? (
            <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn" role="alert">
              {error}
            </p>
          ) : null}
          {!error && (streamed || loading) ? (
            <div className="mt-4">
              {shown?.question || question ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Rep:</span> {shown?.question ?? question}
                </p>
              ) : null}
              <blockquote
                className={cn(
                  "mt-3 border-l-4 pl-4 text-lg leading-relaxed text-pretty",
                  (route?.path ?? shown?.path) === "no-match" ? "border-muted text-muted-foreground" : "border-primary font-medium",
                )}
              >
                {streamed || <span className="text-muted-foreground">…</span>}
              </blockquote>
              {shown?.quote ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  <span className="font-mono text-xs font-medium text-foreground">{shown.quote.lineId}</span> · {shown.quote.documentTitle} v{shown.quote.documentVersion}, “
                  {shown.quote.sectionTitle}”
                  {shown.bank ? ` · approved by ${shown.bank.approvedBy} on ${shown.bank.approvedOn}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {shown?.followUp ? (
            <div className="mt-5 border-t pt-4">
              <Button variant="outline" aria-expanded={showWhy} aria-controls="why-text" onClick={() => setShowWhy((v) => !v)}>
                <Sparkles aria-hidden />
                {shown.followUp.prompt}
              </Button>
              {showWhy ? (
                <p id="why-text" className="mt-3 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
                  {shown.followUp.why}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {shown && shown.path !== "no-match" ? <GuardCard answer={shown} /> : null}
        {shown ? <Trace answer={shown} /> : null}
      </section>
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
            ? "The model's draft did not contain the source line word for word, so the rep got the approved line instead. This also raises an info alert in monitoring."
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
  return (
    <details className="group rounded-xl border bg-background p-4 sm:p-5" open>
      <summary className="cursor-pointer text-sm font-semibold">How it was answered</summary>
      <div className="mt-3 space-y-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Terms after normalizing</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {trace.terms.length ? trace.terms.map((term, i) => (
              <code key={`${term}-${i}`} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {term}
              </code>
            )) : <span className="text-muted-foreground">none</span>}
          </p>
          {trace.corrections.length ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Typos fixed: {trace.corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}
            </p>
          ) : null}
        </div>
        {trace.bankDecision !== "skipped" ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              1. Answer bank (threshold {trace.threshold}):{" "}
              <span className="text-foreground">
                {trace.bankDecision === "matched" ? "matched" : trace.bankDecision === "ambiguous" ? "two entries too close, so it falls back" : "nothing above threshold, so it falls back"}
              </span>
            </p>
            <table className="mt-1.5 w-full text-xs">
              <caption className="sr-only">Top answer-bank candidates</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 font-medium">Entry</th>
                  <th scope="col" className="py-1 font-medium">Keyword</th>
                  <th scope="col" className="py-1 font-medium">Similarity</th>
                  <th scope="col" className="py-1 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {trace.bankCandidates.slice(0, 3).map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-1.5 pr-2">
                      <span className="font-mono">{c.id}</span> {c.intent}
                    </td>
                    <td className="py-1.5">{c.keywordHit ? "hit" : "–"}</td>
                    <td className="py-1.5 tabular">{c.similarity.toFixed(2)}</td>
                    <td className={cn("py-1.5 text-right font-semibold tabular", c.score >= trace.threshold ? "text-ok" : "text-muted-foreground")}>{c.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {answer.path !== "answer-bank" ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              2. Line search over current documents:{" "}
              <span className="text-foreground">{answer.path === "retrieval" ? `best line ${answer.quote?.lineId}` : "no line matched enough terms, so the coach declines"}</span>
            </p>
            {trace.retrieved.length ? (
              <ul className="mt-1.5 space-y-1">
                {trace.retrieved.slice(0, 3).map((r) => (
                  <li key={r.lineId} className="flex gap-2 border-t pt-1.5 text-xs">
                    <span className="w-14 shrink-0 font-mono">{r.lineId}</span>
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
