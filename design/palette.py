"""Site colours for the design scripts.

Each value is the OKLCH token from src/app/globals.css, converted to sRGB hex so
SVG files and Inkscape can use it. If a token changes there, change it here and
run design/build.sh.
"""

import math


def oklch(lightness: float, chroma: float, hue: float) -> str:
    """OKLCH to an sRGB hex string (Bjorn Ottosson's OKLab matrices)."""
    a = chroma * math.cos(math.radians(hue))
    b = chroma * math.sin(math.radians(hue))
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    linear = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )

    def encode(x: float) -> int:
        x = min(1.0, max(0.0, x))
        x = 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
        return round(x * 255)

    return "#" + "".join(f"{encode(v):02x}" for v in linear)


def over(top: str, bottom: str, alpha: float) -> str:
    """`top` at `alpha` laid over `bottom`, the way the browser composites it."""
    t = [int(top[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(bottom[i : i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(alpha * x + (1 - alpha) * y):02x}" for x, y in zip(t, b))


PRIMARY = oklch(0.37, 0.09, 256)  # --primary: answered
SEG_QUEUED = oklch(0.64, 0.015, 256)  # --seg-queued: waiting in line
FOREGROUND = oklch(0.145, 0, 0)  # --foreground
MUTED_FOREGROUND = oklch(0.45, 0.01, 256)  # --muted-foreground
BAD = oklch(0.52, 0.19, 27)  # --bad: a 429
BAD_SOFT = oklch(0.96, 0.03, 27)  # --bad-soft
CANVAS = oklch(0.985, 0.003, 256)  # --canvas: page background
BORDER = oklch(0.922, 0, 0)  # --border
CONTROL_OFF = oklch(0.65, 0.01, 256)  # --control-off
WHITE = "#ffffff"

# The .stripes utility lays the foreground at 28% over the segment colour.
STRIPE = over(FOREGROUND, SEG_QUEUED, 0.28)

# Not a site token: a lighter navy so the favicon stays visible on dark tab bars.
PRIMARY_ON_DARK = oklch(0.78, 0.08, 256)

# Text in the SVGs uses the page's Geist when inlined; files opened on their own,
# and the social card rendered by Inkscape, fall back down this list.
FONT_STACK = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif"


if __name__ == "__main__":
    for name, value in sorted(globals().items()):
        if name.isupper() and isinstance(value, str) and value.startswith("#"):
            print(f"{name:18} {value}")
