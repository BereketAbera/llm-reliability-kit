"""The 1200x630 social preview card, built from the mark and the first row of the token-budget diagram.

The 2 of 3 and 3 of 3 come from the seeded burst (seed 7) that the home page shows.
Writes design/out/og.svg; build.sh renders it to src/app/opengraph-image.png.
"""

from pathlib import Path

from mark import GRID, mark_rects
from palette import CANVAS, FONT_STACK, MUTED_FOREGROUND
from token_budget import BAR_H, TRACK_X, defs, limit_line, scale_labels, text, today_row

OUT = Path(__file__).resolve().parent / "out"

WIDTH, HEIGHT = 1200, 630
MARGIN = 80
MARK_SIZE = 52
DIAGRAM_SCALE = 3


def card() -> str:
    bar_y = 28  # the row sits just under the scale labels
    diagram = [defs(), limit_line(14, bar_y + BAR_H + 4), *scale_labels(), *today_row(bar_y)]
    body = [
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{CANVAS}"/>',
        f'<g transform="translate({MARGIN} 62) scale({MARK_SIZE / GRID:g})">{"".join(mark_rects())}</g>',
        text(MARGIN + MARK_SIZE + 14, 99, "Coach reliability kit", size=30, weight=600),
        text(MARGIN, 232, "Three reps ask at once.", size=70, weight=500, extra=' letter-spacing="-1.2"'),
        text(MARGIN, 290, "Today, 2 of 3 are answered. With the retry queue, 3 of 3.", size=32, fill=MUTED_FOREGROUND),
        f'<g transform="translate({MARGIN - TRACK_X * DIAGRAM_SCALE} 340) scale({DIAGRAM_SCALE})">{"".join(diagram)}</g>',
        text(MARGIN, 572, "Simulated provider · fictional sales method", size=24, fill=MUTED_FOREGROUND),
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
