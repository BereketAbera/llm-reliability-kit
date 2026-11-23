# Design notes

Four visual changes and a copy pass, each with where it lives and why it helps the founder reading this demo. The pictures are drawn by small scripts in `design/` and rebuilt with one command (last section).

## 1. The mark: three reps, the third waits its turn

- **What:** two navy bars of the same length (answered at once) and a grey bar that ends in navy (waited in line, then answered). It replaces the stock shield-and-check icon, which was also the "Verbatim check: passed" badge on Ask the coach, so the logo read like a status light. The first two bars were 12 and 14 units at first; at 16 px that is 6 px against 7 px, which read as a rendering wobble, so both are now 14.
- **Where:** the header on every page (`src/components/site/brand-mark.tsx`), the browser tab (`src/app/icon.svg`, with a lighter navy on dark tab bars), `src/app/favicon.ico` for browsers without SVG icons, and the home-screen icon (`src/app/apple-icon.png`). Drawn by `design/mark.py`.
- **Why:** it is the "With retry queue" timeline from Fixing the 429s in miniature: the third rep waits instead of getting a 429. Header, tab, diagram and social card now share one picture of what the kit does. The four icon tiles on the home page cards went at the same time; the small labels above each question already say what the card is.

## 2. One minute of token budget (How it works)

- **What:** three rows on one scale, where width always means tokens. Today, Rep 1 and Rep 2 each reserve 15,000 tokens and fill the 30,000-token minute, so Rep 3 lands over the limit and gets a 429. With the retry queue, Rep 3 is the same 15,000-token block in navy (answered); "waits 30 s" above it, after a small chip in the /burst "Waiting in line" stripes, says when. With 4,000-token prompts, three requests use 13,500 tokens and six would fit. The caption says the reservation rule (prompt plus up to 500 output tokens) is how this simulation counts.
- **Where:** `/how-it-works`, "What to check first for the 429s", between the opening paragraph and the numbered list. The file is `public/diagrams/token-budget.svg`, drawn by `design/token_budget.py` and inlined by `src/components/how-it-works/token-budget-figure.tsx`. Its title and description are the text alternative. The drawing starts at the track's left edge, so the bars and row titles line up with the heading and paragraph. It is at most 380 px wide, and its labels are about 13.6 px on a desktop, 12.8 px at 390 px and 11.7 px at 360 px.
- **Why:** this answers the post's question 2 (why one request in three fails). The founder sees in one look why exactly one request in three fails and why smaller prompts remove the wait, instead of working out 3 × 15,000 against 30,000. It sits in the first screen of the page. An earlier version cut the wait out of Rep 3's block, so it looked like a smaller request; keeping every block at its token size keeps the rows comparable. The labels are live text in the page's own font (Geist), so the file stays at about 6 KB.

## 3. Monitoring: the error rate split by cause

- **What:** the single red line is now two stacked bands: 429 errors (red, solid line, filled dots) and reps told to try again (a lighter amber, dashed line, hollow dots). The two differ in lightness and line style as well as hue, so they stay apart for colour-blind readers, and each is named on the chart beside its highest point ("429 errors" at the first morning peak, "told to try again" at 14:00). Their top edge is still the unanswered rate the 5% alert watches. The lines join the 15-minute window centres, so a cause seen on one side of the 12:30 deploy only is cut at that line: the red stops at the fix instead of sloping into the 12:30 window, which had no 429s. The alert line is a neutral dashed grey, so amber means one thing. The legend reads "Share of questions asked (left axis):" before the two keys.
- **Where:** `/monitoring`, "Error rate over time" (`src/components/monitoring/error-rate-chart.tsx`), from the same 15-minute buckets. The chart's description gives the counts. The amber line and wash are `--warn-line` (oklch 0.66 0.14 68, 3.2:1 on white) and `--warn-wash` in `src/app/globals.css`; the text-tuned `--warn` stays for the label. Against the red the amber line is 1.9:1 in luminance, and 1.7:1 in a deuteranopia simulation (the earlier pair was 1.01:1 and 1.11:1).
- **Why:** the founder needs to see why questions went unanswered and that the fix holds. Before, the afternoon peak (11% at 14:00, after the fix) looked as bad as the morning. Split by cause, the chart says what the tiles above it say: 26 hard errors before 12:30 and none after, and 9 reps told to wait at the afternoon peak, which is the case for trimming prompts.

## 4. Social preview card

- **What:** a 1200 × 630 card with the mark, "Three reps ask at once.", "Today, 2 of 3 are answered. With the retry queue, 3 of 3.", the diagram's "Today" and "With the retry queue" rows, and "Simulated provider · fictional sales method". The picture itself shows both outcomes (Rep 3 gets a 429; with the queue it waits, then is answered), so a small unfurl still tells the whole story. Set in Geist. No URL, name or contact details.
- **Where:** `src/app/opengraph-image.png` and `opengraph-image.alt.txt`; `metadataBase`, Open Graph and Twitter card settings in `src/app/layout.tsx`. Drawn by `design/og.py` and rendered by `design/og-render.mjs`. Every route shares it.
- **Why:** the link is likely to be forwarded (to the trainer or a partner), and before it unfurled with no image. The card states the problem and the result in the client's own numbers. 2 of 3 and 3 of 3 come from the seeded burst the home page shows.

## Copy

Labels that say what happens, instead of slogans:

- Page eyebrows name the part of the post each page answers, as the home cards do: `/burst` "Burst lab · your question 2" (was "reliability under load"), `/ask` "Exact lines · your question 3" (was "answer bank first"), `/eval` "Publish gate · task 4" (was "measured, not guessed", then "blocks below 24/30", which stated only one of the gate's three rules) and `/monitoring` "Simulated day · task 5" (was "Illustrative day: simulated traffic through the real clients"; the paragraph under it still says how the day is built).
- Home, "What is real here": "Running code" (was "Running code, not mockups"); the paragraph under it says what the code is behind.
- Home, milestone step 2 quotes what the rep sees, "Lots of reps are asking right now", instead of "a calm message".
- How it works: "The fix: wait for budget, retry on the provider's schedule" (was "queue, retry, fail calmly"), "Fail fast, with a clear message.", and the code toggle "the try-again message". The figure caption and check 2 say the reservation rule is the simulation's.
- "Calm" is also gone from the retry-queue summary on `/burst`, the capacity planner and the README.

## Left as it was

- The palette and fonts, apart from the two chart tokens in section 3. The navy primary and the ok, warn and bad colours already mean the same thing on the burst, test and monitoring pages.
- The handover page layout and the earlier commit messages.

## Rebuilding the assets

Run `pnpm build`, then `design/build.sh`. It needs Python 3 (standard library only), the Inkscape 1.4 command line (`/opt/homebrew/bin/inkscape`, or set `INKSCAPE`) and the repo's Playwright Chromium.

1. `design/mark.py`, `design/token_budget.py` and `design/og.py` write SVG sources to `design/out/` (not committed).
2. Inkscape saves the favicon and the diagram as plain SVG, and renders the home-screen icon and three favicon sizes to PNG. `design/ico.py` packs the favicon sizes into `src/app/favicon.ico`.
3. `design/og-render.mjs` renders the social card in Chromium, set in Geist from the latin woff2 that `pnpm build` writes to `.next/static/media`, so nothing is downloaded. Without a build, `build.sh` falls back to Inkscape, which sets the card in Helvetica Neue.

Colours are the tokens from `src/app/globals.css`, converted in `design/palette.py`. The scenario numbers match `DEFAULT_PARAMS` in `src/lib/reliability/scenario.ts`. If either changes, change the script and rerun it.
