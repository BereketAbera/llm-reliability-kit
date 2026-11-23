import { CATALOG, citation, getLine, type LineRef } from "../content/catalog";
import { isEnglishWord } from "./english";
import { DEFAULT_MATCHER, matchBank, type BankDecision, type BankMatchResult, type MatcherConfig } from "./matcher";
import { retrieveLines, scoreLines, type RetrievalResult } from "./retrieval";
import { analyzeQuestion, containsVerbatim, type AnalyzedQuestion } from "./text";
import { VOCABULARY } from "./vocabulary";

export const FOLLOW_UP_PROMPT = "Want to know why this works?";
export const NO_MATCH_TEXT =
  "I don't have an approved line for that yet, so I won't guess. Try asking about a specific objection, email or call moment, or flag the question for the trainer.";
export const CLARIFY_TEXT = "Two approved lines could fit. Which situation is it?";
/** When two bank entries tie, the line search must prefer one by at least this much to break the tie. */
const BANK_TIE_BREAK = 0.3;

export type AnswerPath = "answer-bank" | "retrieval" | "clarify" | "no-match";

export interface Quote {
  lineId: string;
  text: string;
  citation: string;
  documentTitle: string;
  documentVersion: number;
  sectionTitle: string;
}

export interface ClarifyOption {
  lineId: string;
  sectionTitle: string;
  documentTitle: string;
}

