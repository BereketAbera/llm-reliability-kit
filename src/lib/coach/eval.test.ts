import { describe, expect, it } from "vitest";
import baseline from "../../../eval/baseline.json";
import { ANSWER_BANK } from "../content/answer-bank";
import { getLine } from "../content/catalog";
import { EVAL_SUITE, EVAL_THRESHOLD, HELD_OUT, SHOULD_DECLINE } from "../content/eval-suite";
import { simulateParaphrase } from "./coach";
import { gate, runAllSets, scoreRows, toBaseline } from "./eval";
import { dice, terms } from "./text";

describe("eval score", () => {
  it("counts on-method answers correctly for hand-made answers", () => {
    const cases = EVAL_SUITE.slice(0, 4);
    const exact = getLine(cases[0].expected[0]).line.text;
    const report = scoreRows(
      cases,
      [
        { text: `Say this: "${exact}"`, path: "answer-bank" },
        { text: simulateParaphrase(getLine(cases[1].expected[0]).line.text), path: "retrieval" },
        { text: getLine("CLS-3.2").line.text, path: "retrieval", quote: { lineId: "CLS-3.2", text: getLine("CLS-3.2").line.text } },
        { text: "No approved line.", path: "no-match" },
      ],
      "hand-made",
    );
    expect(report.rows.map((row) => row.outcome)).toEqual(["on-method", "not-verbatim", "wrong-line", "no-line"]);
    expect(report.score).toBe(1);
    expect(report.byPath).toMatchObject({ "answer-bank": { total: 1, onMethod: 1 }, retrieval: { total: 2, onMethod: 0 }, "no-match": { total: 1, onMethod: 0 } });
  });

  it("scores the current pipeline at 28/30 with no wrong lines anywhere, and passes the gate", () => {
    const run = runAllSets("current");
    expect(run.suite.total).toBe(30);
    expect(run.suite.score).toBe(28);
    expect(run.suite.rows.filter((row) => !row.onMethod).map((row) => row.id)).toEqual(["Q09", "Q14"]);
    expect(run.heldOut.outcomes["wrong-line"]).toBe(0);
    expect(run.decline.score).toBe(run.decline.total);
    expect(gate(run, baseline)).toEqual({ publish: true, reasons: [], regressions: [], wrongLines: 0 });
  });

  it("keeps the committed baseline in step with the code", () => {
    expect(baseline).toEqual(toBaseline(runAllSets("current")));
  });

  it("blocks a change that lets the model paraphrase", () => {
    const run = runAllSets("paraphrase-no-guard");
    expect(run.suite.score).toBeLessThan(EVAL_THRESHOLD);
    const decision = gate(run, baseline);
    expect(decision.publish).toBe(false);
    expect(decision.reasons).toHaveLength(2);
    expect(decision.regressions).toContain("Q21");
  });

  it("blocks a change that answers more questions with the wrong line", () => {
    const run = runAllSets("retrieval-only");
    expect(run.suite.score).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
    const decision = gate(run, baseline);
    expect(decision.publish).toBe(false);
    expect(decision.reasons.join(" ")).toContain("dropped");
    expect(decision.reasons.join(" ")).toContain("Wrong-line answers rose");
  });

  it("blocks a wrong line even when the score holds", () => {
    const run = runAllSets("current");
    const decline = { ...run.decline, outcomes: { ...run.decline.outcomes, "wrong-line": 1 } };
    expect(gate({ ...run, decline }, baseline).reasons).toEqual(["Wrong-line answers rose from 0 to 1"]);
  });
});

describe("test sets", () => {
  it("never puts a test question, or a near copy of one, in the answer bank", () => {
    for (const testCase of EVAL_SUITE) {
      const question = new Set(terms(testCase.question));
      for (const entry of ANSWER_BANK) {
        for (const example of entry.examples) {
          expect(dice(question, new Set(terms(example))), `${testCase.id} vs ${entry.id}: ${example}`).toBeLessThan(0.6);
        }
      }
    }
  });

  it("keeps the three sets apart and labels every case", () => {
    const ids = [...EVAL_SUITE, ...HELD_OUT, ...SHOULD_DECLINE].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of [...EVAL_SUITE, ...HELD_OUT]) for (const id of c.expected) expect(getLine(id).line.kind, `${c.id} ${id}`).toBe("script");
    expect(SHOULD_DECLINE.every((c) => c.expected.length === 0)).toBe(true);
    expect(SHOULD_DECLINE.length).toBeGreaterThanOrEqual(10);
  });
});
