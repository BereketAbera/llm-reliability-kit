import { CATALOG, type Catalog, type LineRef } from "../content/catalog";
import { channelConflict } from "./matcher";
import { contentTerms, type AnalyzedQuestion } from "./text";

/**
 * Line-level BM25. Each approved script line is its own search document, with its
 * section's title and tags weighted up and the document's title and channel
 * included, so a question lands on the exact line to say, not just on the method's name.
 */
const FIELD_WEIGHTS = { line: 1, title: 2, tags: 2, why: 0.5, document: 1, channel: 1 };
const K1 = 1.2;
const B = 0.75;
/** A line must share at least this many distinct content terms with the question... */
const MIN_MATCHED_TERMS = 2;
/** ...and clear this score, so a pile of weak, common words is not enough. */
export const MIN_SCORE = 2.5;
/** If the runner-up from another section is within this fraction of the best, ask which one. */
export const CLARIFY_MARGIN = 0.15;
const CHANNEL_WORDS = { any: "", call: "call phone", email: "email" } as const;

interface IndexedLine {
  ref: LineRef;
  weights: Map<string, number>;
  /**
   * What the section is about: terms from its title and tags, minus the terms every
   * section of the document shares ("email" in the email playbook says nothing).
   */
  topic: Set<string>;
  length: number;
  primary: boolean;
}

export interface RetrievedLine {
  ref: LineRef;
  score: number;
  matchedTerms: string[];
  /** Clears the evidence bar on its own (terms, topic and score). */
  supported: boolean;
}

export type RetrievalDecision = "answer" | "clarify" | "none";

export interface RetrievalResult {
  decision: RetrievalDecision;
  best: RetrievedLine | null;
  /** The other candidate when the decision is "clarify". */
  alternative: RetrievedLine | null;
  ranked: RetrievedLine[];
  terms: string[];
  reason: string;
}

/** Placeholders such as [name] or [day] are slots to fill in, not words to match. */
function withoutSlots(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ");
}

function sectionTopics(catalog: Catalog): Map<string, Set<string>> {
  const topics = new Map<string, Set<string>>();
  for (const document of catalog.documents) {
    const bySection = document.sections.map((section) => new Set(contentTerms(`${section.title} ${section.tags.join(" ")}`)));
    const shared = bySection.length > 1 ? [...bySection[0]].filter((term) => bySection.every((set) => set.has(term))) : [];
    document.sections.forEach((section, i) => topics.set(section.id, new Set([...bySection[i]].filter((term) => !shared.includes(term)))));
  }
  return topics;
}

export function buildIndex(catalog: Catalog = CATALOG) {
  const topics = sectionTopics(catalog);
  const lines: IndexedLine[] = catalog.scripts.map((ref) => {
    const weights = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const term of contentTerms(text)) weights.set(term, (weights.get(term) ?? 0) + weight);
    };
    add(withoutSlots(ref.line.text), FIELD_WEIGHTS.line);
    add(ref.section.title, FIELD_WEIGHTS.title);
    add(ref.section.tags.join(" "), FIELD_WEIGHTS.tags);
    add(ref.section.why.text, FIELD_WEIGHTS.why);
    add(ref.document.title, FIELD_WEIGHTS.document);
    add(CHANNEL_WORDS[ref.document.channel], FIELD_WEIGHTS.channel);
    const topic = topics.get(ref.section.id) ?? new Set<string>();
    const length = [...weights.values()].reduce((sum, value) => sum + value, 0);
    return { ref, weights, topic, length, primary: ref.section.scripts[0]?.id === ref.line.id };
  });
  const documentFrequency = new Map<string, number>();
  for (const line of lines) for (const term of line.weights.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const averageLength = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(1, lines.length);
  return { lines, documentFrequency, averageLength, total: lines.length };
}

const INDEX = buildIndex();

/**
 * BM25 score of every line that shares a content term with the question, best first.
 * Lines out of scope for the question (wrong channel, or an objection line for the
 * rep's own situation) are skipped unless `everyLine` is set, as the library test does.
 */
export function scoreLines(question: AnalyzedQuestion, index = INDEX, everyLine = false): RetrievedLine[] {
  const queryTerms = [...new Set(question.content)];
  const ranked: RetrievedLine[] = [];
  for (const line of index.lines) {
    if (!everyLine && outOfScope(line, question)) continue;
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of queryTerms) {
      const tf = line.weights.get(term);
      if (!tf) continue;
      matchedTerms.push(term);
      const df = index.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (index.total - df + 0.5) / (df + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * line.length) / index.averageLength));
    }
    if (matchedTerms.length === 0) continue;
    if (line.primary) score *= 1.08; // the section's main line is the default answer
    const onTopic = matchedTerms.some((term) => line.topic.has(term));
    // One-word questions ("voicemail") are supported when the word is what the section is about.
    const enough = matchedTerms.length >= MIN_MATCHED_TERMS || (queryTerms.length === 1 && onTopic);
    ranked.push({ ref: line.ref, score: Math.round(score * 1000) / 1000, matchedTerms, supported: enough && onTopic && score >= MIN_SCORE });
  }
  return ranked.sort((a, b) => b.score - a.score || a.ref.line.id.localeCompare(b.ref.line.id));
}

/** Objection lines answer something a buyer said, so they need the buyer's side in the question. */
function outOfScope(line: IndexedLine, question: AnalyzedQuestion): boolean {
  if (channelConflict(question.channel, line.ref.document.channel)) return true;
  return line.ref.document.code === "OBJ" && !question.buyerVoice;
}

// excerpt:start retrieve
export function retrieveLines(question: AnalyzedQuestion, limit = 5, index = INDEX): RetrievalResult {
  const queryTerms = [...new Set(question.content)];
  const ranked = scoreLines(question, index);
  const top = ranked.find((line) => line.supported) ?? null;
  const base = { ranked: ranked.slice(0, limit), terms: queryTerms };
  if (!top) {
    return { ...base, decision: "none", best: null, alternative: null, reason: queryTerms.length ? "No line shares enough of the question's words with what its section is about" : "No content words to search for" };
  }
  // The closest rival from a different section that also clears the bar.
  const rival = ranked.find((line) => line.supported && line.ref.section.id !== top.ref.section.id) ?? null;
  const single = queryTerms.length === 1;
  if (rival && (single || (top.score - rival.score) / top.score < CLARIFY_MARGIN)) {
    return { ...base, decision: "clarify", best: top, alternative: rival, reason: single ? "One word fits more than one section" : "Two sections fit almost equally well" };
  }
  return { ...base, decision: "answer", best: top, alternative: null, reason: "Best line clears the bar with a clear margin" };
}
// excerpt:end retrieve