export interface CoachAnswer {
  question: string;
  path: AnswerPath;
  /** What the rep reads. */
  text: string;
  quote?: Quote;
  bank?: { id: string; intent: string; score: number; via: "keyword" | "intent"; approvedBy: string; approvedOn: string };
  followUp?: { prompt: string; why: string };
  /** When two sections fit, the rep picks one instead of the coach guessing. */
  options?: ClarifyOption[];
  /** The rep picked this line from the options. */
  chosen?: boolean;
  guard: { checked: boolean; ok: boolean; action: "none" | "restored-exact-line"; modelDraft?: string };
  trace: {
    terms: string[];
    /** The terms that count as evidence; the rest are too common to count. */
    content: string[];
    corrections: Array<{ from: string; to: string }>;
    bankDecision: BankDecision | "skipped";
    /** Two bank entries tied and the line search clearly preferred one of them. */
    tieBreak?: { chosen: string; over: string };
    bankCandidates: Array<{ id: string; intent: string; score: number; keywordHit: boolean; similarity: number }>;
    retrievalDecision: RetrievalResult["decision"] | "skipped";
    retrievalReason: string;
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
  /** A line the rep picked from the options of an earlier "which one?" answer. */
  pick?: string;
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

function option(ref: LineRef): ClarifyOption {
  return { lineId: ref.line.id, sectionTitle: ref.section.title, documentTitle: ref.document.title };
}

interface Route {
  analyzed: AnalyzedQuestion;
  bank: BankMatchResult | null;
  retrieval: RetrievalResult;
}

function route(analyzed: AnalyzedQuestion, useBank: boolean, matcher: MatcherConfig): Route {
  return { analyzed, bank: useBank ? matchBank(analyzed, matcher) : null, retrieval: retrieveLines(analyzed) };
}

const answered = (r: Route) => Boolean(r.bank?.match) || r.bank?.decision === "ambiguous" || r.retrieval.decision !== "none";

/** Retrieval-path answer for one line: the model's draft, checked against the source line. */
function lineAnswer(question: string, ref: LineRef, paraphrase: boolean, guard: boolean, trace: CoachAnswer["trace"], chosen = false): CoachAnswer {
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
    chosen: chosen || undefined,
    guard: { checked: guard, ok, action: restored ? "restored-exact-line" : "none", modelDraft: ok ? undefined : modelDraft },
    trace,
  };
}

// excerpt:start answer
export function answerQuestion(question: string, options: CoachOptions = {}): CoachAnswer {
  const { useBank = true, matcher = DEFAULT_MATCHER, paraphrase = false, guard = true, pick } = options;
  // Search the question as typed first. Typos are fixed only if nothing matched,
  // and only words that are not real English are touched ("pirce", not "bake").
  let result = route(analyzeQuestion(question), useBank, matcher);
  if (!answered(result)) {
    const corrected = analyzeQuestion(question, { vocabulary: VOCABULARY, isEnglishWord });
    if (corrected.corrections.length) {
      const retry = route(corrected, useBank, matcher);
      if (answered(retry)) result = retry;
    }
  }
  const { analyzed, bank: bankResult, retrieval } = result;
  const trace: CoachAnswer["trace"] = {
    terms: analyzed.terms,
    content: analyzed.content,
    corrections: analyzed.corrections,
    bankDecision: bankResult ? bankResult.decision : "skipped",
    bankCandidates: (bankResult?.candidates ?? []).slice(0, 4).map((c) => ({
      id: c.entry.id,
      intent: c.entry.intent,
      score: c.score,
      keywordHit: c.keywordHit,
      similarity: Math.round(c.similarity * 1000) / 1000,
    })),
    retrievalDecision: bankResult?.match ? "skipped" : retrieval.decision,
    retrievalReason: retrieval.reason,
    retrieved: retrieval.ranked.slice(0, 4).map((r) => ({ lineId: r.ref.line.id, score: r.score, matchedTerms: r.matchedTerms, preview: r.ref.line.text })),
    threshold: matcher.threshold,
  };

  // 0. The rep picked one of the options offered earlier: answer with exactly that line.
  if (pick && CATALOG.lines.get(pick)?.line.kind === "script") {
    return lineAnswer(question, getLine(pick), paraphrase, guard, trace, true);
  }

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

  // 2. Two bank entries fit about equally. The line search breaks the tie only if it
  //    clearly prefers one of them; otherwise the coach asks which one rather than guess.
  if (bankResult?.decision === "ambiguous") {
    const [first, second] = bankResult.candidates;
    const scores = new Map(scoreLines(analyzed).map((line) => [line.ref.line.id, line.score]));
    const [a, b] = [first, second].map((c) => scores.get(c.entry.lineId) ?? 0);
    const winner = a >= b ? first : second;
    if (Math.max(a, b) > 0 && Math.abs(a - b) / Math.max(a, b) >= BANK_TIE_BREAK) {
      const ref = getLine(winner.entry.lineId);
      return {
        question,
        path: "answer-bank",
        text: ref.line.text,
        quote: toQuote(ref),
        bank: { id: winner.entry.id, intent: winner.entry.intent, score: winner.score, via: winner.keywordHit ? "keyword" : "intent", approvedBy: winner.entry.approvedBy, approvedOn: winner.entry.approvedOn },
        followUp: { prompt: FOLLOW_UP_PROMPT, why: ref.section.why.text },
        guard: { checked: true, ok: true, action: "none" },
        trace: { ...trace, bankDecision: "matched", tieBreak: { chosen: winner.entry.id, over: (winner === first ? second : first).entry.id } },
      };
    }
    return {
      question,
      path: "clarify",
      text: CLARIFY_TEXT,
      options: [option(getLine(first.entry.lineId)), option(getLine(second.entry.lineId))],
      guard: { checked: guard, ok: true, action: "none" },
      trace: { ...trace, retrievalDecision: "clarify", retrievalReason: "The line search did not clearly prefer either answer-bank entry" },
    };
  }

  // 3. Retrieval: find the exact source line, then make sure the answer still contains it.
  if (retrieval.decision === "answer" && retrieval.best) {
    return lineAnswer(question, retrieval.best.ref, paraphrase, guard, trace);
  }

  // 4. Two sections fit about equally: ask which one rather than guess.
  if (retrieval.decision === "clarify" && retrieval.best && retrieval.alternative) {
    return {
      question,
      path: "clarify",
      text: CLARIFY_TEXT,
      options: [option(retrieval.best.ref), option(retrieval.alternative.ref)],
      guard: { checked: guard, ok: true, action: "none" },
      trace,
    };
  }

  // 5. Nothing approved fits: say so instead of inventing generic advice.
  return { question, path: "no-match", text: NO_MATCH_TEXT, guard: { checked: guard, ok: true, action: "none" }, trace };
}
// excerpt:end answer
