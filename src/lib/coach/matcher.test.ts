import { describe, expect, it } from "vitest";
import { ANSWER_BANK } from "../content/answer-bank";
import { DEFAULT_MATCHER, matchBank as matchAnalyzed, type MatcherConfig } from "./matcher";
import { analyzeQuestion } from "./text";

const matchBank = (question: string, config?: MatcherConfig) => matchAnalyzed(analyzeQuestion(question), config);

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

  it("does not match a bare topic word in the rep's own question", () => {
    for (const question of [
      "What's my budget for the team offsite?",
      "How do I send the contract for e-signature?",
      "How do I ask my manager for a raise?",
      "Is there a discount code for the sales conference?",
      "How do I write a proposal for a new client?",
      "The line was busy when I called, should I call back?",
    ]) {
      expect(matchBank(question).match, question).toBeNull();
    }
  });

  it("counts a single topic word when the question reports what the buyer said", () => {
    expect(matchBank("They want a discount").match?.entry.id).toBe("AB-20");
    expect(matchBank("He's busy").match?.entry.id).toBe("AB-12");
  });

  it("needs two shared words for a look-alike match", () => {
    // "next" alone is shared with "the next step", but that is not the same question.
    expect(matchBank("They said maybe next month").match).toBeNull();
  });

  it("never offers an email answer for a call question, or the reverse", () => {
    const result = matchBank("I need a good opening line for an email");
    expect(result.candidates.find((c) => c.entry.id === "AB-17")?.excluded).toBe("channel");
    expect(result.match?.entry.id).not.toBe("AB-17");
  });

  it("falls back when the threshold is raised above the score", () => {
    const question = "we use someone else and honestly it works";
    const score = matchBank(question).match!.score;
    expect(matchBank(question, { ...DEFAULT_MATCHER, threshold: score - 0.01 }).decision).toBe("matched");
    expect(matchBank(question, { ...DEFAULT_MATCHER, threshold: score + 0.01 }).decision).toBe("below-threshold");
  });

  it("treats two close keyword hits as a tie instead of guessing", () => {
    const result = matchBank("The prospect went quiet after my proposal");
    expect(result.decision).toBe("ambiguous");
    expect(result.candidates.slice(0, 2).map((c) => c.entry.id).sort()).toEqual(["AB-14", "AB-15"]);
  });

  it("matches every bank entry from its own example phrasings", () => {
    for (const entry of ANSWER_BANK) {
      for (const example of entry.examples) {
        expect(matchBank(example).match?.entry.id, `${entry.id}: ${example}`).toBe(entry.id);
      }
    }
  });
});
