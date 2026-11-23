import { brotliDecompressSync } from "node:zlib";
import { ENGLISH_WORDS_BR_BASE64 } from "./english-words.data";

/** Everyday words the 1934 dictionary predates. */
const MODERN_WORDS = [
  "app", "apps", "blog", "chatbot", "crm", "demo", "demos", "ebook", "ecommerce", "email", "emails", "emailed", "emailing",
  "inbox", "internet", "linkedin", "offsite", "okay", "online", "onsite", "podcast", "saas", "salesforce", "smartphone",
  "software", "startup", "startups", "voicemail", "voicemails", "webinar", "website", "websites", "wifi", "zoom",
];

let words: Set<string> | null = null;

/** Lazily decoded on the first typo check: questions that match never pay for it. */
function englishWords(): Set<string> {
  if (!words) {
    const text = brotliDecompressSync(Buffer.from(ENGLISH_WORDS_BR_BASE64, "base64")).toString("utf8");
    words = new Set([...text.split("\n"), ...MODERN_WORDS]);
  }
  return words;
}

/** Plain base forms of an inflected word: "needs" → "need", "stopped" → "stop", "closing" → "close". */
export function baseForms(word: string): string[] {
  const forms = new Set<string>();
  const add = (form: string) => {
    if (form.length >= 2) forms.add(form);
  };
  if (word.endsWith("ies")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) add(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss")) add(word.slice(0, -1));
  if (word.endsWith("ied")) add(`${word.slice(0, -3)}y`);
  for (const suffix of ["ed", "ing", "er", "est", "ly"]) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    add(base);
    add(`${base}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) add(base.slice(0, -1));
  }
  return [...forms];
}

/** True for a real English word or a regular inflection of one. */
export function isEnglishWord(word: string): boolean {
  const dictionary = englishWords();
  if (dictionary.has(word)) return true;
  return baseForms(word).some((form) => dictionary.has(form));
}
