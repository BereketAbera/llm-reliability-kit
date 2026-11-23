import { describe, expect, it } from "vitest";
import { getLine } from "../content/catalog";
import { FOLLOW_UP_PROMPT, NO_MATCH_TEXT, answerQuestion } from "./coach";
import { containsVerbatim } from "./text";

describe("coach answers", () => {
  it("returns the approved bank answer verbatim, then one follow-up offer", () => {
    const answer = answerQuestion("She needs to run it by her boss first");
    expect(answer.path).toBe("answer-bank");
    expect(answer.text).toBe(getLine("OBJ-5.2").line.text);
    expect(answer.followUp?.prompt).toBe(FOLLOW_UP_PROMPT);
    expect(answer.followUp?.why).toBe(getLine("OBJ-5.1").line.text);
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
    const answer = answerQuestion("What's the best CRM for a small team?");
    expect(answer.path).toBe("no-match");
    expect(answer.text).toBe(NO_MATCH_TEXT);
    expect(answer.quote).toBeUndefined();
  });
});
