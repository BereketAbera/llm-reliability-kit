import { describe, expect, it } from "vitest";
import { retrieveLines } from "../coach/retrieval";
import { ANSWER_BANK } from "./answer-bank";
import { CATALOG, currentDocuments, validateLibrary } from "./catalog";
import { ALL_DOCUMENTS } from "./library";

describe("document library", () => {
  it("has one current version of each document and no duplicate lines", () => {
    expect(validateLibrary()).toEqual([]);
    const slugs = currentDocuments().map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("flags two approved versions of the same document", () => {
    const duplicate = { ...ALL_DOCUMENTS[1], version: 9 };
    expect(validateLibrary([...ALL_DOCUMENTS, duplicate]).map((issue) => issue.kind)).toContain("duplicate-current-version");
  });

  it("never searches a superseded version", () => {
    expect(CATALOG.excluded.map((doc) => `${doc.slug} v${doc.version}`)).toEqual(["objection-playbook v2"]);
    const old = retrieveLines("I understand. What would you say the problem is costing you?");
    expect(old.ranked.every((hit) => !hit.ref.line.id.startsWith("OBJ2"))).toBe(true);
  });

  it("points every bank entry at a current approved line", () => {
    for (const entry of ANSWER_BANK) {
      const ref = CATALOG.lines.get(entry.lineId);
      expect(ref, entry.id).toBeDefined();
      expect(ref!.line.kind).toBe("script");
    }
  });

  it("can retrieve every approved line from its own text (no content is silently blocked)", () => {
    for (const ref of CATALOG.scripts) {
      expect(retrieveLines(ref.line.text).best?.ref.line.id, ref.line.text).toBe(ref.line.id);
    }
  });
});
