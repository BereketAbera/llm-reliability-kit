# Coach reliability kit

A working demo of how to make a live AI sales coach reliable. It answers four questions with running code:

1. **Why do about one in three requests fail with 429 when three reps ask at once, and what fixes it?** A simulated provider enforces tokens and requests per minute like a real usage tier. The same burst runs through today's client (no retry), a retry queue, and the retry queue with smaller prompts.
2. **How does the coach use the approved lines word for word instead of paraphrasing them?** An answer bank returns approved answers exactly as stored, retrieval finds the exact source line by ID, a verbatim check restores the line if a model rewrites it, and when two lines fit equally the coach asks which one instead of guessing.
3. **How do we know a change didn't make answers worse?** A 30-question suite scores answers on exact lines and blocks a publish below the threshold, when the score drops, or when more questions get a wrong line. Held-out phrasings and questions that should be declined run alongside it.
4. **How would we notice failures in production?** Every answer is logged with its path, outcome and wait; alerts fire on unanswered questions and on the error rate.

Everything uses a fictional method written for this demo, the Clear Next Step method, with fictional documents, approved answers and test questions. The provider is simulated: no real model calls.

## Pages

| Page | What it shows |
| --- | --- |
| `/` | The four questions, the headline numbers (computed at build time from the same code) and the first milestone. |
| `/burst` | Fixing the 429s. Three concurrent requests of about 14,500 prompt tokens against an assumed 30,000 tokens-per-minute limit, streamed live over SSE: per-request timelines, 429 count, typical and slowest answer time, what each rep sees, and a one-line verdict. Presets for a shared key and a higher tier, sliders for everything else, a capacity planner for groups of reps. |
| `/ask` | Ask the coach. Which path answered (answer bank, retrieval, asked which one, or no match), the verbatim line with its citation, the "Want to know why this works?" follow-up, the match trace, the verbatim check (with a switch that simulates a paraphrasing model), and a flag button for questions with no approved line. |
| `/eval` | The 30-question test: the gate decision, three pipeline versions compared, held-out and decline results, every question and answer, and how the gate runs on Replit. "Re-run now" calls the server. |
| `/monitoring` | An illustrative day of simulated traffic run through the real clients: error rate over time with the alert threshold, the alert rules and what they caught, a run log, and the runs you made in this browser. |
| `/how-it-works` | Plain-language explanation with code excerpts read from the source at build time, including what to check first for the 429s and the Postgres schema for the library. |
| `/handover` | The handover notes in plain language: how content is loaded, how to add or approve a document, how to run the test. |

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3203
pnpm build && pnpm start
```

Node 22 or newer and pnpm 10.

## Tests and the publish gate

```bash
pnpm lint
pnpm typecheck
pnpm test           # Vitest: unit and integration
pnpm test:e2e       # Playwright (run pnpm build first)
pnpm eval           # the 30-question test; exits 1 if the gate blocks
```

- **Unit:** backoff and full jitter, retry-after parsing, the token bucket and concurrency cap, stemming, typo correction against a real-word list, the matcher's thresholds, retrieval's evidence rules (generic words, channel, buyer's side, margin), scorer outcomes, SSE parsing (an event cut off mid-stream is dropped), library integrity, eval CLI options, browser-storage validation.
- **Integration:** with seed 7, today's client fails one request in three with a 429 and the retry queue fails none; runs are deterministic; the shared-key preset honors every retry-after, and any rep it cannot answer is told when to try again instead of seeing an error; the simulated day is produced by the real clients; the eval score is computed correctly and the gate blocks both a paraphrasing change and a change that adds wrong lines; the HTTP routes validate input and stream a clean `event: error`.
- **End to end:** every page, the live burst (including Stop and a dropped connection), the ask flows (including a cut-off stream and a busy server), the gate, monitoring, the JSON and SSE endpoints, security headers, and no horizontal scroll on a 390 px phone after asking questions.

### The three question sets

- **30-question suite** (`EVAL_SUITE`): fictional questions written the way reps ask, each tied to the approved line a good answer must contain. This is what the gate scores. No answer-bank example is a copy or near copy of these questions; a unit test checks it.
- **Held-out phrasings** (`HELD_OUT`): written by a reviewer after the bank was built. Nothing in the bank was copied from them; some sit close to examples the bank already had.
- **Should be declined** (`SHOULD_DECLINE`): off-topic and near-miss questions. Any approved line here counts as a wrong line.

Each answer is scored as on method, asked which one, declined, not word for word, or wrong line. The gate blocks when the 30-question score is below the threshold, when it drops from `eval/baseline.json`, or when wrong lines across all three sets rise above the baseline.

### `pnpm eval` options

```bash
pnpm eval --url http://localhost:3203       # run the questions against a running build over HTTP
pnpm eval --url http://localhost:3203 --recheck   # ask each off-method question once more (for a real model)
pnpm eval --pipeline paraphrase-no-guard    # watch the gate block a bad change (exit 1)
pnpm eval --update-baseline                 # record a new approved run (only when the gate passes)
```

Exit codes: 0 when the gate passes, 1 when it blocks, 2 for an invalid option (for example `--threshold 24x`, `--pipeline` together with `--url`) or a missing baseline file. Pass `--allow-missing-baseline` to run without one on purpose.

### Publishing on Replit

The coach is built and published on Replit. Replit runs the `[deployment] build` command from `.replit` before every publish, so the gate goes there:

```toml
[deployment]
build = "pnpm install --frozen-lockfile && pnpm test && pnpm build && pnpm eval --threshold 24 --baseline eval/baseline.json"
run = "pnpm start"
```

If a unit test fails, the build fails, or the 30-question score drops, the build fails and nothing is published. With a real model in the loop the deployment's secrets must be available to the build step, and the test should run on a separate key or off-peak so it does not use the reps' budget (one untrimmed run is about 450,000 tokens).

### GitHub Actions (optional)

`.github/workflows/publish-gate.yml` runs lint, typecheck, unit tests and the build, starts the build, and runs `pnpm eval --url` against it on every pull request and push. The deploy job runs only when started by hand on `main` and skips itself when no `VERCEL_TOKEN` secret is set. This repo has not been pushed, so the workflow has not run in CI yet. `vercel.json` turns off Git-triggered deploys so nothing can bypass the gate through Vercel's Git integration.

## How state works

- **Nothing persistent on the server.** Each burst run builds a fresh simulated provider and a virtual clock inside one request, so runs never interfere with each other and the same settings and seed always produce the same timeline. The server streams the run's events as they happen, paced so a person can watch.
- **The simulated day** on Monitoring is computed at build time: seeded arrivals, answer-bank hits answered without a model call, and every retrieval question sent through today's client before 12:30 and the retry queue after it.
- **Content is code in the demo.** Documents, the answer bank and the question sets are TypeScript modules under `src/lib/content`, loaded at build time. On the coach's own stack the library lives in Postgres: `db/schema.sql` has the tables, the one-current-version index, the approve function and line-level search (checked against Postgres 17).
- **The baseline** for the gate is `eval/baseline.json`, committed with the code. A test fails if it drifts from the current results.
- **Browser storage** keeps only the list of runs and flagged questions you made in this browser, for the monitoring page. Entries are validated on read; clearing it, or a private window, loses nothing important.

## Content: how it is loaded, added and approved

- Every document is one `defineDocument({...})` entry in the `ALL_DOCUMENTS` list in `src/lib/content/library.ts`, with a slug, a channel (`any`, `call` or `email`), a version and a status (`approved`, `draft` or `superseded`). There is no second list to keep in sync: an entry in that list is loaded.
- Line 1 of every section explains why the method works; lines 2 and up are the exact lines to say or write, with stable IDs such as `OBJ-1.2`.
- **One current version per document.** Only the highest approved version of each slug is searched. Older versions stay in the file for history and are never retrieved.
- **To add a document:** add a `defineDocument({...})` entry to `ALL_DOCUMENTS` with `status: "draft"`, then run `pnpm test`. **To approve it:** set `status: "approved"`, bump the version, mark the previous version `superseded`, then run `pnpm test` and `pnpm eval`. The library test fails on two approved versions of one document, duplicate line IDs, a repeated approved line, or any approved line that can no longer be found from its own text: the "content silently blocked" kind of bug.
- **Answer bank:** each entry in `src/lib/content/answer-bank.ts` points at a line ID, so its text always comes from the library. Keyword groups must pin the situation (`["no", "budget"]`, not `["budget"]`); a single topic word goes in `buyerKeywords` and only counts when the question carries the buyer's side. Add phrasings reps use to `examples`, never the test questions themselves, then run `pnpm eval`.
- **Typo correction** only runs when nothing matched as typed, and only touches words that are not real English. The word list (`src/lib/coach/english-words.data.ts`) is built from the public-domain Webster's Second International list by `pnpm words`.

## API

- `GET /api/ask?q=...` returns the answer as JSON; `POST /api/ask` with `{ question, pick? }` streams it over SSE. `pick` is a line ID chosen from an earlier "which one?" answer. The verbatim guard is always on; there is no parameter to turn it off.
- `POST /api/demo/ask` is the same stream plus `paraphrase: true`, which simulates a model that rewrites lines so the page can show the guard catching it. The guard stays on there too.
- `GET /api/burst?variant=...` streams one burst run; `GET /api/eval?pipeline=...` runs all three question sets and returns the gate decision.

## Assumptions to confirm on the real app

- **30,000 tokens per minute** is assumed (Tier 1 for gpt-4o-class models; the default model in the code is `gpt-4o` to match). `x-ratelimit-limit-tokens` on one of the real 429s confirms it, and whether the limit belongs to Replit's integration or an OpenAI account you control.
- **The 14,500 prompt tokens are mostly pasted reference text.** A token breakdown of one real prompt confirms it. The demo pads prompts to that size; it does not measure a real prompt.
- **About 4,000 tokens after trimming** is a target. The trim ships only if the 30-question score holds.

## Running against a real model

The clients take any fetch-compatible transport. With `OPENAI_API_KEY` set, `pnpm smoke:openai` sends one question through the same resilient client. `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) points it at another OpenAI-compatible endpoint, such as the one Replit's AI integration provides; `OPENAI_MODEL`, `OPENAI_TPM` and `OPENAI_RPM` are optional. It has not been run against a live key for this demo, and the deployed demo has no key and makes no real model calls.

## Project layout

```
src/lib/reliability   simulated provider, naive and resilient clients, token bucket, backoff, SSE, burst scenario
src/lib/coach         normalization, stemming, answer-bank matcher, line retrieval, answer pipeline, scorer, eval, gate and CLI options
src/lib/content       fictional documents, answer bank, the three question sets
src/lib/monitoring    the simulated day, error-rate windows, alert rules
src/app/api           /api/burst (SSE), /api/ask (SSE and JSON), /api/demo/ask (SSE), /api/eval (JSON)
db/schema.sql         the library in Postgres
scripts               eval gate, screenshots, word list, optional real-API smoke test
e2e                   Playwright tests
```

---

Sample by Bereket A. · fictional data
