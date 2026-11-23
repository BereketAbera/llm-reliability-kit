"""One minute of token budget, for "What to check first for the 429s" on /how-it-works.

Three rows on one scale. Today Rep 1 and Rep 2 each reserve 15,000 tokens and
fill the 30,000-token minute, so Rep 3 lands over the limit and gets a 429.
With the retry queue Rep 3 waits about 30 seconds for room, then is answered.
With 4,000-token prompts three requests use 13,500 of 30,000: room for six.

Writes design/out/token-budget.svg. Text stays text: on the page the SVG is
inlined, so the labels use the page's own font. og.py reuses the pieces below.
"""

from pathlib import Path

from palette import (
    BAD,
    BAD_SOFT,
    BORDER,
    CONTROL_OFF,
    FONT_STACK,
    FOREGROUND,
    MUTED_FOREGROUND,
    PRIMARY,
    SEG_QUEUED,
    STRIPE,
    WHITE,
)

OUT = Path(__file__).resolve().parent / "out"

# The scenario in the post. Same numbers as DEFAULT_PARAMS in
# src/lib/reliability/scenario.ts; change both together.
PROMPT_TOKENS = 14_500
TRIMMED_TOKENS = 4_000
OUTPUT_TOKENS = 500
TPM = 30_000
PER_REQUEST = PROMPT_TOKENS + OUTPUT_TOKENS  # 15,000 reserved the moment a request arrives
PER_TRIMMED = TRIMMED_TOKENS + OUTPUT_TOKENS  # 4,500
WAIT_SECONDS = round(PER_REQUEST / (TPM / 60))  # 15,000 tokens of budget come back in 30 s
FIT_TRIMMED = TPM // PER_TRIMMED  # 6

WIDTH = 372
TRACK_X = 8
TRACK_W = 228  # one minute: 30,000 tokens
UNIT = TRACK_W / TPM
LIMIT_X = TRACK_X + TRACK_W + 4
OVER_X = TRACK_X + TRACK_W + 8  # where tokens past the limit start
BAR_H = 26
ROW_STEP = 60
FIRST_ROW = 30
HEIGHT = FIRST_ROW + 2 * ROW_STEP + 19 + BAR_H + 7

NUMBER_WORDS = {n: w for n, w in enumerate("zero one two three four five six seven eight nine ten".split())}

TITLE = "One minute of token budget"
DESC = (
    f"Today Rep 1 and Rep 2 each reserve {PER_REQUEST:,} tokens and fill the {TPM:,}-token minute; "
    f"Rep 3 does not fit and gets a 429. With the retry queue Rep 3 waits about {WAIT_SECONDS} seconds, then answers. "
    f"With {TRIMMED_TOKENS:,}-token prompts three requests use {3 * PER_TRIMMED:,} of {TPM:,}, room for {NUMBER_WORDS[FIT_TRIMMED]}."
)


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def text(x: float, y: float, content: str, size: float = 12, fill: str = FOREGROUND, weight: int = 400, anchor: str = "start", extra: str = "") -> str:
    anchor_attr = "" if anchor == "start" else f' text-anchor="{anchor}"'
    weight_attr = "" if weight == 400 else f' font-weight="{weight}"'
    return f'<text x="{fmt(x)}" y="{fmt(y)}" font-size="{fmt(size)}" fill="{fill}"{weight_attr}{anchor_attr}{extra}>{content}</text>'


def block(start_tokens: float, tokens: float, y: float, fill: str, extra: str = "", origin: float = TRACK_X) -> str:
    """A request's reservation, inset one unit so neighbours keep a hairline gap."""
    x = origin + start_tokens * UNIT + 1
    return f'<rect x="{fmt(x)}" y="{fmt(y + 1)}" width="{fmt(tokens * UNIT - 2)}" height="{BAR_H - 2}" rx="3" fill="{fill}"{extra}/>'


def defs() -> str:
    # The /burst "Waiting in line" style: the .stripes utility over --seg-queued.
    return (
        '<defs><pattern id="tb-wait" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        f'<rect width="6" height="6" fill="{SEG_QUEUED}"/><rect width="2" height="6" fill="{STRIPE}"/></pattern></defs>'
    )


def scale_labels(y: float = 0) -> list[str]:
    """The bracket over one minute and the area past the limit."""
    return [
        f'<path d="M{fmt(TRACK_X + 0.5)} {fmt(y + 21)}V{fmt(y + 16.5)}H{fmt(TRACK_X + TRACK_W - 0.5)}V{fmt(y + 21)}" fill="none" stroke="{MUTED_FOREGROUND}"/>',
        text(TRACK_X + TRACK_W / 2, y + 11, f"{TPM:,} tokens a minute", fill=FOREGROUND, weight=500, anchor="middle"),
        text(OVER_X + PER_REQUEST * UNIT / 2, y + 11, "over the limit", fill=MUTED_FOREGROUND, anchor="middle"),
    ]


def limit_line(y1: float, y2: float) -> str:
    return f'<path d="M{fmt(LIMIT_X)} {fmt(y1)}V{fmt(y2)}" stroke="{MUTED_FOREGROUND}" stroke-width="1.25" stroke-dasharray="3 3"/>'


