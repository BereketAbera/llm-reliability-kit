/** Runs made in this browser, shown on the monitoring page. Browser storage only; never required. */
export interface LocalRun {
  at: string;
  kind: "burst" | "ask";
  label: string;
  total: number;
  failed: number;
  /** Failures the rep saw as a hard error (not a calm "busy, retry"). */
  harshFailures?: number;
  detail?: string;
}

const KEY = "coach-reliability-kit:runs";

export function readLocalRuns(): LocalRun[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalRun[]) : [];
    return Array.isArray(parsed) ? parsed : [];
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
