"""The 1200x630 social preview card, built from the mark and the first two rows of the token-budget diagram.

The picture shows both outcomes: today Rep 3 gets a 429; with the retry queue it waits, then is answered.
The 2 of 3 and 3 of 3 come from the seeded burst (seed 7) that the home page shows.
Writes design/out/og.svg; build.sh renders it to src/app/opengraph-image.png (og-render.mjs, in Geist).
"""

from pathlib import Path

from mark import GRID, mark_rects
from palette import CANVAS, FONT_STACK, MUTED_FOREGROUND
from token_budget import BAR_H, PER_REQUEST, TRACK_X, defs, limit_line, queue_row, row_title, scale_labels, text, today_row

OUT = Path(__file__).resolve().parent / "out"

WIDTH, HEIGHT = 1200, 630
MARGIN = 80
MARK_SIZE = 52
DIAGRAM_SCALE = 2.4  # labels stay about 10 px in a 400 px wide unfurl
DIAGRAM_Y = 270
FIRST_BAR = 46  # in diagram units, under the scale labels
ROW_GAP = 54  # a little tighter than the page figure's 60


def card() -> str:
    second_bar = FIRST_BAR + ROW_GAP
    diagram = [
        defs(),
        limit_line(14, second_bar + BAR_H + 4),
        *scale_labels(),
        row_title(FIRST_BAR - 7, "Today", f"{PER_REQUEST:,} each"),
        *today_row(FIRST_BAR),
        row_title(second_bar - 7, "With the retry queue"),
        *queue_row(second_bar),
    ]
    body = [
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{CANVAS}"/>',
        f'<g transform="translate({MARGIN} 48) scale({MARK_SIZE / GRID:g})">{"".join(mark_rects())}</g>',
        text(MARGIN + MARK_SIZE + 14, 85, "Coach reliability kit", size=30, weight=600),
        text(WIDTH - MARGIN, 85, "Simulated provider · fictional sales method", size=22, fill=MUTED_FOREGROUND, anchor="end"),
        text(MARGIN, 182, "Three reps ask at once.", size=64, weight=500, extra=' letter-spacing="-1.1"'),
        text(MARGIN, 230, "Today, 2 of 3 are answered. With the retry queue, 3 of 3.", size=30, fill=MUTED_FOREGROUND),
        f'<g transform="translate({MARGIN - TRACK_X * DIAGRAM_SCALE:g} {DIAGRAM_Y}) scale({DIAGRAM_SCALE:g})">{"".join(diagram)}</g>',
    ]
    inner = "\n  ".join(body)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'font-family="{FONT_STACK}">\n  {inner}\n</svg>\n'
    )


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "og.svg").write_text(card(), encoding="utf-8")
    print("design/out: og.svg")
