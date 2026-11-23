# Design notes

Four visual changes and a copy pass, each with where it lives and why it helps the founder reading this demo. The pictures are drawn by small Python scripts in `design/` and rebuilt with one command (last section).

## 1. The mark: three reps, the third waits its turn

- **What:** two short navy bars (answered at once) and a grey bar that ends in navy (waited in line, then answered). It replaces the stock shield-and-check icon, which was also the "Verbatim check: passed" badge on Ask the coach, so the logo read like a status light.
- **Where:** the header on every page (`src/components/site/brand-mark.tsx`), the browser tab (`src/app/icon.svg`, with a lighter navy on dark tab bars), `src/app/favicon.ico` for browsers without SVG icons, and the home-screen icon (`src/app/apple-icon.png`). Drawn by `design/mark.py`.
- **Why:** it is the "With retry queue" timeline from Fixing the 429s in miniature: the third rep waits instead of getting a 429. Header, tab, diagram and social card now share one picture of what the kit does. The four icon tiles on the home page cards went at the same time; the small labels above each question already say what the card is.

## 2. One minute of token budget (How it works)

- **What:** three rows on one scale. Today, Rep 1 and Rep 2 each reserve 15,000 tokens and fill the 30,000-token minute, so Rep 3 lands over the limit and gets a 429. With the retry queue, Rep 3 waits 30 seconds, then is answered. With 4,000-token prompts, three requests use 13,500 tokens and six would fit.
- **Where:** `/how-it-works`, "What to check first for the 429s", between the opening paragraph and the numbered list. The file is `public/diagrams/token-budget.svg`, drawn by `design/token_budget.py` and inlined by `src/components/how-it-works/token-budget-figure.tsx`. Its title and description are the text alternative.
- **Why:** this is the answer to screening question 2. The founder sees in one look why exactly one request in three fails and why smaller prompts remove the wait, instead of working out 3 × 15,000 against 30,000. It sits in the first screen of the page, so the optional fourth proposal attachment shows it. The labels are live text in the page's own font (Geist), so the file stays at about 6 KB.

## 3. Monitoring: the error rate split by cause

- **What:** the single red line is now two stacked bands: 429 errors (red) and reps told to try again (amber). Their top edge is still the unanswered rate the 5% alert watches. The alert line is now a neutral dashed grey, so amber means one thing.
- **Where:** `/monitoring`, "Error rate over time" (`src/components/monitoring/error-rate-chart.tsx`), from the same 15-minute buckets. The chart's description gives the counts.
- **Why:** the founder needs to see why questions went unanswered and that the fix holds. Before, the afternoon peak (11% at 14:00, after the fix) looked as bad as the morning. Split by cause, the chart says what the tiles above it say: 26 hard errors before 12:30 and none after, and 9 reps told to wait at the afternoon peak, which is the case for trimming prompts.

## 4. Social preview card

- **What:** a 1200 × 630 card with the mark, "Three reps ask at once.", "Today, 2 of 3 are answered. With the retry queue, 3 of 3.", the "Today" row of the diagram, and "Simulated provider · fictional sales method". No URL, name or contact details.
- **Where:** `src/app/opengraph-image.png` and `opengraph-image.alt.txt`; `metadataBase`, Open Graph and Twitter card settings in `src/app/layout.tsx`. Drawn by `design/og.py`.
- **Why:** the link is likely to be forwarded (to the trainer or a partner), and before it unfurled with no image. The card states the problem and the result in the client's own numbers. 2 of 3 and 3 of 3 come from the seeded burst the home page shows.

## Copy

Labels that say what happens, instead of slogans:

- `/eval`: "Publish gate · blocks below 24/30" (was "measured, not guessed").
- `/burst`: "Burst lab · your question 2" (was "reliability under load"), matching the home card that links there.
- Home, "What is real here": "Running code behind the numbers" (was "Running code, not mockups").
- Home, milestone step 2 quotes what the rep sees, "Lots of reps are asking right now", instead of "a calm message".
- How it works: "The fix: wait for budget, retry on the provider's schedule" (was "queue, retry, fail calmly"), "Fail fast, with a clear message.", and the code toggle "the try-again message".
- "Calm" is also gone from the retry-queue summary on `/burst`, the capacity planner and the README.

## Left as it was

- The palette and fonts. The navy primary and the ok, warn and bad colours already mean the same thing on the burst, test and monitoring pages.
- The handover page layout and the earlier commit messages.

## Rebuilding the assets

Run `design/build.sh`. It needs Python 3 (standard library only) and the Inkscape 1.4 command line (`/opt/homebrew/bin/inkscape`, or set `INKSCAPE`).

1. `design/mark.py`, `design/token_budget.py` and `design/og.py` write SVG sources to `design/out/` (not committed).
2. Inkscape saves the favicon and the diagram as plain SVG, and renders the home-screen icon, three favicon sizes and the social card to PNG. `design/ico.py` packs the favicon sizes into `src/app/favicon.ico`.

Colours are the tokens from `src/app/globals.css`, converted in `design/palette.py`. The scenario numbers match `DEFAULT_PARAMS` in `src/lib/reliability/scenario.ts`. If either changes, change the script and rerun it. Inkscape sets the card's text in Geist when Geist is installed, and otherwise in Helvetica Neue, which is what the current PNG uses.
