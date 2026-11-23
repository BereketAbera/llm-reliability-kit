import { EVAL_SETS, EVAL_SUITE, EVAL_THRESHOLD, type EvalCase, type EvalSetKey } from "../content/eval-suite";
import { answerQuestion, type AnswerPath, type CoachOptions } from "./coach";
import { scoreAnswer, type Outcome, type ScorableAnswer } from "./scorer";

export interface PipelineConfig {
  key: string;
  label: string;
  description: string;
  options: CoachOptions;
}

export const PIPELINES: PipelineConfig[] = [
  {
    key: "current",
    label: "Answer bank first, then line retrieval",
    description: "The current pipeline: approved answers verbatim, exact source lines otherwise, verbatim guard on.",
    options: { useBank: true, paraphrase: false, guard: true },
  },
  {
    key: "retrieval-only",
    label: "Line retrieval only",
    description: "No answer bank. Every question goes through search over the documents.",
    options: { useBank: false, paraphrase: false, guard: true },
  },
  {
    key: "paraphrase-no-guard",
    label: "A bad change: the model rewrites quotes, guard off",
    description: "What a prompt tweak can do: retrieved lines get paraphrased and nothing checks them. Answer-bank replies are untouched.",
    options: { useBank: true, paraphrase: true, guard: false },
  },
];

export interface EvalRow {
  id: string;
  question: string;
  category: EvalCase["category"];
  expected: string[];
  path: AnswerPath;
  answeredLineId?: string;
  /** The two lines offered when the coach asked which situation it is. */
  options?: string[];
  answerText: string;
  onMethod: boolean;
  outcome: Outcome;
  optionHit?: boolean;
  reason: string;
}

export type OutcomeCounts = Record<Outcome, number>;

export interface EvalReport {
  pipeline: string;
  set: EvalSetKey;
  /** On method (or rightly declined, for the decline set). */
  score: number;
  total: number;
  threshold: number;
  passed: boolean;
  outcomes: OutcomeCounts;
  /** Of the "asked" answers, how many offered the expected line as one of the two options. */
  askedWithRightOption: number;
  byPath: Record<AnswerPath, { total: number; onMethod: number }>;
  rows: EvalRow[];
}

const emptyOutcomes = (): OutcomeCounts => ({ "on-method": 0, declined: 0, asked: 0, "no-line": 0, "not-verbatim": 0, "wrong-line": 0 });

export function scoreRows(cases: EvalCase[], answers: ScorableAnswer[], pipeline: string, threshold = EVAL_THRESHOLD, set: EvalSetKey = "suite"): EvalReport {
  const byPath: EvalReport["byPath"] = {
    "answer-bank": { total: 0, onMethod: 0 },
    retrieval: { total: 0, onMethod: 0 },
    clarify: { total: 0, onMethod: 0 },
    "no-match": { total: 0, onMethod: 0 },
  };
  const outcomes = emptyOutcomes();
  let askedWithRightOption = 0;
  const rows = cases.map((testCase, index): EvalRow => {
    const answer = answers[index];
    const result = scoreAnswer(answer, testCase.expected);
    const path = answer.path ?? "retrieval";
    byPath[path].total++;
    if (result.onMethod) byPath[path].onMethod++;
    outcomes[result.outcome]++;
    if (result.optionHit) askedWithRightOption++;
    return {
      id: testCase.id,
      question: testCase.question,
      category: testCase.category,
      expected: testCase.expected,
      path,
      answeredLineId: answer.quote?.lineId,
      options: answer.options?.map((option) => option.lineId),
      answerText: answer.text,
      onMethod: result.onMethod,
      outcome: result.outcome,
      optionHit: result.optionHit,
      reason: result.reason,
    };
  });
  const score = rows.filter((row) => row.onMethod).length;
  return { pipeline, set, score, total: rows.length, threshold, passed: score >= threshold, outcomes, askedWithRightOption, byPath, rows };
}

function pipelineOptions(pipelineKey: string): CoachOptions {
  const pipeline = PIPELINES.find((p) => p.key === pipelineKey);
  if (!pipeline) throw new Error(`Unknown pipeline ${pipelineKey}`);
  return pipeline.options;
}

export function runEval(pipelineKey = "current", cases: EvalCase[] = EVAL_SUITE, set: EvalSetKey = "suite"): EvalReport {
  const options = pipelineOptions(pipelineKey);
  const answers = cases.map((testCase) => answerQuestion(testCase.question, options));
  return scoreRows(cases, answers, pipelineKey, set === "suite" ? EVAL_THRESHOLD : 0, set);
}

export interface EvalRun {
  suite: EvalReport;
  heldOut: EvalReport;
  decline: EvalReport;
}

/** The gate's 30 questions plus the held-out phrasings and the questions that should be declined. */
export function runAllSets(pipelineKey = "current"): EvalRun {
  return {
    suite: runEval(pipelineKey, EVAL_SETS.suite.cases, "suite"),
    heldOut: runEval(pipelineKey, EVAL_SETS["held-out"].cases, "held-out"),
    decline: runEval(pipelineKey, EVAL_SETS.decline.cases, "decline"),
  };
}

export function wrongLines(run: Partial<EvalRun> & { suite: EvalReport }): number {
  return [run.suite, run.heldOut, run.decline].reduce((sum, report) => sum + (report?.outcomes["wrong-line"] ?? 0), 0);
}

export interface Baseline {
  score: number;
  total?: number;
  onMethod: string[];
  /** Wrong lines across all three sets in the last approved run. */
  wrongLines?: number;
  heldOut?: { onMethod: number; total: number };
  decline?: { declined: number; total: number };
}

export function toBaseline(run: EvalRun): Required<Baseline> {
  return {
    score: run.suite.score,
    total: run.suite.total,
    onMethod: run.suite.rows.filter((row) => row.onMethod).map((row) => row.id),
    wrongLines: wrongLines(run),
    heldOut: { onMethod: run.heldOut.score, total: run.heldOut.total },
    decline: { declined: run.decline.score, total: run.decline.total },
  };
}

export interface GateDecision {
  publish: boolean;
  reasons: string[];
  regressions: string[];
  wrongLines: number;
}

// excerpt:start gate
/**
 * No publish below the threshold, no publish if the score dropped from the last
 * approved run, and no publish if more questions get a wrong approved line.
 */
export function gate(run: Partial<EvalRun> & { suite: EvalReport }, baseline?: Baseline): GateDecision {
  const { suite } = run;
  const reasons: string[] = [];
  if (suite.score < suite.threshold) reasons.push(`Score ${suite.score}/${suite.total} is below the threshold of ${suite.threshold}`);
  if (baseline && suite.score < baseline.score) reasons.push(`Score dropped from ${baseline.score} to ${suite.score}`);
  const wrong = wrongLines(run);
  if (baseline?.wrongLines !== undefined && wrong > baseline.wrongLines) {
    reasons.push(`Wrong-line answers rose from ${baseline.wrongLines} to ${wrong}`);
  }
  const nowOnMethod = new Set(suite.rows.filter((row) => row.onMethod).map((row) => row.id));
  const regressions = (baseline?.onMethod ?? []).filter((id) => !nowOnMethod.has(id));
  return { publish: reasons.length === 0, reasons, regressions, wrongLines: wrong };
}
// excerpt:end gate
