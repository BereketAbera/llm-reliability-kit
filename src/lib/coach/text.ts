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

/**
 * Words that show up in almost every coaching question ("give me a good line",
 * "the prospect wants..."). They stay in the terms, so keyword groups can still
 * use them, but they never count as evidence that a question matches a line.
 */
const GENERIC_WORDS = (
  "give gave given good great best line lines need needs needed want wants wanted maybe month months week weeks " +
  "help way ways know make makes made like thing things something anything everything nothing one lot lots please " +
  "sale sales deal deals sell selling sold rep reps prospect prospects customer customers client clients buyer buyers " +
  "lead leads guy question questions handle handling respond word words exact trainer method script coach " +
  "product products tool tools company service solution team right now today ask asks asked asking about " +
  "objection objections new hard keep keeps happen happens go going goes pick picked okay ok hi hello hey " +
  "someone somebody anyone anybody everyone everybody people by from into through since but because while during " +
  "within without via per no not dont cant wont havent isnt arent didnt doesnt"
).split(" ");

const SYNONYMS: Record<string, string> = {
  pricey: "expensive",
  costly: "expensive",
  overpriced: "expensive",
  money: "budget",
  funds: "budget",
  funding: "budget",
  boss: "manager",
  bosses: "manager",
  director: "manager",
  supervisor: "manager",
  supplier: "vendor",
  suppliers: "vendor",
  provider: "vendor",
  providers: "vendor",
  incumbent: "vendor",
  info: "information",
  brochures: "brochure",
  intro: "introduction",
  introduce: "introduction",
  introductions: "introduction",
  introducing: "introduction",
  approval: "approve",
  renewal: "renew",
  slammed: "busy",
};

function isConsonant(word: string, i: number): boolean {
  const ch = word[i];
  if ("aeiou".includes(ch)) return false;
  if (ch === "y") return i === 0 || !isConsonant(word, i - 1);
  return true;
}

/** Porter's measure: how many vowel-consonant sequences the stem has. */
function measure(stem: string): number {
  let m = 0;
  let i = 0;
  while (i < stem.length && isConsonant(stem, i)) i++;
  while (i < stem.length) {
    while (i < stem.length && !isConsonant(stem, i)) i++;
    if (i >= stem.length) break;
    while (i < stem.length && isConsonant(stem, i)) i++;
    m++;
  }
  return m;
}

function hasVowel(stem: string): boolean {
  for (let i = 0; i < stem.length; i++) if (!isConsonant(stem, i)) return true;
  return false;
}

/** Consonant-vowel-consonant ending, as in "clos" or "tim" (but not "w", "x" or "y" last). */
function endsCvc(stem: string): boolean {
  const n = stem.length;
  return n >= 3 && isConsonant(stem, n - 3) && !isConsonant(stem, n - 2) && isConsonant(stem, n - 1) && !"wxy".includes(stem[n - 1]);
}

/**
 * A light Porter-style stemmer: plurals, then -ed/-ing, then a silent final e,
 * so "close", "closes", "closed" and "closing" all become "clos", and "time" and "timing" agree.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);

  let stripped = false;
  if (w.endsWith("ied") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && w.length > 4 && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    stripped = true;
  } else if (w.endsWith("ing") && w.length > 5 && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    stripped = true;
  }
  if (stripped) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w = `${w}e`;
    else if (/([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCvc(w)) w = `${w}e`;
  }
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

export function words(text: string): string[] {
  const normalized = normalizeForCompare(text);
  return normalized ? normalized.split(" ").filter((word) => word.length > 1 || /\d/.test(word)) : [];
}

function toTerm(word: string): string {
  return stem(SYNONYMS[word] ?? word);
}

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word) && !KEEP.has(word);
}

const GENERIC_TERMS = new Set(GENERIC_WORDS.map(toTerm));

/** True for a term that never counts as evidence on its own (see GENERIC_WORDS). */
export function isGeneric(term: string): boolean {
  return GENERIC_TERMS.has(term);
}

/** Terms: no stopwords, synonyms folded, lightly stemmed. */
export function terms(text: string): string[] {
  return words(text)
    .filter((word) => !isStopword(word))
    .map(toTerm);
}

