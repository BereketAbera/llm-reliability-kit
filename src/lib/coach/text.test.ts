import { describe, expect, it } from "vitest";
import { isEnglishWord } from "./english";
import { analyzeQuestion, contentTerms, stem } from "./text";
import { VOCABULARY } from "./vocabulary";

const corrected = (question: string) => analyzeQuestion(question, { vocabulary: VOCABULARY, isEnglishWord }).corrections;

describe("stemming", () => {
  it("brings the forms of a word together without mangling it", () => {
    for (const word of ["close", "closes", "closed", "closing"]) expect(stem(word), word).toBe("clos");
    expect(stem("timing")).toBe(stem("time"));
    expect(stem("pricing")).toBe(stem("price"));
    expect(stem("replies")).toBe("reply");
    expect(stem("stopped")).toBe("stop");
    expect(stem("meetings")).toBe("meet");
    expect(stem("business")).toBe("business");
  });
});

describe("generic words", () => {
  it("never count as evidence for a match", () => {
    expect(contentTerms("Give me a good closing line")).toEqual(["clos"]);
    expect(contentTerms("They said maybe next month")).toEqual(["next"]);
  });
});

describe("typo correction", () => {
  it("leaves real English words alone", () => {
    for (const question of ["How do I bake a cake?", "send him a deck", "loop in the CFO", "where do I post this", "they have gone quiet", "she needs to run it by her boss"]) {
      expect(corrected(question), question).toEqual([]);
    }
  });

  it("fixes words that are not English, using the library's own words", () => {
    expect(corrected("pirce is to hihg")).toEqual([
      { from: "pirce", to: "price" },
      { from: "hihg", to: "high" },
    ]);
  });

  it("knows inflections and modern words are real", () => {
    for (const word of ["needs", "closing", "emails", "voicemail", "replied"]) expect(isEnglishWord(word), word).toBe(true);
    for (const word of ["pirce", "hihg", "bugdet"]) expect(isEnglishWord(word), word).toBe(false);
  });
});

describe("question signals", () => {
  it("reads the channel only when one is named", () => {
    expect(analyzeQuestion("I need a good opening line for an email").channel).toBe("email");
    expect(analyzeQuestion("What should I say when I get their voicemail?").channel).toBe("call");
    expect(analyzeQuestion("What should my follow-up email say after a first call?").channel).toBeNull();
  });

  it("tells the buyer's words from the rep's own situation", () => {
    expect(analyzeQuestion("They said they're too busy").buyerVoice).toBe(true);
    expect(analyzeQuestion("We don't have time for a demo").buyerVoice).toBe(true);
    expect(analyzeQuestion("How do I handle a price objection?").buyerVoice).toBe(true);
    expect(analyzeQuestion("The line was busy when I called, should I call back?").buyerVoice).toBe(false);
    expect(analyzeQuestion("Is there a discount code for the sales conference?").buyerVoice).toBe(false);
  });
});
