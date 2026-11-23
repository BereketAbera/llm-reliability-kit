import { describe, expect, it } from "vitest";
import { getLine } from "../content/catalog";
import { CLARIFY_TEXT, FOLLOW_UP_PROMPT, NO_MATCH_TEXT, answerQuestion } from "./coach";
import { containsVerbatim } from "./text";

describe("coach answers", () => {
  it("returns the approved bank answer verbatim, then one follow-up offer", () => {
    const answer = answerQuestion("She needs to run it by her boss first");
    expect(answer.path).toBe("answer-bank");
    expect(answer.text).toBe(getLine("OBJ-5.2").line.text);
    expect(answer.followUp?.prompt).toBe(FOLLOW_UP_PROMPT);
    expect(answer.followUp?.why).toBe(getLine("OBJ-5.1").line.text);
    // "needs" is a real word: nothing to correct.
    expect(answer.trace.corrections).toEqual([]);
  });

  it("falls back to the exact source line with a citation", () => {
    const answer = answerQuestion("What should I say when I get their voicemail?");
    expect(answer.path).toBe("retrieval");
    expect(answer.quote?.lineId).toBe("OPN-3.2");
    expect(answer.text).toBe(getLine("OPN-3.2").line.text);
    expect(answer.quote?.citation).toContain("Call openers and discovery v1");
  });

  it("restores the approved line when a model paraphrases it", () => {
    const answer = answerQuestion("What should I say when I get their voicemail?", { paraphrase: true });
    expect(answer.guard.action).toBe("restored-exact-line");
    expect(answer.guard.modelDraft).toBeDefined();
    expect(containsVerbatim(answer.text, getLine("OPN-3.2").line.text)).toBe(true);
  });

  it("lets a paraphrase through only when the guard is switched off", () => {
    const answer = answerQuestion("What should I say when I get their voicemail?", { paraphrase: true, guard: false });
    expect(containsVerbatim(answer.text, getLine("OPN-3.2").line.text)).toBe(false);
    expect(answer.quote?.text).toBe(answer.text);
  });

  it("declines instead of giving generic advice", () => {
    for (const question of ["What's the best CRM for a small team?", "How do I bake a cake?", "They want to see a case study first"]) {
      const answer = answerQuestion(question);
      expect(answer.path, question).toBe("no-match");
      expect(answer.text).toBe(NO_MATCH_TEXT);
      expect(answer.quote).toBeUndefined();
      expect(answer.trace.corrections, question).toEqual([]);
    }
  });

  it("fixes typos only when the question as typed matched nothing", () => {
    const answer = answerQuestion("pirce is to hihg they say");
    expect(answer.quote?.lineId).toBe("OBJ-1.2");
    expect(answer.trace.corrections.map((c) => c.to)).toEqual(["price", "high"]);
  });

  it("asks which situation when two fit, then answers with the one the rep picks", () => {
    const answer = answerQuestion("How do I close a sale?");
    expect(answer.path).toBe("clarify");
    expect(answer.text).toBe(CLARIFY_TEXT);
    expect(answer.quote).toBeUndefined();
    const lineIds = answer.options!.map((o) => o.lineId);
    expect(lineIds).toContain("CLS-5.2");
    const picked = answerQuestion("How do I close a sale?", { pick: "CLS-5.2" });
    expect(picked).toMatchObject({ path: "retrieval", chosen: true, text: getLine("CLS-5.2").line.text });
  });

  it("breaks a tie between two bank entries only when the line search clearly prefers one", () => {
    const answer = answerQuestion("They told me there's no budget for this until next year.");
    expect(answer).toMatchObject({ path: "answer-bank", bank: { id: "AB-02" } });
    expect(answer.trace.tieBreak).toEqual({ chosen: "AB-02", over: "AB-06" });
    expect(answerQuestion("The prospect went quiet after my proposal").path).toBe("clarify");
  });

  it("ignores a pick that is not an approved script line", () => {
    expect(answerQuestion("How do I close a sale?", { pick: "CLS-5.1" }).path).toBe("clarify");
    expect(answerQuestion("How do I close a sale?", { pick: "NOPE-1.2" }).path).toBe("clarify");
  });
});
