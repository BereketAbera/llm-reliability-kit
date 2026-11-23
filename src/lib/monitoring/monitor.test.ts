import { describe, expect, it } from "vitest";
import { bucketize, evaluateAlerts, monitoringSnapshot, type RunRecord } from "./monitor";

function run(minute: number, outcome: RunRecord["outcome"]): RunRecord {
  return { minute, rep: `Rep ${minute}`, intent: "Price", path: "answer-bank", client: "naive", outcome, latencyMs: 1_500, attempts: 1 };
}

describe("monitoring", () => {
  it("computes the error rate per window from the run log", () => {
    const runs = [run(1, "answered"), run(2, "failed"), run(3, "answered"), run(4, "busy-retry"), run(20, "answered")];
    const [first, second] = bucketize(runs, 15, 30);
    expect(first).toMatchObject({ requests: 4, failed: 1, busy: 1, errorRate: 0.25 });
    expect(second).toMatchObject({ requests: 1, failed: 0, errorRate: 0 });
  });

  it("alerts on three failed answers within five minutes, not on two", () => {
    const three = [run(1, "failed"), run(2, "failed"), run(4, "failed")];
    expect(evaluateAlerts(three, bucketize(three)).some((a) => a.ruleId === "failed-answers")).toBe(true);
    const two = [run(1, "failed"), run(9, "failed")];
    expect(evaluateAlerts(two, bucketize(two)).some((a) => a.ruleId === "failed-answers")).toBe(false);
  });

  it("shows the simulated day dropping to zero failed answers after the fix", () => {
    const snapshot = monitoringSnapshot();
    expect(snapshot.before.errorRate).toBeGreaterThan(0.05);
    expect(snapshot.after.failed).toBe(0);
    expect(snapshot.alerts.some((a) => a.ruleId === "error-rate")).toBe(true);
  });
});
