import { EVAL_SUITE, EVAL_THRESHOLD, type EvalCase } from "../content/eval-suite";
import { answerQuestion, type AnswerPath, type CoachOptions } from "./coach";
import { scoreAnswer, type ScorableAnswer } from "./scorer";

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
  answerText: string;
  onMethod: boolean;
  reason: string;
}

export interface EvalReport {
  pipeline: string;
  score: number;
  total: number;
  threshold: number;
  passed: boolean;
  byPath: Record<AnswerPath, { total: number; onMethod: number }>;
  rows: EvalRow[];
}

export function scoreRows(cases: EvalCase[], answers: ScorableAnswer[], pipeline: string, threshold = EVAL_THRESHOLD): EvalReport {
  const byPath: EvalReport["byPath"] = {
    "answer-bank": { total: 0, onMethod: 0 },
    retrieval: { total: 0, onMethod: 0 },
    "no-match": { total: 0, onMethod: 0 },
  };
  const rows = cases.map((testCase, index): EvalRow => {
    const answer = answers[index];
    const result = scoreAnswer(answer, testCase.expected);
    const path = answer.path ?? "retrieval";
    byPath[path].total++;
    if (result.onMethod) byPath[path].onMethod++;
    return {
      id: testCase.id,
      question: testCase.question,
      category: testCase.category,
      expected: testCase.expected,
      path,
      answeredLineId: answer.quote?.lineId,
      answerText: answer.text,
      onMethod: result.onMethod,
      reason: result.reason,
    };
  });
  const score = rows.filter((row) => row.onMethod).length;
  return { pipeline, score, total: rows.length, threshold, passed: score >= threshold, byPath, rows };
}

export function runEval(pipelineKey = "current", cases: EvalCase[] = EVAL_SUITE): EvalReport {
  const pipeline = PIPELINES.find((p) => p.key === pipelineKey);
  if (!pipeline) throw new Error(`Unknown pipeline ${pipelineKey}`);
  const answers = cases.map((testCase) => answerQuestion(testCase.question, pipeline.options));
  return scoreRows(cases, answers, pipeline.key);
}

export interface GateDecision {
  publish: boolean;
  reasons: string[];
  regressions: string[];
}

// excerpt:start gate
/** No publish below the threshold, and no publish if the score dropped from the last approved run. */
export function gate(report: EvalReport, baseline?: { score: number; onMethod: string[] }): GateDecision {
  const reasons: string[] = [];
  if (report.score < report.threshold) reasons.push(`Score ${report.score}/${report.total} is below the threshold of ${report.threshold}`);
  if (baseline && report.score < baseline.score) reasons.push(`Score dropped from ${baseline.score} to ${report.score}`);
  const nowOnMethod = new Set(report.rows.filter((row) => row.onMethod).map((row) => row.id));
  const regressions = (baseline?.onMethod ?? []).filter((id) => !nowOnMethod.has(id));
  return { publish: reasons.length === 0, reasons, regressions };
}
// excerpt:end gate
