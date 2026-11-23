import { describe, expect, it } from "vitest";
import { loadBaseline, parseEvalArgs } from "./eval-cli";

describe("pnpm eval options", () => {
  it("uses safe defaults", () => {
    expect(parseEvalArgs([])).toEqual({
      ok: true,
      value: { url: undefined, pipeline: "current", threshold: 24, baselinePath: "eval/baseline.json", updateBaseline: false, allowMissingBaseline: false, recheck: false, json: false },
    });
  });

  it("rejects a threshold that is not a whole number from 0 to the total", () => {
    for (const value of ["24x", "NaN", "-1", "2.5", "31", ""]) {
      const parsed = parseEvalArgs(["--threshold", value], 30);
      expect(parsed.ok, value).toBe(false);
      if (!parsed.ok) expect(parsed.exitCode).toBe(2);
    }
    expect(parseEvalArgs(["--threshold", "0"]).ok).toBe(true);
    expect(parseEvalArgs(["--threshold", "30"]).ok).toBe(true);
  });

  it("rejects --pipeline together with --url instead of ignoring it", () => {
    const parsed = parseEvalArgs(["--url", "http://localhost:3203", "--pipeline", "retrieval-only"]);
    expect(parsed).toMatchObject({ ok: false, exitCode: 2 });
  });

  it("rejects unknown pipelines, unknown flags and missing values", () => {
    expect(parseEvalArgs(["--pipeline", "nope"]).ok).toBe(false);
    expect(parseEvalArgs(["--treshold", "24"]).ok).toBe(false);
    expect(parseEvalArgs(["--url"]).ok).toBe(false);
    expect(parseEvalArgs(["--url", "localhost:3203"]).ok).toBe(false);
    expect(parseEvalArgs(["--recheck"]).ok).toBe(false);
  });

  it("stops when the baseline file is missing, unless asked to record or skip it", () => {
    const missing = () => undefined;
    const options = { baselinePath: "eval/missing.json", updateBaseline: false, allowMissingBaseline: false };
    expect(loadBaseline(options, missing)).toMatchObject({ ok: false, exitCode: 2 });
    expect(loadBaseline({ ...options, updateBaseline: true }, missing)).toEqual({ ok: true, value: undefined });
    expect(loadBaseline({ ...options, allowMissingBaseline: true }, missing)).toEqual({ ok: true, value: undefined });
  });

  it("stops on a baseline that is not valid JSON or has no score", () => {
    const options = { baselinePath: "eval/baseline.json", updateBaseline: false, allowMissingBaseline: false };
    expect(loadBaseline(options, () => "{bad").ok).toBe(false);
    expect(loadBaseline(options, () => "{}").ok).toBe(false);
    expect(loadBaseline(options, () => '{"score":28,"onMethod":[]}')).toEqual({ ok: true, value: { score: 28, onMethod: [] } });
  });
});
