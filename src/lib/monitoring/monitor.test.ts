import { describe, expect, it } from "vitest";
import { DEPLOY_MINUTE, bucketize, evaluateAlerts, monitoringSnapshot, type RunRecord } from "./monitor";

function run(minute: number, outcome: RunRecord["outcome"]): RunRecord {
  return { minute, rep: `Rep ${minute}`, intent: "Price", path: "retrieval", client: "naive", outcome, latencyMs: 1_500, attempts: 1 };
}

describe("monitoring", () => {
  it("counts a calm 'try again' as unanswered in the error rate", () => {
    const runs = [run(1, "answered"), run(2, "failed"), run(3, "answered"), run(4, "busy-retry"), run(20, "answered")];
    const [first, second] = bucketize(runs, 15, 30);
    expect(first).toMatchObject({ requests: 4, failed: 1, busy: 1, unanswered: 2, errorRate: 0.5 });
    expect(second).toMatchObject({ requests: 1, failed: 0, errorRate: 0 });
  });

  it("alerts on three unanswered questions within five minutes, not on two", () => {
    const three = [run(1, "failed"), run(2, "busy-retry"), run(4, "failed")];
    expect(evaluateAlerts(three, bucketize(three)).some((a) => a.ruleId === "unanswered")).toBe(true);
    const two = [run(1, "failed"), run(9, "failed")];
    expect(evaluateAlerts(two, bucketize(two)).some((a) => a.ruleId === "unanswered")).toBe(false);
  });

  it("builds the day by running the real clients: hard failures before the fix, none after", async () => {
    const snapshot = await monitoringSnapshot();
    expect(snapshot.before.failed).toBeGreaterThan(0);
    expect(snapshot.after.failed).toBe(0);
    expect(snapshot.before.errorRate).toBeGreaterThan(snapshot.after.errorRate);
    expect(snapshot.runs.filter((r) => r.minute < DEPLOY_MINUTE && r.client !== "none").every((r) => r.client === "naive")).toBe(true);
    expect(snapshot.runs.filter((r) => r.minute >= DEPLOY_MINUTE && r.client !== "none").every((r) => r.client === "resilient")).toBe(true);
    expect(snapshot.alerts.some((a) => a.ruleId === "error-rate")).toBe(true);
  });

  it("never sends answer-bank questions to the model, so they cannot hit a 429", async () => {
    const snapshot = await monitoringSnapshot();
    const bank = snapshot.runs.filter((r) => r.path === "answer-bank");
    expect(bank.length).toBeGreaterThan(snapshot.runs.length / 2);
    expect(bank.every((r) => r.client === "none" && r.outcome === "answered" && r.providerStatus === undefined)).toBe(true);
    expect(snapshot.bankShare).toBeCloseTo(bank.length / snapshot.runs.length);
  });
});
