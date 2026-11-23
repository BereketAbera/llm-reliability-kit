/**
 * pnpm eval: runs the 30-question suite, the held-out phrasings and the questions
 * that should be declined, then decides whether a publish may go ahead.
 *
 *   pnpm eval                                   in-process, current pipeline
 *   pnpm eval --url http://localhost:3203       against a running build over HTTP
 *   pnpm eval --pipeline paraphrase-no-guard    see the gate block a bad change
 *   pnpm eval --update-baseline                 record a new approved run (only if it passes)
 *
 * Exits 0 when the gate passes, 1 when it blocks, 2 on bad options or a missing baseline.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CoachAnswer } from "../src/lib/coach/coach";
import { USAGE, loadBaseline, parseEvalArgs } from "../src/lib/coach/eval-cli";
import { gate, runAllSets, scoreRows, toBaseline, type EvalReport, type EvalRun } from "../src/lib/coach/eval";
import { EVAL_SETS, type EvalCase, type EvalSetKey } from "../src/lib/content/eval-suite";

async function ask(baseUrl: string, question: string): Promise<CoachAnswer> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ask?q=${encodeURIComponent(question)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for "${question}"`);
  return (await response.json()) as CoachAnswer;
}

/** Over HTTP. With --recheck, an off-method answer is asked once more (a real model can vary run to run). */
async function overHttp(baseUrl: string, cases: EvalCase[], set: EvalSetKey, threshold: number, recheck: boolean): Promise<EvalReport> {
  const answers: CoachAnswer[] = [];
  for (const testCase of cases) answers.push(await ask(baseUrl, testCase.question));
  let report = scoreRows(cases, answers, `current @ ${baseUrl}`, threshold, set);
  if (recheck) {
    for (const [index, row] of report.rows.entries()) {
      if (!row.onMethod) answers[index] = await ask(baseUrl, cases[index].question);
    }
    report = scoreRows(cases, answers, `current @ ${baseUrl} (rechecked)`, threshold, set);
  }
  return report;
}

function printReport(report: EvalReport) {
  console.log(`\n${EVAL_SETS[report.set].label}: ${report.pipeline}`);
  for (const row of report.rows) {
    const mark = row.onMethod ? "PASS" : row.outcome === "wrong-line" ? "WRONG" : "MISS";
    const answered = row.answeredLineId ?? (row.options ? row.options.join("|") : "-");
    console.log(`  ${mark.padEnd(5)} ${row.id}  ${row.path.padEnd(11)}  ${answered.padEnd(17)}  ${row.question}${row.onMethod ? "" : `\n               ${row.reason}`}`);
  }
}

async function main() {
  const parsed = parseEvalArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`${parsed.error}\n\n${USAGE}`);
    process.exit(parsed.exitCode);
  }
  const options = parsed.value;
  const baselinePath = path.resolve(options.baselinePath);
  const loaded = loadBaseline({ ...options, baselinePath }, (file) => (existsSync(file) ? readFileSync(file, "utf8") : undefined));
  if (!loaded.ok) {
    console.error(loaded.error);
    process.exit(loaded.exitCode);
  }
  const baseline = loaded.value;

  let run: EvalRun;
  if (options.url) {
    run = {
      suite: await overHttp(options.url, EVAL_SETS.suite.cases, "suite", options.threshold, options.recheck),
      heldOut: await overHttp(options.url, EVAL_SETS["held-out"].cases, "held-out", 0, options.recheck),
      decline: await overHttp(options.url, EVAL_SETS.decline.cases, "decline", 0, options.recheck),
    };
  } else {
    const local = runAllSets(options.pipeline);
    run = { ...local, suite: { ...local.suite, threshold: options.threshold, passed: local.suite.score >= options.threshold } };
  }
  const decision = gate(run, baseline);

  if (options.json) {
    console.log(JSON.stringify({ run, decision }, null, 2));
  } else {
    printReport(run.suite);
    printReport(run.heldOut);
    printReport(run.decline);
    const { suite, heldOut, decline } = run;
    console.log(`\nScore ${suite.score}/${suite.total} on method · threshold ${suite.threshold}${baseline ? ` · baseline ${baseline.score}` : ""}`);
    console.log(`Held out: ${heldOut.score}/${heldOut.total} on method, ${heldOut.outcomes.asked} asked which one, ${heldOut.outcomes["no-line"]} declined, ${heldOut.outcomes["wrong-line"]} wrong line`);
    console.log(`Should decline: ${decline.score}/${decline.total} declined or asked, ${decline.outcomes["wrong-line"]} wrong line`);
    console.log(`Wrong lines in total: ${decision.wrongLines}${baseline?.wrongLines !== undefined ? ` (baseline ${baseline.wrongLines})` : ""}`);
    if (decision.regressions.length) console.log(`Newly failing since baseline: ${decision.regressions.join(", ")}`);
    console.log(decision.publish ? "Gate: PASS, publish may go ahead." : `Gate: BLOCKED. ${decision.reasons.join("; ")}.`);
  }

  if (options.updateBaseline) {
    if (!decision.publish) {
      console.error("Not updating the baseline: the gate did not pass.");
    } else {
      writeFileSync(baselinePath, `${JSON.stringify(toBaseline(run), null, 2)}\n`);
      console.log(`Baseline updated: ${run.suite.score}/${run.suite.total}`);
    }
  }
  process.exit(decision.publish ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
