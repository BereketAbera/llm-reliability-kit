import { describe, expect, it } from "vitest";
import { getLine } from "../content/catalog";
import { simulateParaphrase } from "./coach";
import { scoreAnswer } from "./scorer";
import { containsVerbatim, normalizeForCompare } from "./text";

const line = getLine("OBJ-1.2").line.text; // "That's fair to raise. Before we talk about our price, can we put a number on ..."

describe("scorer normalization", () => {
  it("ignores case, whitespace, punctuation and curly quotes", () => {
    expect(normalizeForCompare("  That’s   FAIR to raise —  before… ")).toBe("thats fair to raise before");
    const messy = `Try this:\n\n“${line.toUpperCase().replace(/,/g, " ;").replace(/ /g, "   ")}”`;
    expect(scoreAnswer({ text: messy }, ["OBJ-1.2"])).toMatchObject({ onMethod: true, matchedLineId: "OBJ-1.2" });
  });

  it("gives no credit for a paraphrase, even a close one", () => {
    const paraphrased = simulateParaphrase(line);
    expect(normalizeForCompare(paraphrased)).not.toContain(normalizeForCompare(line));
    expect(scoreAnswer({ text: paraphrased }, ["OBJ-1.2"]).onMethod).toBe(false);
    expect(scoreAnswer({ text: "Use the price-follows-proof method and ask about cost." }, ["OBJ-1.2"]).onMethod).toBe(false);
  });

  it("matches whole words only", () => {
    expect(containsVerbatim("I'll stop there. What do you think?", "What do you think")).toBe(true);
    expect(containsVerbatim("What do you thinks about it", "What do you think")).toBe(false);
  });

  it("credits an exact quote of the right source line", () => {
    const result = scoreAnswer({ text: "See the quote below.", quote: { lineId: "OBJ-1.2", text: line } }, ["OBJ-1.2"]);
    expect(result).toMatchObject({ onMethod: true, reason: "Quotes source line OBJ-1.2 exactly" });
  });

  it("does not credit the right ID with reworded text", () => {
    const result = scoreAnswer({ text: "See below.", quote: { lineId: "OBJ-1.2", text: simulateParaphrase(line) } }, ["OBJ-1.2"]);
    expect(result.onMethod).toBe(false);
  });

  it("explains a wrong line and a missing answer", () => {
    const other = getLine("OBJ-1.3").line.text;
    expect(scoreAnswer({ text: other, quote: { lineId: "OBJ-1.3", text: other } }, ["OBJ-1.2"]).reason).toBe("Used OBJ-1.3, expected OBJ-1.2");
    expect(scoreAnswer({ text: "I don't have an approved line for that yet.", path: "no-match" }, ["OBJ-1.2"]).reason).toBe("No approved line returned");
  });
});
