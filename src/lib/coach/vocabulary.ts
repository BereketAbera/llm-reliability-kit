import { ANSWER_BANK } from "../content/answer-bank";
import { CATALOG } from "../content/catalog";
import { Vocabulary } from "./text";

/** Every word the bank and the current library use: the reference for typo correction. */
export function buildVocabulary(): Vocabulary {
  const vocabulary = new Vocabulary();
  for (const entry of ANSWER_BANK) {
    entry.examples.forEach((example) => vocabulary.add(example));
    entry.keywords.forEach((group) => vocabulary.add(group.join(" ")));
    vocabulary.add(entry.intent);
  }
  for (const document of CATALOG.documents) {
    for (const section of document.sections) {
      vocabulary.add(section.title);
      vocabulary.add(section.tags.join(" "));
      vocabulary.add(section.why.text);
      section.scripts.forEach((line) => vocabulary.add(line.text));
    }
  }
  return vocabulary;
}

export const VOCABULARY = buildVocabulary();
