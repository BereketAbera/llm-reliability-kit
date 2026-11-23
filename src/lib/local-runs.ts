/** Runs made in this browser, shown on the monitoring page. Browser storage only; never required. */
export interface LocalRun {
  at: string;
  kind: "burst" | "ask" | "flag";
  label: string;
  total: number;
  failed: number;
  /** Failures the rep saw as a hard error (not a calm "try again"). */
  harshFailures?: number;
  /** The verbatim guard replaced a simulated paraphrase. */
  paraphraseCaught?: boolean;
  detail?: string;
}

const KEY = "coach-reliability-kit:runs";
const KINDS = new Set(["burst", "ask", "flag"]);

/** Keeps only well-formed entries, so an old format or a manual edit can never break the page. */
export function sanitizeRuns(value: unknown): LocalRun[] {
  if (!Array.isArray(value)) return [];
  return value.filter((run): run is LocalRun => {
    if (typeof run !== "object" || run === null) return false;
    const r = run as Record<string, unknown>;
    return (
      typeof r.at === "string" &&
      !Number.isNaN(Date.parse(r.at)) &&
      typeof r.label === "string" &&
      typeof r.kind === "string" &&
      KINDS.has(r.kind) &&
      typeof r.total === "number" &&
      typeof r.failed === "number" &&
      (r.harshFailures === undefined || typeof r.harshFailures === "number") &&
      (r.detail === undefined || typeof r.detail === "string")
    );
  });
}

export function readLocalRuns(): LocalRun[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? sanitizeRuns(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function recordLocalRun(run: Omit<LocalRun, "at">): void {
  try {
    const runs = [{ ...run, at: new Date().toISOString() }, ...readLocalRuns()].slice(0, 30);
    window.localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // storage unavailable (private window, blocked): the page still works
  }
}

export function clearLocalRuns(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