def track(y: float) -> str:
    return f'<rect x="{TRACK_X}" y="{fmt(y)}" width="{TRACK_W}" height="{BAR_H}" rx="4" fill="{BORDER}"/>'


def label_y(bar_y: float) -> float:
    return bar_y + BAR_H / 2 + 4.2


def two_answered(bar_y: float) -> list[str]:
    out = [track(bar_y)]
    for i in range(2):
        out.append(block(i * PER_REQUEST, PER_REQUEST, bar_y, PRIMARY))
        out.append(text(TRACK_X + i * PER_REQUEST * UNIT + 9, label_y(bar_y), f"Rep {i + 1}", fill=WHITE, weight=600))
    return out


def today_row(bar_y: float) -> list[str]:
    """Rep 1 and Rep 2 fill the minute; Rep 3 lands past the limit and gets a 429."""
    over_end = OVER_X + PER_REQUEST * UNIT
    return [
        *two_answered(bar_y),
        block(0, PER_REQUEST, bar_y, BAD_SOFT, f' stroke="{BAD}" stroke-width="1.25"', origin=OVER_X),
        text(OVER_X + 9, label_y(bar_y), "Rep 3", fill=BAD, weight=600),
        text(over_end - 9, label_y(bar_y), "429", fill=BAD, weight=700, anchor="end"),
    ]


def queue_row(bar_y: float) -> list[str]:
    """Rep 3 waits in line until budget comes back, then is answered. The note sits above the block."""
    wait_w = 72
    over_end = OVER_X + PER_REQUEST * UNIT
    return [
        *two_answered(bar_y),
        text(OVER_X + 1, bar_y - 7, f"waits {WAIT_SECONDS} s", size=12, fill=FOREGROUND, weight=500),
        f'<rect x="{fmt(OVER_X + 1)}" y="{fmt(bar_y + 1)}" width="{wait_w}" height="{BAR_H - 2}" rx="3" fill="url(#tb-wait)"/>',
        f'<rect x="{fmt(OVER_X + wait_w)}" y="{fmt(bar_y + 1)}" width="{fmt(over_end - 1 - OVER_X - wait_w)}" height="{BAR_H - 2}" rx="3" fill="{PRIMARY}"/>',
        text((OVER_X + wait_w + over_end - 1) / 2, label_y(bar_y), "Rep 3", fill=WHITE, weight=600, anchor="middle"),
    ]


def trimmed_row(bar_y: float) -> list[str]:
    """Three 4,500-token requests, then dashed slots numbered for the three more that would fit."""
    out = [track(bar_y)]
    slot_w = PER_TRIMMED * UNIT
    for i in range(FIT_TRIMMED):
        centre = TRACK_X + (i + 0.5) * slot_w
        if i < 3:
            out.append(block(i * PER_TRIMMED, PER_TRIMMED, bar_y, PRIMARY))
            out.append(text(centre, label_y(bar_y), str(i + 1), fill=WHITE, weight=600, anchor="middle"))
        else:
            out.append(
                f'<rect x="{fmt(TRACK_X + i * slot_w + 1.5)}" y="{fmt(bar_y + 1.5)}" width="{fmt(slot_w - 3)}" height="{BAR_H - 3}" rx="2.5" '
                f'fill="none" stroke="{CONTROL_OFF}" stroke-dasharray="2.5 2"/>'
            )
            out.append(text(centre, label_y(bar_y), str(i + 1), fill=MUTED_FOREGROUND, weight=500, anchor="middle"))
    out.append(text(OVER_X + 1, label_y(bar_y), "nobody waits", fill=MUTED_FOREGROUND))
    return out


def row_title(y: float, lead: str, rest: str = "") -> str:
    tail = f'<tspan font-weight="400" fill="{MUTED_FOREGROUND}"> · {rest}</tspan>' if rest else ""
    return f'<text x="{TRACK_X}" y="{fmt(y)}" font-size="13" font-weight="600" fill="{FOREGROUND}">{lead}{tail}</text>'


def diagram() -> str:
    rows = [
        ("Today", f"{PER_REQUEST:,} each", today_row),
        ("With the retry queue", "", queue_row),
        ("Smaller prompts", f"{PER_TRIMMED:,} each", trimmed_row),
    ]
    body = [defs(), *scale_labels()]
    last_bar_bottom = 0.0
    for index, (lead, rest, draw) in enumerate(rows):
        top = FIRST_ROW + index * ROW_STEP
        bar_y = top + 19
        body.append(row_title(top + 12, lead, rest))
        body.extend(draw(bar_y))
        last_bar_bottom = bar_y + BAR_H
    body.insert(1, limit_line(14, last_bar_bottom + 4))
    inner = "\n  ".join(body)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{fmt(HEIGHT)}" viewBox="0 0 {WIDTH} {fmt(HEIGHT)}" '
        f'role="img" aria-labelledby="token-budget-title token-budget-desc" font-family="{FONT_STACK}">\n'
        f'  <title id="token-budget-title">{TITLE}</title>\n  <desc id="token-budget-desc">{DESC}</desc>\n  {inner}\n</svg>\n'
    )


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "token-budget.svg").write_text(diagram(), encoding="utf-8")
    print("design/out: token-budget.svg")
