import { ANSWER_BANK, type BankEntry } from "../content/answer-bank";
import { getLine } from "../content/catalog";
import type { DocumentChannel } from "../content/types";
import { contentTerms, dice, terms, type AnalyzedQuestion } from "./text";

export interface MatcherConfig {
  /** Minimum score to answer from the bank. */
  threshold: number;
  /** If the top two entries are closer than this, it is ambiguous: the coach asks which one. */
  margin: number;
}

export const DEFAULT_MATCHER: MatcherConfig = { threshold: 0.6, margin: 0.2 };
/** Without a keyword hit, the question must share at least this many words with one example. */
const MIN_SHARED_TERMS = 2;

interface PreparedEntry {
  entry: BankEntry;
  channel: DocumentChannel;
  groups: string[][];
  buyerGroups: string[][];
  examples: Array<{ text: string; terms: Set<string> }>;
}

export interface BankCandidate {
  entry: BankEntry;
  score: number;
  keywordHit: boolean;
  similarity: number;
  closestExample: string;
  /** Why the entry was ruled out before scoring, if it was. */
  excluded?: "channel";
}

export type BankDecision = "matched" | "below-threshold" | "ambiguous";

export interface BankMatchResult {
  match: BankCandidate | null;
  decision: BankDecision;
  candidates: BankCandidate[];
}

export function prepareBank(bank: BankEntry[] = ANSWER_BANK): PreparedEntry[] {
  return bank.map((entry) => ({
    entry,
    channel: getLine(entry.lineId).document.channel,
    groups: entry.keywords.map((group) => terms(group.join(" "))).filter((group) => group.length > 0),
    buyerGroups: (entry.buyerKeywords ?? []).map((group) => terms(group.join(" "))).filter((group) => group.length > 0),
    examples: entry.examples.map((text) => ({ text, terms: new Set(contentTerms(text)) })),
  }));
}

const PREPARED = prepareBank();

/** An email line for a call question (or the reverse) is never the right answer. */
export function channelConflict(question: AnalyzedQuestion["channel"], line: DocumentChannel): boolean {
  return question !== null && line !== "any" && line !== question;
}

// excerpt:start bank-score
/**
 * A keyword group that pins the situation is strong evidence; a bare topic word
 * counts only when the rep reports what the buyer said. Otherwise the question
 * must look like a known phrasing.
 */
export function scoreEntry(question: AnalyzedQuestion, prepared: PreparedEntry): BankCandidate {
  const base = { entry: prepared.entry, closestExample: prepared.examples[0]?.text ?? "" };
  if (channelConflict(question.channel, prepared.channel)) {
    return { ...base, score: 0, keywordHit: false, similarity: 0, excluded: "channel" };
  }
  const all = new Set(question.terms);
  const content = new Set(question.content);
  let similarity = 0;
  let shared = 0;
  let closestExample = base.closestExample;
  for (const example of prepared.examples) {
    const value = dice(content, example.terms);
    if (value > similarity) {
      similarity = value;
      shared = [...content].filter((term) => example.terms.has(term)).length;
      closestExample = example.text;
    }
  }
  const hit = (group: string[]) => group.every((term) => all.has(term));
  const keywordHit = prepared.groups.some(hit) || (question.buyerVoice && prepared.buyerGroups.some(hit));
  // One shared word with a short example ("next" vs "the next step") is not a match,
  // unless the question is that example word for word ("I'm too busy right now").
  const sameAsExample = shared > 0 && shared === content.size && similarity === 1;
  const score = keywordHit ? 0.6 + 0.4 * similarity : shared >= MIN_SHARED_TERMS || sameAsExample ? similarity : 0;
  return { ...base, score: Math.round(score * 1000) / 1000, keywordHit, similarity, closestExample };
}

export function matchBank(question: AnalyzedQuestion, config: MatcherConfig = DEFAULT_MATCHER, prepared: PreparedEntry[] = PREPARED): BankMatchResult {
  const candidates = prepared
    .map((entry) => scoreEntry(question, entry))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const [top, second] = candidates;
  if (!top || top.score < config.threshold) return { match: null, decision: "below-threshold", candidates };
  // A keyword hit beats a look-alike phrasing; two of the same kind this close are a tie.
  const tie = second && second.score >= config.threshold && top.score - second.score < config.margin && !(top.keywordHit && !second.keywordHit);
  if (tie) return { match: null, decision: "ambiguous", candidates };
  return { match: top, decision: "matched", candidates };
}
// excerpt:end bank-score
