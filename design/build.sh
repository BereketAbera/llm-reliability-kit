#!/usr/bin/env bash
# Rebuilds every design asset from the Python scripts in this folder.
# Needs Python 3 (standard library only), the Inkscape 1.4 command line and, for the
# social card's Geist, the repo's Playwright Chromium and a `pnpm build`.
# Run from anywhere: design/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

INKSCAPE="${INKSCAPE:-/opt/homebrew/bin/inkscape}"
OUT=design/out
mkdir -p "$OUT" public/diagrams

# 1. Draw the sources (SVG) into design/out.
python3 -B design/mark.py
python3 -B design/token_budget.py
python3 -B design/og.py

# 2. The mark: SVG favicon, 180 px home-screen icon, and favicon.ico for browsers without SVG icons.
"$INKSCAPE" "$OUT/mark.svg" --export-type=svg --export-plain-svg -o src/app/icon.svg
"$INKSCAPE" "$OUT/mark-apple.svg" --export-type=png --export-width=180 --export-height=180 --export-background-opacity=1 -o src/app/apple-icon.png
for size in 16 32 48; do
  "$INKSCAPE" "$OUT/mark-tile.svg" --export-type=png --export-width=$size --export-height=$size -o "$OUT/favicon-$size.png"
done
python3 -B design/ico.py "$OUT/favicon-16.png" "$OUT/favicon-32.png" "$OUT/favicon-48.png" src/app/favicon.ico

# 3. One minute of token budget (How it works). Text stays text: the page inlines
#    this file, so the labels are drawn in the page's own font.
"$INKSCAPE" "$OUT/token-budget.svg" --export-type=svg --export-plain-svg -o public/diagrams/token-budget.svg

# 4. The social preview card, in Chromium with the site's Geist from the last `pnpm build`
#    (.next/static/media). Without a build, Inkscape renders it in the next font of the
#    stack in design/palette.py instead.
if ! node design/og-render.mjs; then
  echo "build.sh: rendering the social card with Inkscape instead" >&2
  "$INKSCAPE" "$OUT/og.svg" --export-type=png --export-width=1200 --export-height=630 --export-background-opacity=1 -o src/app/opengraph-image.png
fi

ls -l src/app/icon.svg src/app/apple-icon.png src/app/favicon.ico public/diagrams/token-budget.svg src/app/opengraph-image.png
