/**
 * pnpm words [path]: rebuilds src/lib/coach/english-words.data.ts.
 *
 * Source: the public-domain Webster's Second International word list that ships
 * with macOS and BSD as /usr/share/dict/words (pass another path to use a
 * different list). Lowercase words of 3 to 12 letters are kept, sorted,
 * Brotli-compressed and stored as base64, so the coach can tell a real word
 * ("bake", "deck", "loop") from a typo ("pirce") without a network call.
 * Only needed if you want a different list; the built file is committed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const source = process.argv[2] ?? "/usr/share/dict/words";
const words = [
  ...new Set(
    readFileSync(source, "utf8")
      .split("\n")
      .map((word) => word.trim())
      .filter((word) => /^[a-z]{3,12}$/.test(word)),
  ),
].sort();

const compressed = brotliCompressSync(Buffer.from(words.join("\n")), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24 },
});
const base64 = compressed.toString("base64");
const lines = base64.match(/.{1,120}/g) ?? [];
const out = path.resolve("src/lib/coach/english-words.data.ts");
writeFileSync(
  out,
  [
    "// Built by scripts/build-english-words.ts from the public-domain Webster's Second",
    `// International word list. ${words.length} lowercase words of 3 to 12 letters, Brotli + base64.`,
    "// Do not edit by hand: run `pnpm words` to rebuild.",
    "export const ENGLISH_WORDS_BR_BASE64 = [",
    ...lines.map((line) => `  "${line}",`),
    '].join("");',
    "",
  ].join("\n"),
);
console.log(`Wrote ${words.length} words (${compressed.length} bytes compressed) to ${out}`);
