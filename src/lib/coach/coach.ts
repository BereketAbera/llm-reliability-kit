import { citation, getLine, type LineRef } from "../content/catalog";
import { DEFAULT_MATCHER, matchBank, type BankDecision, type MatcherConfig } from "./matcher";
import { retrieveLines } from "./retrieval";
import { containsVerbatim } from "./text";

export const FOLLOW_UP_PROMPT = "Want to know why this works?";
export const NO_MATCH_TEXT =
  "I don't have an approved line for that yet, so I won't guess. Try asking about a specific objection, email or call moment, or flag the question for the trainer.";

export type AnswerPath = "answer-bank" | "retrieval" | "no-match";

export interface Quote {
  lineId: string;
  text: string;
  citation: string;
  documentTitle: string;
  documentVersion: number;
  sectionTitle: string;
}

export interface CoachAnswer {
  question: string;
  path: AnswerPath;
  /** What the rep reads. */
  text: string;
  quote?: Quote;
  bank?: { id: string; intent: string; score: number; via: "keyword" | "intent"; approvedBy: string; approvedOn: string };
  followUp?: { prompt: string; why: string };
  guard: { checked: boolean; ok: boolean; action: "none" | "restored-exact-line"; modelDraft?: string };
  trace: {
    terms: string[];
    corrections: Array<{ from: string; to: string }>;
    bankDecision: BankDecision | "skipped";
    bankCandidates: Array<{ id: string; intent: string; score: number; keywordHit: boolean; similarity: number }>;
    retrieved: Array<{ lineId: string; score: number; matchedTerms: string[]; preview: string }>;
    threshold: number;
  };
}

export interface CoachOptions {
  /** Answer bank first (default). Off shows what retrieval alone does. */
  useBank?: boolean;
  matcher?: MatcherConfig;
  /** Simulate a model that rewrites the quote instead of copying it. */
  paraphrase?: boolean;
  /** Check the final answer contains the source line verbatim, and restore it if not. */
  guard?: boolean;
}

const REWRITES: Array<[RegExp, string]> = [
  [/\bcan we\b/i, "could we"],
  [/\bwhat is\b/i, "what's"],
  [/\bbefore\b/i, "prior to"],
  [/\bthe one\b/i, "the single"],
  [/\bwould it help\b/i, "might it help"],
  [/\bI'll\b/, "I will"],
  [/\bwhen\b/i, "once"],
  [/\bwhat\b/i, "which"],
];

/** What a model tends to do with a quote it was asked to use: keep the idea, change the words. */
export function simulateParaphrase(line: string): string {
  for (const [pattern, replacement] of REWRITES) {
    if (pattern.test(line)) return `Try something like: ${line.replace(pattern, replacement)}`;
  }
  const words = line.split(" ");
  return `Try something like: ${words.slice(0, Math.max(3, words.length - 3)).join(" ")}...`;
}

function toQuote(ref: LineRef): Quote {
  return {
    lineId: ref.line.id,
    text: ref.line.text,
    citation: citation(ref),
    documentTitle: ref.document.title,
    documentVersion: ref.document.version,
    sectionTitle: ref.section.title,
  };
}

// excerpt:start answer
export function answerQuestion(question: string, options: CoachOptions = {}): CoachAnswer {
  const { useBank = true, matcher = DEFAULT_MATCHER, paraphrase = false, guard = true } = options;
  const bankResult = useBank ? matchBank(question, matcher) : null;
  const retrieval = retrieveLines(question);
  const trace: CoachAnswer["trace"] = {
    terms: bankResult?.analyzed.terms ?? retrieval.terms,
    corrections: bankResult?.analyzed.corrections ?? [],
    bankDecision: bankResult ? bankResult.decision : "skipped",
    bankCandidates: (bankResult?.candidates ?? []).slice(0, 4).map((c) => ({
      id: c.entry.id,
      intent: c.entry.intent,
      score: c.score,
      keywordHit: c.keywordHit,
      similarity: Math.round(c.similarity * 1000) / 1000,
    })),
    retrieved: retrieval.ranked.slice(0, 4).map((r) => ({
      lineId: r.ref.line.id,
      score: r.score,
      matchedTerms: r.matchedTerms,
      preview: r.ref.line.text,
    })),
    threshold: matcher.threshold,
  };

  // 1. Answer bank: the approved text is returned as stored. No model touches it.
  if (bankResult?.match) {
    const { entry, keywordHit, score } = bankResult.match;
    const ref = getLine(entry.lineId);
    return {
      question,
      path: "answer-bank",
      text: ref.line.text,
      quote: toQuote(ref),
      bank: { id: entry.id, intent: entry.intent, score, via: keywordHit ? "keyword" : "intent", approvedBy: entry.approvedBy, approvedOn: entry.approvedOn },
      followUp: { prompt: FOLLOW_UP_PROMPT, why: ref.section.why.text },
      guard: { checked: true, ok: true, action: "none" },
      trace,
    };
  }

  // 2. Retrieval: find the exact source line, then make sure the answer still contains it.
  if (retrieval.best) {
    const ref = retrieval.best.ref;
    const modelDraft = paraphrase ? simulateParaphrase(ref.line.text) : ref.line.text;
    const ok = containsVerbatim(modelDraft, ref.line.text);
    const restored = guard && !ok;
    const shown = restored || ok ? ref.line.text : modelDraft;
    return {
      question,
      path: "retrieval",
      text: shown,
      // The quote carries what the rep actually sees, so a paraphrase can't hide behind a correct ID.
      quote: { ...toQuote(ref), text: shown },
      followUp: { prompt: FOLLOW_UP_PROMPT, why: ref.section.why.text },
      guard: { checked: guard, ok, action: restored ? "restored-exact-line" : "none", modelDraft: ok ? undefined : modelDraft },
      trace,
    };
  }

  // 3. Nothing approved fits: say so instead of inventing generic advice.
  return { question, path: "no-match", text: NO_MATCH_TEXT, guard: { checked: guard, ok: true, action: "none" }, trace };
}
// excerpt:end answer
