import { EVAL_SUITE, EVAL_THRESHOLD } from "../content/eval-suite";
import { PIPELINES, type Baseline } from "./eval";

export const USAGE = `pnpm eval [options]

  --url <base>              run the questions against a running build over HTTP
  --pipeline <key>          in-process only: ${PIPELINES.map((p) => p.key).join(", ")}
  --threshold <n>           minimum score out of ${EVAL_SUITE.length} (default ${EVAL_THRESHOLD})
  --baseline <file>         last approved run (default eval/baseline.json)
  --update-baseline         record this run as the new approved baseline (only if the gate passes)
  --allow-missing-baseline  run without a baseline (skips the "no drop" checks)
  --recheck                 with --url: ask each off-method question once more before scoring
  --json                    print the full report as JSON

Exit codes: 0 gate passed, 1 gate blocked, 2 bad options or missing baseline.`;

export interface EvalCliOptions {
  url?: string;
  pipeline: string;
  threshold: number;
  baselinePath: string;
  updateBaseline: boolean;
  allowMissingBaseline: boolean;
  recheck: boolean;
  json: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; exitCode: 2 };

const VALUE_FLAGS = new Set(["url", "pipeline", "threshold", "baseline"]);
const BOOLEAN_FLAGS = new Set(["update-baseline", "allow-missing-baseline", "recheck", "json"]);

const fail = (error: string): Parsed<never> => ({ ok: false, error, exitCode: 2 });

/** Strict flag parsing: a typo must stop the gate, never quietly turn a check off. */
export function parseEvalArgs(argv: string[], total = EVAL_SUITE.length): Parsed<EvalCliOptions> {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) return fail(`Unexpected argument "${arg}"`);
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.add(name);
    } else if (VALUE_FLAGS.has(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return fail(`--${name} needs a value`);
      values.set(name, value);
      i++;
    } else {
      return fail(`Unknown option --${name}`);
    }
  }

  const rawThreshold = values.get("threshold");
  let threshold = EVAL_THRESHOLD;
  if (rawThreshold !== undefined) {
    if (!/^\d+$/.test(rawThreshold) || Number(rawThreshold) > total) {
      return fail(`--threshold must be a whole number from 0 to ${total}, got "${rawThreshold}"`);
    }
    threshold = Number(rawThreshold);
  }

  const url = values.get("url");
  if (url !== undefined && !/^https?:\/\/\S+$/.test(url)) return fail(`--url must start with http:// or https://, got "${url}"`);
  const pipeline = values.get("pipeline");
  if (url !== undefined && pipeline !== undefined) {
    return fail("--pipeline only applies in-process; with --url the running build decides the pipeline");
  }
  if (pipeline !== undefined && !PIPELINES.some((p) => p.key === pipeline)) {
    return fail(`Unknown pipeline "${pipeline}". Use one of: ${PIPELINES.map((p) => p.key).join(", ")}`);
  }
  if (flags.has("recheck") && url === undefined) return fail("--recheck only applies with --url");

  return {
    ok: true,
    value: {
      url,
      pipeline: pipeline ?? "current",
      threshold,
      baselinePath: values.get("baseline") ?? "eval/baseline.json",
      updateBaseline: flags.has("update-baseline"),
      allowMissingBaseline: flags.has("allow-missing-baseline"),
      recheck: flags.has("recheck"),
      json: flags.has("json"),
    },
  };
}

/**
 * A missing or unreadable baseline stops the gate: without it, "no drop since the
 * last approved run" cannot be checked. Recording a first baseline is allowed.
 */
export function loadBaseline(
  options: Pick<EvalCliOptions, "baselinePath" | "updateBaseline" | "allowMissingBaseline">,
  readFile: (path: string) => string | undefined,
): Parsed<Baseline | undefined> {
  const text = readFile(options.baselinePath);
  if (text === undefined) {
    if (options.updateBaseline || options.allowMissingBaseline) return { ok: true, value: undefined };
    return fail(`Baseline file ${options.baselinePath} not found. Pass --update-baseline to record one, or --allow-missing-baseline to run without it.`);
  }
  try {
    const parsed = JSON.parse(text) as Baseline;
    if (typeof parsed.score !== "number" || !Array.isArray(parsed.onMethod)) throw new Error("missing score or onMethod");
    return { ok: true, value: parsed };
  } catch (error) {
    return fail(`Baseline file ${options.baselinePath} is not valid: ${error instanceof Error ? error.message : String(error)}`);
  }
}
