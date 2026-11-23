/**
 * pnpm eval: runs the 30-question suite and decides whether a publish may go ahead.
 *
 *   pnpm eval                                   in-process, current pipeline
 *   pnpm eval --url http://localhost:3203       against a running build over HTTP
 *   pnpm eval --pipeline paraphrase-no-guard    see the gate block a bad change
 *   pnpm eval --update-baseline                 record a new approved score (only if it passes)
 *
 * Exits 1 when the score is below the threshold or lower than the baseline.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CoachAnswer } from "../src/lib/coach/coach";
import { gate, runEval, scoreRows, type EvalReport } from "../src/lib/coach/eval";
import { EVAL_SUITE, EVAL_THRESHOLD } from "../src/lib/content/eval-suite";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const flag = (name: string) => process.argv.includes(`--${name}`);

async function overHttp(baseUrl: string): Promise<CoachAnswer[]> {
  const answers: CoachAnswer[] = [];
  for (const testCase of EVAL_SUITE) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ask?q=${encodeURIComponent(testCase.question)}`);
    if (!response.ok) throw new Error(`${testCase.id}: HTTP ${response.status}`);
    answers.push((await response.json()) as CoachAnswer);
  }
  return answers;
}

async function main() {
  const url = arg("url");
  const threshold = Number(arg("threshold") ?? EVAL_THRESHOLD);
  const baselinePath = path.resolve(arg("baseline") ?? "eval/baseline.json");
  const pipeline = arg("pipeline") ?? "current";

  let report: EvalReport;
  if (url) {
    report = scoreRows(EVAL_SUITE, await overHttp(url), `current @ ${url}`, threshold);
  } else {
    const local = runEval(pipeline);
    report = { ...local, threshold, passed: local.score >= threshold };
  }

  const baseline = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, "utf8")) as { score: number; onMethod: string[] })
    : undefined;
  const decision = gate(report, baseline);

  if (flag("json")) {
    console.log(JSON.stringify({ report, decision }, null, 2));
  } else {
    console.log(`\nCoach eval: ${report.pipeline}`);
    for (const row of report.rows) {
      const mark = row.onMethod ? "PASS" : "FAIL";
      console.log(`  ${mark}  ${row.id}  ${row.path.padEnd(11)}  ${(row.answeredLineId ?? "-").padEnd(8)}  ${row.question}${row.onMethod ? "" : `\n              ${row.reason}`}`);
    }
    console.log(`\nScore ${report.score}/${report.total} on method · threshold ${report.threshold}${baseline ? ` · baseline ${baseline.score}` : ""}`);
    if (decision.regressions.length) console.log(`Newly failing since baseline: ${decision.regressions.join(", ")}`);
    console.log(decision.publish ? "Gate: PASS, publish may go ahead." : `Gate: BLOCKED. ${decision.reasons.join("; ")}.`);
  }

  if (flag("update-baseline")) {
    if (!decision.publish) {
      console.error("Not updating the baseline: the gate did not pass.");
    } else {
      const onMethod = report.rows.filter((row) => row.onMethod).map((row) => row.id);
      writeFileSync(baselinePath, `${JSON.stringify({ score: report.score, total: report.total, onMethod }, null, 2)}\n`);
      console.log(`Baseline updated: ${report.score}/${report.total}`);
    }
  }
  process.exit(decision.publish ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
