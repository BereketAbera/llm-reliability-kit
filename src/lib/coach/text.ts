// excerpt:start normalize
/** Lowercase, drop accents, apostrophes and punctuation, collapse whitespace. */
export function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when `answer` contains `line` word for word, ignoring case, whitespace and punctuation. */
export function containsVerbatim(answer: string, line: string): boolean {
  const needle = normalizeForCompare(line);
  if (!needle) return false;
  return ` ${normalizeForCompare(answer)} `.includes(` ${needle} `);
}
// excerpt:end normalize

const STOPWORDS = new Set(
  (
    "a an the is are was were be been am to of and or in on for with at it its this that these those " +
    "i im ive me my we were our ours us you your youre they theyre them their he hes him his she shes her " +
    "do does did doing done what whats how when so just some can could should would will if as then than " +
    "there theres here have has had say says said saying tell told really very way too also get got " +
    "any all who whom which s t d ll re ve m"
  ).split(" "),
);
// "who" is noise in most questions but matters in a few ("who does what"); it is restored below.
const KEEP = new Set(["who"]);

const SYNONYMS: Record<string, string> = {
  pricey: "expensive",
  costly: "expensive",
  overpriced: "expensive",
  money: "budget",
  funds: "budget",
  funding: "budget",
  boss: "manager",
  director: "manager",
  supervisor: "manager",
  supplier: "vendor",
  suppliers: "vendor",
  provider: "vendor",
  incumbent: "vendor",
  info: "information",
  brochures: "brochure",
  intro: "introduction",
  introduce: "introduction",
  introductions: "introduction",
  introducing: "introduction",
};

export function stem(word: string): string {
  let current = word;
  for (let pass = 0; pass < 2; pass++) {
    const before = current;
    if (current.length <= 3) break;
    if (current.endsWith("ies") || current.endsWith("ied")) current = `${current.slice(0, -3)}y`;
    else if (current.endsWith("ing") && current.length > 5) current = current.slice(0, -3);
    else if (current.endsWith("ed") && current.length > 4) current = current.slice(0, -2);
    else if (current.endsWith("es") && current.length > 4) current = current.slice(0, -2);
    else if (current.endsWith("s") && !current.endsWith("ss") && current.length > 3) current = current.slice(0, -1);
    else if (current.endsWith("e") && current.length > 4) current = current.slice(0, -1);
    if (current === before) break;
  }
  return current;
}

export function words(text: string): string[] {
  const normalized = normalizeForCompare(text);
  return normalized ? normalized.split(" ") : [];
}

function toTerm(word: string): string {
  return stem(SYNONYMS[word] ?? word);
}

/** Content terms: no stopwords, synonyms folded, lightly stemmed. */
export function terms(text: string): string[] {
  return words(text)
    .filter((word) => KEEP.has(word) || !STOPWORDS.has(word))
    .map(toTerm);
}

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word) && !KEEP.has(word);
}

/** Optimal string alignment distance: edits plus adjacent swaps ("pirce" to "price" is 1). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export class Vocabulary {
  private readonly counts = new Map<string, number>();

  add(text: string): void {
    for (const word of words(text)) {
      if (word.length < 3 || isStopword(word)) continue;
      this.counts.set(word, (this.counts.get(word) ?? 0) + 1);
    }
  }

  has(word: string): boolean {
    return this.counts.has(word);
  }

  /** Closest known word for a likely typo, or undefined when nothing is close enough. */
  correct(word: string): string | undefined {
    if (word.length < 4 || this.counts.has(word) || /\d/.test(word)) return undefined;
    const maxDistance = word.length >= 8 ? 2 : 1;
    let best: { word: string; distance: number; count: number } | undefined;
    for (const [candidate, count] of this.counts) {
      if (Math.abs(candidate.length - word.length) > maxDistance) continue;
      const distance = editDistance(word, candidate);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance || (distance === best.distance && count > best.count)) {
        best = { word: candidate, distance, count };
      }
    }
    return best?.word;
  }
}

export interface AnalyzedQuestion {
  terms: string[];
  corrections: Array<{ from: string; to: string }>;
}

/** Terms for a rep's question, with typos corrected against the words the library actually uses. */
export function analyzeQuestion(question: string, vocabulary: Vocabulary): AnalyzedQuestion {
  const corrections: Array<{ from: string; to: string }> = [];
  const out: string[] = [];
  for (const word of words(question)) {
    if (isStopword(word)) continue;
    const fixed = vocabulary.correct(word);
    if (fixed) corrections.push({ from: word, to: fixed });
    out.push(toTerm(fixed ?? word));
  }
  return { terms: out, corrections };
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}
