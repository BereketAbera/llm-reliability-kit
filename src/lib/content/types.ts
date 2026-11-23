export type DocumentStatus = "approved" | "draft" | "superseded";

export interface LibraryLine {
  /** Stable ID, for example OBJ-1.2: document code, section, line. */
  id: string;
  kind: "why" | "script";
  text: string;
}

export interface LibrarySection {
  id: string;
  number: number;
  title: string;
  tags: string[];
  why: LibraryLine;
  scripts: LibraryLine[];
}

export interface LibraryDocument {
  code: string;
  slug: string;
  title: string;
  version: number;
  status: DocumentStatus;
  approvedOn: string;
  sections: LibrarySection[];
}

export interface SectionInput {
  title: string;
  tags: string[];
  why: string;
  say: string[];
}

export interface DocumentInput {
  code: string;
  slug: string;
  title: string;
  version: number;
  status: DocumentStatus;
  approvedOn: string;
  sections: SectionInput[];
}

/** Line 1 of every section explains why the method works; lines 2+ are the exact lines to say or write. */
export function defineDocument(input: DocumentInput): LibraryDocument {
  return {
    code: input.code,
    slug: input.slug,
    title: input.title,
    version: input.version,
    status: input.status,
    approvedOn: input.approvedOn,
    sections: input.sections.map((section, index) => {
      const number = index + 1;
      const id = `${input.code}-${number}`;
      return {
        id,
        number,
        title: section.title,
        tags: section.tags,
        why: { id: `${id}.1`, kind: "why", text: section.why },
        scripts: section.say.map((text, lineIndex) => ({ id: `${id}.${lineIndex + 2}`, kind: "script", text })),
      };
    }),
  };
}
