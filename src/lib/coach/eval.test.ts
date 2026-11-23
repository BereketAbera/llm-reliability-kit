import { describe, expect, it } from "vitest";
import baseline from "../../../eval/baseline.json";
import { getLine } from "../content/catalog";
import { EVAL_SUITE, EVAL_THRESHOLD } from "../content/eval-suite";
import { simulateParaphrase } from "./coach";
import { gate, runEval, scoreRows } from "./eval";

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
    expect(report.rows.map((row) => row.onMethod)).toEqual([true, false, false, false]);
    expect(report.score).toBe(1);
    expect(report.byPath).toMatchObject({ "answer-bank": { total: 1, onMethod: 1 }, retrieval: { total: 2, onMethod: 0 }, "no-match": { total: 1, onMethod: 0 } });
  });

  it("scores the current pipeline at 28/30 and passes the gate", () => {
    const report = runEval("current");
    expect(report.total).toBe(30);
    expect(report.score).toBe(report.rows.filter((row) => row.onMethod).length);
    expect(report.score).toBe(28);
    expect(report.rows.filter((row) => !row.onMethod).map((row) => row.id)).toEqual(["Q09", "Q14"]);
    expect(gate(report, baseline)).toEqual({ publish: true, reasons: [], regressions: [] });
  });

  it("keeps the committed baseline in step with the code", () => {
    const report = runEval("current");
    expect(baseline.score).toBe(report.score);
    expect(baseline.onMethod).toEqual(report.rows.filter((row) => row.onMethod).map((row) => row.id));
  });

  it("blocks a change that lets the model paraphrase", () => {
    const report = runEval("paraphrase-no-guard");
    expect(report.score).toBeLessThan(EVAL_THRESHOLD);
    const decision = gate(report, baseline);
    expect(decision.publish).toBe(false);
    expect(decision.reasons).toHaveLength(2);
    expect(decision.regressions).toContain("Q21");
  });

  it("blocks a drop even when the threshold is still met", () => {
    const report = runEval("retrieval-only");
    expect(report.score).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
    const decision = gate(report, baseline);
    expect(decision.publish).toBe(false);
    expect(decision.reasons[0]).toContain("dropped");
  });
});
