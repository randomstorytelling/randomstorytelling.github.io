"""Option E marks (Lawrence 2026-09-28): Elza Medium, wide tracking, no rule.
Writes into ./E/ and never touches the earlier files beside it."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
FONT = str(Path.home() / "Library/Fonts/Elza-Medium.otf")
OUT = Path(__file__).parent / "E"
TRACK = 0.16          # em, between letters
WORD_GAP = 0.55       # em, extra at a space
TM_SCALE, TM_GAP = 0.22, 0.05

def measure(lines, size, tmark=True):
    f = ImageFont.truetype(FONT, size); tm = ImageFont.truetype(FONT, max(8, int(size * TM_SCALE)))
    widths = []
    for i, line in enumerate(lines):
        w = 0
        for j, ch in enumerate(line):
            w += (size * WORD_GAP if ch == " " else f.getlength(ch))
            if j < len(line) - 1: w += size * TRACK
        if i == len(lines) - 1: w += size * TM_GAP + tm.getlength("™")
        widths.append(w)
    return f, tm, widths

def mark(lines, W, H, ink, bg, pad_frac, name, max_cap=None, tmark=True):
    lo, hi = 8, 900
    while lo < hi:                       # largest size that fits the box
        mid = (lo + hi + 1) // 2
        f, tm, ws = measure(lines, mid, tmark)
        cap = f.getbbox("H")[3] - f.getbbox("H")[1]
        block_h = cap * len(lines) + cap * 0.62 * (len(lines) - 1)
        ok = max(ws) <= W * (1 - 2 * pad_frac) and block_h <= H * (1 - 2 * pad_frac) and (max_cap is None or cap <= max_cap)
        lo, hi = (mid, hi) if ok else (lo, mid - 1)
    size = lo; f, tm, ws = measure(lines, size, tmark)
    top, bot = f.getbbox("H")[1], f.getbbox("H")[3]; cap = bot - top
    block_h = cap * len(lines) + cap * 0.62 * (len(lines) - 1)
    im = Image.new("RGBA", (W, H), bg); d = ImageDraw.Draw(im)
    x0 = (W - max(ws)) / 2; y = (H - block_h) / 2
    for i, line in enumerate(lines):
        x = x0
        for j, ch in enumerate(line):
            if ch == " ": x += size * WORD_GAP
            else:
                d.text((x, y - top), ch, font=f, fill=ink); x += f.getlength(ch)
            if j < len(line) - 1: x += size * TRACK
        if tmark and i == len(lines) - 1:
            d.text((x + size * TM_GAP, y - tm.getbbox("T")[1]), "™", font=tm, fill=ink)
        y += cap * 1.62
    im.save(OUT / name); print(name, im.size, "size", size, "cap", cap)

K, Wt, CLR, WH = (0, 0, 0, 255), (255, 255, 255, 255), (0, 0, 0, 0), (255, 255, 255, 255)
# BASE CAMP carries no trademark sign (Lawrence 2026-09-28); RANDOM STORYTELLING keeps it
BC, RS = ["BASE CAMP"], ["RANDOM", "STORYTELLING"]
mark(BC, 800, 800, K, CLR, .09, "basecamp-logo-800x800-transparent.png", tmark=False)
mark(BC, 800, 800, K, WH, .09, "basecamp-logo-800x800-white-bg.png", tmark=False)
mark(BC, 1200, 630, K, WH, .14, "basecamp-thumbnail-1200x630.png", tmark=False)
mark(BC, 1400, 250, K, CLR, .03, "basecamp-wordmark-black-1400.png", tmark=False)
mark(BC, 1400, 250, Wt, CLR, .03, "basecamp-wordmark-white-1400.png", tmark=False)
mark(RS, 800, 800, K, CLR, .09, "rs-logo-800x800-transparent.png")
mark(RS, 800, 800, K, WH, .09, "rs-logo-800x800-white-bg.png")
mark(RS, 1200, 630, K, WH, .14, "rs-thumbnail-1200x630.png")
mark(RS, 1200, 308, K, CLR, .04, "rs-wordmark-black-1200.png")
mark(RS, 1200, 308, Wt, CLR, .04, "rs-wordmark-white-1200.png")
