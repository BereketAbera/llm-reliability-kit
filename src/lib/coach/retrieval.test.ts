import { describe, expect, it } from "vitest";
import { CLARIFY_MARGIN, buildIndex, retrieveLines } from "./retrieval";
import { analyzeQuestion } from "./text";

const retrieve = (question: string) => retrieveLines(analyzeQuestion(question));

describe("line retrieval", () => {
  it("needs two content words from what a section is about, not one shared word", () => {
    // Before: "give" and "line" were enough to return the cold-call opener.
    expect(retrieve("Give me a good closing line").best?.ref.line.id).not.toBe("OPN-1.2");
    // "case study" appears only inside a line's text, not in what the section is about.
    expect(retrieve("They want to see a case study first").decision).toBe("none");
  });

  it("finds the closing section through its title and tags", () => {
    const result = retrieve("How do I close a sale?");
    expect(result.decision).toBe("clarify");
    expect([result.best?.ref.section.id, result.alternative?.ref.section.id]).toContain("CLS-5");
  });

  it("never answers an email question with a call line", () => {
    const result = retrieve("I need a good opening line for an email");
    expect(result.ranked.every((line) => line.ref.document.channel !== "call")).toBe(true);
  });

  it("keeps objection lines for questions that carry the buyer's side", () => {
    expect(retrieve("The line was busy when I called, should I call back?").decision).toBe("none");
    expect(retrieve("She said she's swamped and has no time").best?.ref.line.id).toBe("OBJ-12.2");
  });

  it("asks which one when two sections are within the margin", () => {
    const result = retrieve("How do I follow up when nobody answers my emails?");
    expect(result.decision).toBe("clarify");
    const [best, other] = [result.best!, result.alternative!];
    expect(best.ref.section.id).not.toBe(other.ref.section.id);
    expect((best.score - other.score) / best.score).toBeLessThan(CLARIFY_MARGIN);
  });

  it("does not index fill-in slots such as [day] or [name]", () => {
    const index = buildIndex();
    const line = index.lines.find((l) => l.ref.line.id === "CLS-2.2")!;
    expect(line.weights.has("day")).toBe(false);
    expect(retrieve("I need a day off, who do I tell?").decision).toBe("none");
  });

  it("indexes the document title and channel", () => {
    const index = buildIndex();
    const close = index.lines.find((l) => l.ref.line.id === "CLS-4.2")!;
    expect(close.weights.has("clos")).toBe(true);
    const voicemail = index.lines.find((l) => l.ref.line.id === "OPN-3.2")!;
    expect(voicemail.weights.has("call")).toBe(true);
  });
});
