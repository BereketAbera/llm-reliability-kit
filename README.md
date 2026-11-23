# Coach reliability kit

A working demo of how to make a live AI sales coach reliable. It answers three questions with running code:

1. **Why do about one in three requests fail with 429 when three reps ask at once, and what fixes it?** A simulated provider enforces tokens and requests per minute like a real usage tier. The same burst runs through a naive client, a resilient client and the resilient client with a trimmed prompt.
2. **How does the coach use the approved lines word for word instead of paraphrasing them?** An answer bank returns approved answers exactly as stored, retrieval finds the exact source line by ID, and a verbatim check restores the line if a model rewrites it.
3. **How do we know a change didn't make answers worse?** A 30-question suite scores answers on exact lines and blocks a publish below the threshold or when the score drops.

Everything uses a fictional method written for this demo, **the Clear Next Step method (fictional)**, with fictional documents, approved answers and test questions. The provider is simulated: no real model calls.

## Pages

| Page | What it shows |
| --- | --- |
| `/` | The four questions and the headline numbers, computed at build time from the same code. |
| `/burst` | The burst lab. Three concurrent requests of about 14,500 prompt tokens against a 30,000 tokens-per-minute tier, streamed live over SSE: per-request timelines, 429 count, success rate, p50 and p95, and what each rep sees. Presets for a shared key and a higher tier, sliders for everything else, and a capacity planner for groups of reps. |
| `/ask` | Ask the coach. Shows which path answered (answer bank, retrieval, or no match), the verbatim line with its citation, the "Want to know why this works?" follow-up, match scores against the threshold, and the verbatim check (with a switch that simulates a paraphrasing model). |
| `/eval` | The 30-question suite: X/30, per-question results and reasons, three pipeline versions compared, and the publish gate. "Re-run now" calls the server. |
| `/monitoring` | A seeded day of traffic (simulated, labeled as such): error rate over time with the alert threshold, the alerts it raises, the alert rules, a run log, and the runs you made in this browser. |
| `/how-it-works` | Plain-language explanation with code excerpts read from the source at build time, including what to check first for the 429s. |

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
pnpm test           # Vitest: unit + integration
pnpm test:e2e       # Playwright (builds must exist: run pnpm build first)
pnpm eval           # the 30-question suite; exits 1 if the gate fails
```

- **Unit:** backoff and full jitter with fake timers, retry-after parsing, the token bucket and concurrency cap, matcher thresholds and typo correction, scorer normalization, SSE parsing, library integrity.
- **Integration:** with seed 7, the naive client fails one request in three with a 429 and the resilient client fails none; runs are deterministic; the shared-key preset honors every retry-after and only ever fails calmly; the eval score is computed correctly and the gate blocks a paraphrasing change; the HTTP routes stream a clean `event: error`.
- **End to end:** every page, the live burst, the ask flows, the gate, monitoring, the JSON and SSE endpoints, and no horizontal scroll on a 390 px phone.

`pnpm eval` options:

```bash
pnpm eval --url http://localhost:3203       # run the suite against a running build over HTTP
pnpm eval --pipeline paraphrase-no-guard    # watch the gate block a bad change (exit 1)
pnpm eval --update-baseline                 # record a new approved score (only when the gate passes)
```

`.github/workflows/publish-gate.yml` runs lint, typecheck, tests and build, starts the build, runs `pnpm eval --url` against it, and only then runs the deploy job.

## How state works

- **Nothing persistent on the server.** Each burst run builds a fresh simulated provider and a virtual clock inside one request, so runs never interfere with each other and the same settings and seed always produce the same timeline. The server streams the run's events as they happen, paced so a person can watch (time is compressed and long waits are shortened).
- **Content is code.** Documents, the answer bank and the eval suite are TypeScript modules under `src/lib/content`, loaded at build time. No database.
- **The baseline** for the gate is `eval/baseline.json`, committed with the code. A test fails if it drifts from the current score.
- **Browser storage** keeps only the list of runs you made in this browser for the monitoring page. Clearing it, or a private window, loses nothing important.

## Content: how it is loaded, added and approved

- Each document is defined in `src/lib/content/library.ts` with a slug, a version and a status (`approved`, `draft` or `superseded`). Line 1 of every section explains why the method works; lines 2 and up are the exact lines to say or write, with stable IDs such as `OBJ-1.2`.
- **One current version per document.** Only the highest approved version of each slug is searched. Older versions stay in the file for history and are never retrieved.
- **To add a document:** add a `defineDocument({...})` block with `status: "draft"`, then run `pnpm test`. **To approve it:** set `status: "approved"`, bump the version, and mark the previous version `superseded`. The library test fails the build on two approved versions of one document, duplicate line IDs or a repeated approved line, and checks that every approved line can be retrieved from its own text, which catches code that silently blocks content.
- **Answer bank:** each entry in `src/lib/content/answer-bank.ts` points at a line ID, so its text always comes from the library. Add phrasings reps really use to `examples`, then run `pnpm eval`.
- **Test questions:** `src/lib/content/eval-suite.ts`. Each question lists the approved line IDs that count as on method.

## Project layout

```
src/lib/reliability   simulated provider, naive and resilient clients, token bucket, backoff, SSE, burst scenario
src/lib/coach         normalization, answer-bank matcher, line retrieval, answer pipeline, scorer, eval and gate
src/lib/content       fictional documents, answer bank, 30-question suite
src/lib/monitoring    seeded traffic, error-rate windows, alert rules
src/app/api           /api/burst (SSE), /api/ask (SSE and JSON), /api/eval (JSON)
scripts               eval gate, screenshots, optional real-API smoke test
e2e                   Playwright tests
```

## Running against a real model

The clients take any fetch-compatible transport. With `OPENAI_API_KEY` set, `pnpm smoke:openai` sends one question through the same resilient client to the real API (`OPENAI_MODEL`, `OPENAI_TPM` and `OPENAI_RPM` are optional). The deployed demo has no key and makes no real model calls.

---

Sample by Bereket A. · fictional data
