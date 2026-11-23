import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads a marked region straight from the source at build time, so the code on
 * the explanation page is the code that runs.
 */
export function excerpt(file: string, name: string): string {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const start = source.indexOf(`// excerpt:start ${name}`);
  const end = source.indexOf(`// excerpt:end ${name}`);
  if (start === -1 || end === -1) throw new Error(`Excerpt ${name} not found in ${file}`);
  const body = source.slice(source.indexOf("\n", start) + 1, end);
  const lines = body.replace(/\s+$/, "").split("\n").filter((line) => !line.includes("// excerpt:"));
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)?.[0].length ?? 0));
  return lines.map((line) => line.slice(indent)).join("\n");
}

export function readRepoFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}
