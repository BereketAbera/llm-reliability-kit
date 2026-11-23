import { CATALOG } from "../content/catalog";
import type { CoachAnswer } from "./coach";
import { containsVerbatim, normalizeForCompare } from "./text";

export interface ScoredAnswer {
  onMethod: boolean;
  /** Which expected line the answer used, if any. */
  matchedLineId?: string;
  reason: string;
}

export interface ScorableAnswer {
  text: string;
  path?: CoachAnswer["path"];
  quote?: { lineId: string; text: string };
}

// excerpt:start scorer
/**
 * On method only if the answer contains an expected approved line word for word
 * (after whitespace and punctuation normalization), or quotes the right source line exactly.
 * Naming the method, or a close paraphrase, does not count.
 */
export function scoreAnswer(answer: ScorableAnswer, expected: string[], lines = CATALOG.lines): ScoredAnswer {
  for (const id of expected) {
    const ref = lines.get(id);
    if (!ref) continue;
    if (containsVerbatim(answer.text, ref.line.text)) {
      return { onMethod: true, matchedLineId: id, reason: `Contains ${id} word for word` };
    }
    if (answer.quote?.lineId === id && normalizeForCompare(answer.quote.text) === normalizeForCompare(ref.line.text)) {
      return { onMethod: true, matchedLineId: id, reason: `Quotes source line ${id} exactly` };
    }
  }
  if (answer.path === "no-match") return { onMethod: false, reason: "No approved line returned" };
  if (answer.quote && !expected.includes(answer.quote.lineId)) {
    return { onMethod: false, reason: `Used ${answer.quote.lineId}, expected ${expected.join(" or ")}` };
  }
  return { onMethod: false, reason: "Right idea, but the approved line is not there word for word" };
}
// excerpt:end scorer
