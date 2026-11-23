"use client";

import { CircleCheck, CircleX, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EvalReport, EvalRow, EvalRun, GateDecision } from "@/lib/coach/eval";
import type { EvalSetKey } from "@/lib/content/eval-suite";
import { cn } from "@/lib/utils";

interface PipelineView {
  key: string;
  label: string;
  description: string;
  run: EvalRun;
  decision: GateDecision;
}

type Filter = "all" | "pass" | "fail";

const SETS: Array<{ key: EvalSetKey; label: string; runKey: keyof EvalRun }> = [
  { key: "suite", label: "30-question suite", runKey: "suite" },
  { key: "held-out", label: "Held-out phrasings", runKey: "heldOut" },
  { key: "decline", label: "Should be declined", runKey: "decline" },
];

const PATH_LABEL: Record<EvalRow["path"], string> = { "answer-bank": "Answer bank", retrieval: "Retrieval", clarify: "Asked which one", "no-match": "Declined" };

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />}
      <span className="sr-only">{ok ? "Passed:" : "Failed:"}</span>
      <span>{children}</span>
    </li>
  );
}

function Result({ row }: { row: EvalRow }) {
  const tone = row.onMethod ? "text-ok" : row.outcome === "wrong-line" ? "text-bad" : "text-warn";
  const label = row.onMethod
    ? row.expected.length
      ? "On method"
      : row.outcome === "asked"
        ? "Asked, no line"
        : "Declined"
    : row.outcome === "wrong-line"
      ? "Wrong line"
      : row.outcome === "asked"
        ? "Asked which one"
        : row.outcome === "no-line"
          ? "Declined"
          : "Not word for word";
  return (
    <span className={cn("flex items-start gap-1.5", tone)}>
      {row.onMethod ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{row.reason}</span>
      </span>
    </span>
  );
}

const answered = (row: EvalRow) => row.answeredLineId ?? (row.options ? row.options.join(" or ") : "–");

export function EvalBoard({ pipelines, baseline }: { pipelines: PipelineView[]; baseline: { score: number; wrongLines: number } }) {
  const [views, setViews] = useState(pipelines);
  const [selected, setSelected] = useState("current");
  const [set, setSet] = useState<EvalSetKey>("suite");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string } | null>(null);

  const view = views.find((v) => v.key === selected) ?? views[0];
  const suite = view.run.suite;
  const report: EvalReport = view.run[SETS.find((s) => s.key === set)!.runKey];
  const rows = report.rows.filter((row) => (filter === "all" ? true : filter === "pass" ? row.onMethod : !row.onMethod));
  const failing = report.rows.filter((row) => !row.onMethod).length;
  const passLabel = set === "decline" ? "Declined" : "On method";
  const failLabel = set === "decline" ? "Answered anyway" : "Off method";

  async function rerun(key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/eval?pipeline=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { run: EvalRun; decision: GateDecision; ranAt: string; ms: number };
      setViews((prev) => prev.map((v) => (v.key === key ? { ...v, run: data.run, decision: data.decision } : v)));
      setSelected(key);
      setRanAt(`${new Date(data.ranAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (${data.ms} ms on the server)`);
    } catch (err) {
      console.warn("Eval re-run failed", err);
      setError({ key });
    } finally {
      setBusy(null);
    }
  }

  const drop = suite.score < baseline.score;
  const moreWrong = view.decision.wrongLines > baseline.wrongLines;

  return (
    <div className="space-y-8">
      <section aria-labelledby="score-title" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <div className="rounded-xl border bg-background p-5">
          <h2 id="score-title" className="text-base font-semibold">
            Gate decision
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{view.label}</p>
          <p className="mt-3 text-5xl font-semibold tracking-tight tabular">
            {suite.score}
            <span className="text-2xl text-muted-foreground">/{suite.total}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">answers fully on method</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", view.decision.publish ? "bg-ok" : "bg-bad")} style={{ width: `${(suite.score / suite.total) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            <Check ok={suite.score >= suite.threshold}>
              {suite.score >= suite.threshold ? `At or above the threshold (${suite.threshold}/${suite.total})` : `Below the threshold of ${suite.threshold}/${suite.total}`}
            </Check>
            <Check ok={!drop}>{drop ? `Dropped from ${baseline.score} to ${suite.score}` : `Same or better than the last approved score (${baseline.score})`}</Check>
            <Check ok={!moreWrong}>
              {moreWrong ? `Wrong-line answers rose from ${baseline.wrongLines} to ${view.decision.wrongLines}` : `No more wrong-line answers than last time (${view.decision.wrongLines})`}
            </Check>
          </ul>
          <p className={cn("mt-4 rounded-lg px-3 py-2 text-sm font-medium", view.decision.publish ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")} role="status">
            {view.decision.publish ? "Gate: publish allowed" : `Gate: publish blocked. ${view.decision.reasons.join(". ")}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void rerun("current")} disabled={busy !== null}>
              {busy === "current" ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCw aria-hidden />}
              Re-run now
            </Button>
            <Button variant="outline" onClick={() => void rerun("paraphrase-no-guard")} disabled={busy !== null}>
              {busy === "paraphrase-no-guard" ? <Loader2 className="animate-spin" aria-hidden /> : <TriangleAlert aria-hidden />}
              Try a bad change
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {ranAt ? `Last run ${ranAt}.` : "Scored when this page was built."} Re-run calls /api/eval, which runs every question through the live coach code.
          </p>
          {error ? (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn sm:flex-row sm:items-center sm:justify-between" role="alert">
              <p className="font-medium">Re-run didn&apos;t finish. The scores shown are from the last good run.</p>
              <Button variant="outline" size="sm" className="shrink-0 bg-background text-foreground" onClick={() => void rerun(error.key)} disabled={busy !== null}>
                <RotateCw aria-hidden /> Retry
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border bg-background p-5">
          <h2 className="text-base font-semibold">Each change, measured</h2>
          <p className="mt-1 text-sm text-muted-foreground">Same questions, same scorer, three versions of the pipeline. Select one to see its answers.</p>
          <ul className="mt-4 space-y-3">
            {views.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => setSelected(v.key)}
                  aria-pressed={selected === v.key}
                  className={cn("w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60", selected === v.key && "border-primary ring-1 ring-primary")}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{v.label}</span>
                    <span className={cn("shrink-0 font-semibold tabular", v.decision.publish ? "text-ok" : "text-bad")}>
                      {v.run.suite.score}/{v.run.suite.total}
                    </span>
                  </span>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className={cn("block h-full rounded-full", v.decision.publish ? "bg-ok" : "bg-bad")} style={{ width: `${(v.run.suite.score / v.run.suite.total) * 100}%` }} />
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {v.description}{" "}
                    <span className={cn("font-medium", v.decision.publish ? "text-ok" : "text-bad")}>
                      {v.decision.publish ? "Gate passes." : `Gate blocks it: ${v.decision.reasons.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")}.`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-background p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Beyond the 30: held-out phrasings and questions to decline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A reviewer wrote these after the bank was built; nothing in the bank was copied from them. They show how the coach behaves on wording it
            has not seen. Not answering is fine here; a wrong approved line is the failure that counts.
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="font-medium">Held-out phrasings</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">
                {view.run.heldOut.score}
                <span className="text-base text-muted-foreground">/{view.run.heldOut.total} on method</span>
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                {view.run.heldOut.outcomes.asked} asked which one ({view.run.heldOut.askedWithRightOption} offered the right line) · {view.run.heldOut.outcomes["no-line"]} declined ·{" "}
                <span className={cn("font-medium", view.run.heldOut.outcomes["wrong-line"] ? "text-bad" : "text-ok")}>{view.run.heldOut.outcomes["wrong-line"]} wrong line</span>
                {view.run.heldOut.outcomes["not-verbatim"] ? ` · ${view.run.heldOut.outcomes["not-verbatim"]} not word for word` : ""}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="font-medium">Should be declined</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">
                {view.run.decline.score}
                <span className="text-base text-muted-foreground">/{view.run.decline.total} declined</span>
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                Off-topic and near-miss questions ·{" "}
                <span className={cn("font-medium", view.run.decline.outcomes["wrong-line"] ? "text-bad" : "text-ok")}>{view.run.decline.outcomes["wrong-line"]} answered with a line</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="questions-title">
        <div className="mb-3 flex flex-col gap-3">
          <h2 id="questions-title" className="text-xl font-semibold tracking-tight">
            Every question and answer
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div role="group" aria-label="Question set" className="inline-flex w-fit flex-wrap rounded-lg bg-muted p-[3px]">
              {SETS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={set === s.key}
                  onClick={() => {
                    setSet(s.key);
                    setFilter("all");
                  }}
                  className={cn("rounded-md px-2.5 py-1 text-sm font-medium text-foreground/70 hover:text-foreground", set === s.key && "bg-background text-foreground shadow-sm")}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Filter questions" className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
              {(
                [
                  ["all", `All ${report.total}`],
                  ["pass", `${passLabel} ${report.score}`],
                  ["fail", `${failLabel} ${failing}`],
                ] as Array<[Filter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn("rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap text-foreground/70 hover:text-foreground", filter === key && "bg-background text-foreground shadow-sm")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Phones: one card per question, result first. */}
        <ul className="space-y-2 sm:hidden" aria-label={`Results for ${view.label}`}>
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border bg-background p-3 text-sm">
              <p className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{row.question}</span>
              </p>
              <div className="mt-2">
                <Result row={row} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {PATH_LABEL[row.path]} · <span className="font-mono whitespace-nowrap">{answered(row)}</span>
                {row.expected.length ? (
                  <>
                    {" "}
                    · expected <span className="font-mono whitespace-nowrap">{row.expected.join(", ")}</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
          {rows.length === 0 ? <li className="rounded-xl border bg-background p-4 text-center text-sm text-muted-foreground">Nothing in this filter.</li> : null}
        </ul>

        <div className="hidden rounded-xl border bg-background sm:block">
          <table className="w-full table-fixed text-sm">
            <caption className="sr-only">
              {SETS.find((s) => s.key === set)!.label}: results for {view.label}
            </caption>
            <colgroup>
              <col className="w-14" />
              <col />
              <col className="w-28" />
              <col className="w-44" />
              <col className="w-[34%]" />
            </colgroup>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">#</th>
                <th scope="col" className="px-3 py-2 font-medium">Rep question</th>
                <th scope="col" className="px-3 py-2 font-medium">Expected</th>
                <th scope="col" className="px-3 py-2 font-medium">Answered by</th>
                <th scope="col" className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.id}</td>
                  <td className="px-3 py-2.5">
                    <span className="block [overflow-wrap:anywhere]">{row.question}</span>
                    <span className="text-xs text-muted-foreground">{row.category}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.expected.length ? row.expected.map((id) => <span key={id} className="block whitespace-nowrap">{id}</span>) : "decline"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="font-normal">
                      {PATH_LABEL[row.path]}
                    </Badge>
                    <span className="mt-1 block font-mono text-xs whitespace-nowrap">{answered(row)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Result row={row} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Nothing in this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
