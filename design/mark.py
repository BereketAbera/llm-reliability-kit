"""The kit's mark: three reps from the "With retry queue" timeline on /burst.

Rows 1 and 2 are answered at once (navy). Row 3 waits its turn in line (grey),
then is answered (navy) instead of getting a 429. Drawn on a 32-unit grid with
every edge on an even unit, so it lands on whole pixels both as a 32 px icon
and as a 16 px favicon.

Writes design/out/mark.svg (favicon), mark-tile.svg (favicon.ico) and
mark-apple.svg (home-screen icon). The header draws the same rectangles in
src/components/site/brand-mark.tsx.
"""

from pathlib import Path

from palette import CANVAS, PRIMARY, PRIMARY_ON_DARK, SEG_QUEUED

OUT = Path(__file__).resolve().parent / "out"

GRID = 32
RADIUS = 1.5
# (kind, x, y, width, height). The waiting bar runs under the last navy block,
# so the join between them has no gap.
ROWS = [
    ("answered", 4, 4, 12, 6),
    ("answered", 4, 12, 14, 6),
    ("waiting", 4, 20, 20, 6),
    ("answered", 20, 20, 8, 6),
]


def mark_rects(answered: str = PRIMARY, waiting: str = SEG_QUEUED, with_class: bool = False) -> list[str]:
    """The mark's rectangles in grid units. `with_class` tags answered rows for the dark-mode rule."""
    out = []
    for kind, x, y, w, h in ROWS:
        fill = answered if kind == "answered" else waiting
        cls = ' class="answered"' if with_class and kind == "answered" else ""
        out.append(f'<rect{cls} x="{x}" y="{y}" width="{w}" height="{h}" rx="{RADIUS}" fill="{fill}"/>')
    return out


def svg(width: int, height: int, body: list[str], view_box: str | None = None) -> str:
    view_box = view_box or f"0 0 {width} {height}"
    inner = "\n  ".join(body)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{view_box}">\n  {inner}\n</svg>\n'


def favicon() -> str:
    """Transparent, with a lighter navy when the browser chrome is dark."""
    style = f"<style>@media (prefers-color-scheme: dark) {{ .answered {{ fill: {PRIMARY_ON_DARK}; }} }}</style>"
    return svg(GRID, GRID, [style, *mark_rects(with_class=True)])


def tile() -> str:
    """For favicon.ico: a light tile, so the navy rows read on dark tab bars too."""
    return svg(GRID, GRID, [f'<rect width="{GRID}" height="{GRID}" rx="7" fill="{CANVAS}"/>', *mark_rects()])


def apple() -> str:
    """For the home-screen icon: full bleed (the system rounds the corners), mark at 70%."""
    scale = 0.7
    offset = GRID * (1 - scale) / 2
    group = f'<g transform="translate({offset:g} {offset:g}) scale({scale:g})">{"".join(mark_rects())}</g>'
    return svg(GRID, GRID, [f'<rect width="{GRID}" height="{GRID}" fill="{CANVAS}"/>', group])


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "mark.svg").write_text(favicon(), encoding="utf-8")
    (OUT / "mark-tile.svg").write_text(tile(), encoding="utf-8")
    (OUT / "mark-apple.svg").write_text(apple(), encoding="utf-8")
    print("design/out: mark.svg, mark-tile.svg, mark-apple.svg")
