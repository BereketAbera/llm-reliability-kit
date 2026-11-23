import { ALL_DOCUMENTS } from "./library";
import { normalizeForCompare } from "../coach/text";
import type { LibraryDocument, LibraryLine, LibrarySection } from "./types";

export interface LineRef {
  line: LibraryLine;
  section: LibrarySection;
  document: LibraryDocument;
}

export interface LibraryIssue {
  kind: "duplicate-current-version" | "duplicate-line-id" | "duplicate-line-text" | "empty-section";
  detail: string;
}

/** One current version per document: the highest approved version of each slug. */
export function currentDocuments(documents: LibraryDocument[] = ALL_DOCUMENTS): LibraryDocument[] {
  const bySlug = new Map<string, LibraryDocument>();
  for (const doc of documents) {
    if (doc.status !== "approved") continue;
    const existing = bySlug.get(doc.slug);
    if (!existing || doc.version > existing.version) bySlug.set(doc.slug, doc);
  }
  return [...bySlug.values()];
}

export function validateLibrary(documents: LibraryDocument[] = ALL_DOCUMENTS): LibraryIssue[] {
  const issues: LibraryIssue[] = [];
  const approvedPerSlug = new Map<string, number>();
  for (const doc of documents) {
    if (doc.status === "approved") approvedPerSlug.set(doc.slug, (approvedPerSlug.get(doc.slug) ?? 0) + 1);
  }
  for (const [slug, count] of approvedPerSlug) {
    if (count > 1) issues.push({ kind: "duplicate-current-version", detail: `${slug} has ${count} approved versions` });
  }
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  for (const doc of currentDocuments(documents)) {
    for (const section of doc.sections) {
      if (section.scripts.length === 0) issues.push({ kind: "empty-section", detail: section.id });
      for (const line of [section.why, ...section.scripts]) {
        if (ids.has(line.id)) issues.push({ kind: "duplicate-line-id", detail: line.id });
        ids.add(line.id);
        if (line.kind !== "script") continue;
        const key = normalizeForCompare(line.text);
        const seen = texts.get(key);
        if (seen) issues.push({ kind: "duplicate-line-text", detail: `${line.id} repeats ${seen}` });
        texts.set(key, line.id);
      }
    }
  }
  return issues;
}

export interface Catalog {
  documents: LibraryDocument[];
  excluded: LibraryDocument[];
  lines: Map<string, LineRef>;
  scripts: LineRef[];
}

export function buildCatalog(documents: LibraryDocument[] = ALL_DOCUMENTS): Catalog {
  const current = currentDocuments(documents);
  const lines = new Map<string, LineRef>();
  const scripts: LineRef[] = [];
  for (const document of current) {
    for (const section of document.sections) {
      lines.set(section.why.id, { line: section.why, section, document });
      for (const line of section.scripts) {
        const ref = { line, section, document };
        lines.set(line.id, ref);
        scripts.push(ref);
      }
    }
  }
  return { documents: current, excluded: documents.filter((doc) => !current.includes(doc)), lines, scripts };
}

export const CATALOG = buildCatalog();

export function getLine(id: string): LineRef {
  const ref = CATALOG.lines.get(id);
  if (!ref) throw new Error(`Unknown line ${id}`);
  return ref;
}

export function citation(ref: LineRef): string {
  return `${ref.document.title} v${ref.document.version}, section ${ref.section.number} "${ref.section.title}", line ${ref.line.id.split(".")[1]}`;
}
