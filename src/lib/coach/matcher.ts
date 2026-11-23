import { ANSWER_BANK, type BankEntry } from "../content/answer-bank";
import { analyzeQuestion, dice, terms, type AnalyzedQuestion } from "./text";
import { VOCABULARY } from "./vocabulary";

export interface MatcherConfig {
  /** Minimum score to answer from the bank. */
  threshold: number;
  /** If the top two entries are closer than this, it is ambiguous: fall back to retrieval. */
  margin: number;
}

export const DEFAULT_MATCHER: MatcherConfig = { threshold: 0.55, margin: 0.05 };

interface PreparedEntry {
  entry: BankEntry;
  groups: string[][];
  examples: Array<{ text: string; terms: Set<string> }>;
}

export interface BankCandidate {
  entry: BankEntry;
  score: number;
  keywordHit: boolean;
  similarity: number;
  closestExample: string;
}

export type BankDecision = "matched" | "below-threshold" | "ambiguous";

export interface BankMatchResult {
  match: BankCandidate | null;
  decision: BankDecision;
  candidates: BankCandidate[];
  analyzed: AnalyzedQuestion;
}

export function prepareBank(bank: BankEntry[] = ANSWER_BANK): PreparedEntry[] {
  return bank.map((entry) => ({
    entry,
    groups: entry.keywords.map((group) => terms(group.join(" "))).filter((group) => group.length > 0),
    examples: entry.examples.map((text) => ({ text, terms: new Set(terms(text)) })),
  }));
}

const PREPARED = prepareBank();

// excerpt:start bank-score
/** A keyword hit is strong evidence; otherwise the question must look like a known phrasing. */
export function scoreEntry(question: Set<string>, prepared: PreparedEntry): BankCandidate {
  let similarity = 0;
  let closestExample = prepared.examples[0]?.text ?? "";
  for (const example of prepared.examples) {
    const value = dice(question, example.terms);
    if (value > similarity) {
      similarity = value;
      closestExample = example.text;
    }
  }
  const keywordHit = prepared.groups.some((group) => group.every((term) => question.has(term)));
  const score = keywordHit ? 0.6 + 0.4 * similarity : similarity;
  return { entry: prepared.entry, score: Math.round(score * 1000) / 1000, keywordHit, similarity, closestExample };
}

export function matchBank(
  question: string,
  config: MatcherConfig = DEFAULT_MATCHER,
  prepared: PreparedEntry[] = PREPARED,
): BankMatchResult {
  const analyzed = analyzeQuestion(question, VOCABULARY);
  const questionTerms = new Set(analyzed.terms);
  const candidates = prepared
    .map((entry) => scoreEntry(questionTerms, entry))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const [top, second] = candidates;
  if (!top || top.score < config.threshold) return { match: null, decision: "below-threshold", candidates, analyzed };
  if (second && second.score >= config.threshold && top.score - second.score < config.margin) {
    return { match: null, decision: "ambiguous", candidates, analyzed };
  }
  return { match: top, decision: "matched", candidates, analyzed };
}
// excerpt:end bank-score
