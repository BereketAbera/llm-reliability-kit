"use client";

import { CircleCheck, CircleX, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EvalReport, GateDecision } from "@/lib/coach/eval";
import { cn } from "@/lib/utils";

interface PipelineView {
  key: string;
  label: string;
  description: string;
  report: EvalReport;
  decision: GateDecision;
}

type Filter = "all" | "pass" | "fail";

export function EvalBoard({ pipelines, baselineScore }: { pipelines: PipelineView[]; baselineScore: number }) {
  const [views, setViews] = useState(pipelines);
  const [selected, setSelected] = useState("current");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const view = views.find((v) => v.key === selected) ?? views[0];
  const rows = view.report.rows.filter((row) => (filter === "all" ? true : filter === "pass" ? row.onMethod : !row.onMethod));
  const failing = view.report.rows.filter((row) => !row.onMethod).length;

  async function rerun(key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/eval?pipeline=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { report: EvalReport; decision: GateDecision; ranAt: string; ms: number };
      setViews((prev) => prev.map((v) => (v.key === key ? { ...v, report: data.report, decision: data.decision } : v)));
      setSelected(key);
      setRanAt(`${new Date(data.ranAt).toLocaleTimeString()} (${data.ms} ms on the server)`);
    } catch (err) {
      setError(`Re-run failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="score-title" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="rounded-xl border bg-background p-5">
          <h2 id="score-title" className="text-sm font-medium text-muted-foreground">
            {view.label}
          </h2>
          <p className="mt-2 text-5xl font-semibold tracking-tight tabular">
            {view.report.score}
            <span className="text-2xl text-muted-foreground">/{view.report.total}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">answers fully on method</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", view.decision.publish ? "bg-ok" : "bg-bad")} style={{ width: `${(view.report.score / view.report.total) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              {view.report.score >= view.report.threshold ? <CircleCheck className="size-4 text-ok" aria-hidden /> : <CircleX className="size-4 text-bad" aria-hidden />}
              Threshold {view.report.threshold}/{view.report.total}
            </li>
            <li className="flex items-center gap-2">
              {view.report.score >= baselineScore ? <CircleCheck className="size-4 text-ok" aria-hidden /> : <CircleX className="size-4 text-bad" aria-hidden />}
              No drop from the last approved score ({baselineScore})
            </li>
          </ul>
          <p
            className={cn("mt-4 rounded-lg px-3 py-2 text-sm font-medium", view.decision.publish ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}
            role="status"
          >
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
            {ranAt ? `Last run ${ranAt}.` : "Scored when this page was built."} Re-run calls /api/eval, which runs all 30 questions through the live coach code.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-bad" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border bg-background p-5">
          <h2 className="text-base font-semibold">Each change, measured</h2>
          <p className="mt-1 text-sm text-muted-foreground">Same 30 questions, same scorer, three versions of the pipeline. Select one to see its answers.</p>
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
                      {v.report.score}/{v.report.total}
                    </span>
                  </span>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className={cn("block h-full rounded-full", v.decision.publish ? "bg-ok" : "bg-bad")} style={{ width: `${(v.report.score / v.report.total) * 100}%` }} />
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
      </section>

      <section aria-labelledby="questions-title">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="questions-title" className="text-xl font-semibold tracking-tight">
            The 30 questions
          </h2>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList aria-label="Filter questions">
              <TabsTrigger value="all">All {view.report.total}</TabsTrigger>
              <TabsTrigger value="pass">On method {view.report.score}</TabsTrigger>
              <TabsTrigger value="fail">Off method {failing}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">Per-question results for {view.label}</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">#</th>
                <th scope="col" className="px-3 py-2 font-medium">Rep question</th>
                <th scope="col" className="px-3 py-2 font-medium">Expected line</th>
                <th scope="col" className="px-3 py-2 font-medium">Answered by</th>
                <th scope="col" className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.id}</td>
                  <td className="px-3 py-2.5">
                    <span className="block">{row.question}</span>
                    <span className="text-xs text-muted-foreground">{row.category}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.expected.join(", ")}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="font-normal">
                      {row.path === "answer-bank" ? "Answer bank" : row.path === "retrieval" ? "Retrieval" : "No match"}
                    </Badge>
                    {row.answeredLineId ? <span className="ml-1.5 font-mono text-xs">{row.answeredLineId}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("flex items-start gap-1.5", row.onMethod ? "text-ok" : "text-bad")}>
                      {row.onMethod ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />}
                      <span>
                        <span className="font-medium">{row.onMethod ? "On method" : "Off method"}</span>
                        <span className="block text-xs text-muted-foreground">{row.reason}</span>
                      </span>
                    </span>
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
