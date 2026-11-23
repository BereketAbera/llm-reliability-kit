import { describe, expect, it } from "vitest";
import { sanitizeRuns } from "./local-runs";

describe("runs kept in this browser", () => {
  it("keeps only well-formed entries, so a bad one cannot break the page", () => {
    const good = { at: "2026-11-23T10:00:00.000Z", kind: "ask", label: "Price", total: 1, failed: 0 };
    expect(sanitizeRuns([null, 3, "x", { ...good, total: "1" }, { ...good, kind: "other" }, { ...good, at: "yesterday" }, good])).toEqual([good]);
    expect(sanitizeRuns({ not: "a list" })).toEqual([]);
    expect(sanitizeRuns(null)).toEqual([]);
  });
});
