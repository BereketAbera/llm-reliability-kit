import { describe, expect, it } from "vitest";
import { ANSWER_BANK } from "../content/answer-bank";
import { DEFAULT_MATCHER, matchBank } from "./matcher";

describe("answer bank matcher", () => {
  it("matches a common phrasing on a keyword hit", () => {
    const result = matchBank("The prospect says our price is way too high");
    expect(result.decision).toBe("matched");
    expect(result.match?.entry.id).toBe("AB-01");
    expect(result.match?.keywordHit).toBe(true);
    expect(result.match!.score).toBeGreaterThanOrEqual(DEFAULT_MATCHER.threshold);
  });

  it("matches on intent similarity alone when no keyword group is complete", () => {
    const result = matchBank("we use someone else and honestly it works");
    expect(result.match?.entry.id).toBe("AB-04");
    expect(result.match?.keywordHit).toBe(false);
    expect(result.match!.similarity).toBeGreaterThanOrEqual(DEFAULT_MATCHER.threshold);
  });

  it("stays below the threshold for questions the bank does not cover", () => {
    for (const question of ["What's the weather tomorrow?", "Write me a poem about spreadsheets", "How do I recap the demo by email?"]) {
      const result = matchBank(question);
      expect(result.match, question).toBeNull();
      expect(result.decision).toBe("below-threshold");
      expect(result.candidates[0].score).toBeLessThan(DEFAULT_MATCHER.threshold);
    }
  });

  it("falls back when the threshold is raised above the score", () => {
    const question = "we use someone else and honestly it works";
    const score = matchBank(question).match!.score;
    expect(matchBank(question, { ...DEFAULT_MATCHER, threshold: score - 0.01 }).decision).toBe("matched");
    expect(matchBank(question, { ...DEFAULT_MATCHER, threshold: score + 0.01 }).decision).toBe("below-threshold");
  });

  it("treats two close candidates as ambiguous instead of guessing", () => {
    const question = "price is too high and I need to talk to my boss";
    const result = matchBank(question, { threshold: 0.55, margin: 0.5 });
    expect(result.decision).toBe("ambiguous");
    expect(result.match).toBeNull();
  });

  it("corrects typos against the library's own words", () => {
    const result = matchBank("pirce is to hihg");
    expect(result.analyzed.corrections).toEqual(
      expect.arrayContaining([
        { from: "pirce", to: "price" },
        { from: "hihg", to: "high" },
      ]),
    );
    expect(result.match?.entry.id).toBe("AB-01");
  });

  it("matches every bank entry from its own example phrasings", () => {
    for (const entry of ANSWER_BANK) {
      for (const example of entry.examples) {
        expect(matchBank(example).match?.entry.id, `${entry.id}: ${example}`).toBe(entry.id);
      }
    }
  });
});
