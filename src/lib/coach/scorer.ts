import { CATALOG } from "../content/catalog";
import type { CoachAnswer } from "./coach";
import { containsVerbatim, normalizeForCompare } from "./text";

/**
 * on-method: an expected approved line, word for word.
 * declined: no line, and the question was off topic (that is the right answer).
 * asked: the coach asked which of two situations it is instead of guessing.
 * no-line: the coach declined a question it should have answered.
 * not-verbatim: the right line, reworded.
 * wrong-line: an approved line written for a different situation. The worst outcome.
 */
export type Outcome = "on-method" | "declined" | "asked" | "no-line" | "not-verbatim" | "wrong-line";

export interface ScoredAnswer {
  /** Counts toward the score: on method, or declined/asked for a question that should be declined. */
  onMethod: boolean;
  outcome: Outcome;
  /** Which expected line the answer used, if any. */
  matchedLineId?: string;
  /** For "asked": one of the two options was an expected line. */
  optionHit?: boolean;
  reason: string;
}

export interface ScorableAnswer {
  text: string;
  path?: CoachAnswer["path"];
  quote?: { lineId: string; text: string };
  options?: Array<{ lineId: string }>;
}

// excerpt:start scorer
/**
 * On method only if the answer contains an expected approved line word for word
 * (after whitespace and punctuation normalization), or quotes the right source line exactly.
 * Naming the method, or a close paraphrase, does not count. A question with no
 * expected line should be declined: any line at all is a wrong line.
 */
export function scoreAnswer(answer: ScorableAnswer, expected: string[], lines = CATALOG.lines): ScoredAnswer {
  const noLine = answer.path === "no-match" || answer.path === "clarify";
  if (expected.length === 0) {
    if (answer.path === "clarify") return { onMethod: true, outcome: "asked", reason: "Asked which situation instead of answering" };
    if (noLine || !answer.quote) return { onMethod: true, outcome: "declined", reason: "Declined, as it should" };
    return { onMethod: false, outcome: "wrong-line", reason: `Answered with ${answer.quote.lineId}; it should have declined` };
  }
  for (const id of expected) {
    const ref = lines.get(id);
    if (!ref) continue;
    if (containsVerbatim(answer.text, ref.line.text)) {
      return { onMethod: true, outcome: "on-method", matchedLineId: id, reason: `Contains ${id} word for word` };
    }
    if (answer.quote?.lineId === id && normalizeForCompare(answer.quote.text) === normalizeForCompare(ref.line.text)) {
      return { onMethod: true, outcome: "on-method", matchedLineId: id, reason: `Quotes source line ${id} exactly` };
    }
  }
  if (answer.path === "clarify") {
    const optionHit = (answer.options ?? []).some((option) => expected.includes(option.lineId));
    return { onMethod: false, outcome: "asked", optionHit, reason: optionHit ? "Asked which situation; the right line was one of the two options" : "Asked which situation; neither option was the expected line" };
  }
  if (answer.path === "no-match") return { onMethod: false, outcome: "no-line", reason: "Declined: no approved line returned" };
  if (answer.quote && !expected.includes(answer.quote.lineId)) {
    return { onMethod: false, outcome: "wrong-line", reason: `Used ${answer.quote.lineId}, expected ${expected.join(" or ")}` };
  }
  return { onMethod: false, outcome: "not-verbatim", reason: "Right idea, but the approved line is not there word for word" };
}
// excerpt:end scorer
