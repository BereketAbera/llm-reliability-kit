import { CATALOG, type Catalog, type LineRef } from "../content/catalog";
import { analyzeQuestion, terms } from "./text";
import { VOCABULARY } from "./vocabulary";

/**
 * Line-level BM25. Each approved script line is its own search document, with its
 * section's title and tags weighted up, so a question lands on the exact line to
 * say, not just on the method's name.
 */
const FIELD_WEIGHTS = { line: 1, title: 2, tags: 2, why: 0.5 };
const K1 = 1.2;
const B = 0.75;
/** A line must share at least this many distinct terms with the question. */
const MIN_MATCHED_TERMS = 2;

interface IndexedLine {
  ref: LineRef;
  weights: Map<string, number>;
  length: number;
  primary: boolean;
}

export interface RetrievedLine {
  ref: LineRef;
  score: number;
  matchedTerms: string[];
}

export interface RetrievalResult {
  best: RetrievedLine | null;
  ranked: RetrievedLine[];
  terms: string[];
}

export function buildIndex(catalog: Catalog = CATALOG) {
  const lines: IndexedLine[] = catalog.scripts.map((ref) => {
    const weights = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const term of terms(text)) weights.set(term, (weights.get(term) ?? 0) + weight);
    };
    add(ref.line.text, FIELD_WEIGHTS.line);
    add(ref.section.title, FIELD_WEIGHTS.title);
    add(ref.section.tags.join(" "), FIELD_WEIGHTS.tags);
    add(ref.section.why.text, FIELD_WEIGHTS.why);
    const length = [...weights.values()].reduce((sum, value) => sum + value, 0);
    return { ref, weights, length, primary: ref.section.scripts[0]?.id === ref.line.id };
  });
  const documentFrequency = new Map<string, number>();
  for (const line of lines) for (const term of line.weights.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const averageLength = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(1, lines.length);
  return { lines, documentFrequency, averageLength, total: lines.length };
}

const INDEX = buildIndex();

// excerpt:start retrieve
export function retrieveLines(question: string, limit = 5, index = INDEX): RetrievalResult {
  const queryTerms = [...new Set(analyzeQuestion(question, VOCABULARY).terms)];
  const ranked: RetrievedLine[] = [];
  for (const line of index.lines) {
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
    ranked.push({ ref: line.ref, score: Math.round(score * 1000) / 1000, matchedTerms });
  }
  ranked.sort((a, b) => b.score - a.score || a.ref.line.id.localeCompare(b.ref.line.id));
  const top = ranked[0];
  const best = top && top.matchedTerms.length >= Math.min(MIN_MATCHED_TERMS, queryTerms.length) && queryTerms.length > 0 ? top : null;
  return { best, ranked: ranked.slice(0, limit), terms: queryTerms };
}
// excerpt:end retrieve