/** Terms that count as evidence: `terms` without the generic words. */
export function contentTerms(text: string): string[] {
  return terms(text).filter((term) => !isGeneric(term));
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
  private readonly stems = new Set<string>();

  add(text: string): void {
    for (const word of words(text)) {
      if (word.length < 3 || isStopword(word)) continue;
      this.counts.set(word, (this.counts.get(word) ?? 0) + 1);
      this.stems.add(toTerm(word));
    }
  }

  has(word: string): boolean {
    return this.counts.has(word);
  }

  /**
   * Closest library word for a likely typo, or undefined. A word is only treated
   * as a typo when it is not a real English word (so "bake", "deck" and "loop"
   * stay as typed) and its stem is not already known (so "needs" stays "needs").
   */
  correct(word: string, isEnglishWord: (word: string) => boolean): string | undefined {
    if (word.length < 4 || this.counts.has(word) || /\d/.test(word)) return undefined;
    if (this.stems.has(toTerm(word)) || isEnglishWord(word)) return undefined;
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

export type Channel = "email" | "call";

const EMAIL_WORDS = new Set(["email", "emails", "emailed", "emailing", "mail", "inbox"]);
const CALL_WORDS = new Set(["call", "calls", "called", "calling", "phone", "phoned", "phoning", "voicemail", "voicemails", "dial", "dialed", "dialing", "ring", "rang"]);
/** Words that show the rep is reporting what a buyer said or did, not asking about their own task. */
const BUYER_WORDS = new Set([
  "they", "theyre", "theyve", "theyll", "theyd", "them", "their", "theirs", "she", "shes", "her", "hers", "he", "hes", "him", "his",
  "prospect", "prospects", "customer", "customers", "client", "clients", "buyer", "buyers", "guy",
]);

export interface AnalyzedQuestion {
  /** Every term after stopwords, synonyms and stemming. */
  terms: string[];
  /** The terms that count as evidence (no generic words). */
  content: string[];
  corrections: Array<{ from: string; to: string }>;
  /** The question names one channel only ("email" or a call), or neither. */
  channel: Channel | null;
  /** The question reports something a buyer said ("they said", "the prospect wants"). */
  buyerCue: boolean;
  /**
   * The question carries the buyer's side: it reports what they said, names an
   * objection, or is typed as their words ("We don't have time for this").
   * "The line was busy when I called, should I call back?" is the rep's own situation.
   */
  buyerVoice: boolean;
}

const QUOTE_OPENERS = new Set(["i", "im", "ive", "id", "ill", "we", "were", "weve", "wed", "well", "our", "lets", "let"]);

/**
 * Terms for a rep's question. With `vocabulary`, words that are not real English
 * are corrected to the closest word the library uses ("pirce" → "price").
 */
export function analyzeQuestion(
  question: string,
  correction?: { vocabulary: Vocabulary; isEnglishWord: (word: string) => boolean },
): AnalyzedQuestion {
  const all = words(question);
  const corrections: Array<{ from: string; to: string }> = [];
  const out: string[] = [];
  for (const word of all) {
    if (isStopword(word)) continue;
    const fixed = correction ? correction.vocabulary.correct(word, correction.isEnglishWord) : undefined;
    if (fixed) corrections.push({ from: word, to: fixed });
    out.push(toTerm(fixed ?? word));
  }
  const email = all.some((word) => EMAIL_WORDS.has(word));
  const call = all.some((word) => CALL_WORDS.has(word));
  const buyerCue = all.some((word) => BUYER_WORDS.has(word));
  const typedAsQuote = !question.includes("?") && QUOTE_OPENERS.has(all[0] ?? "");
  return {
    terms: out,
    content: out.filter((term) => !isGeneric(term)),
    corrections,
    channel: email && !call ? "email" : call && !email ? "call" : null,
    buyerCue,
    // A one- or two-word search ("budget", "price objection") is a topic, not the rep's own situation.
    buyerVoice: buyerCue || typedAsQuote || all.length <= 2 || all.includes("objection") || all.includes("objections"),
  };
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}
