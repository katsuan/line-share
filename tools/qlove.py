#!/usr/bin/env python3
"""くらぶ 〜Qlove〜（Q のツール群ぜんたい）の共通ロゴとアイコンを作る。

Q はほかのツールと同じ輪＋しっぽ（中には何も入れない）。love の v をハートにする。
字は「Q人Q色」：Q・l・o・ハート・e を、ツールたちの色（紫・青・緑・コーラル・オレンジ。少しくすませた色）で1字ずつ塗る。
アプリのアイコンは白い地に紫の Q。板つきロゴは、Q と同じ紫のグラデーションに白い字。
  shared/qlove/logo.svg            … 横長のロゴ（Q人Q色。白い地に置く）
  shared/qlove/logo-dark.svg       … 暗い地に置くとき（同じ5色を明るめに）
  shared/qlove/logo-plate.svg      … グラデーションの板に白い字（ほかのツールのロゴと並べるとき）
  shared/qlove/icon.svg            … ファビコン
  shared/qlove/icon-512.png ほか   … ホーム画面・PWA
  shared/qlove/ogp.png             … OGP（1200×630。白い地にロゴとキャッチ）

使い方: python3 tools/qlove.py（brandkit.py と同じく Pillow・fontTools・Jua が要る）
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from brandkit import FONT_PATH, Brand, hex_, num, polar  # noqa: E402
from fontTools.pens.boundsPen import BoundsPen  # noqa: E402
from fontTools.pens.svgPathPen import SVGPathPen  # noqa: E402
from fontTools.pens.transformPen import TransformPen  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "shared" / "qlove"

BRAND = Brand((164, 140, 245), (108, 78, 214))  # 紫（ロゴの Q の紫を、明るめ → 濃いめに）
INK = (43, 35, 80)  # 紺（色を指定しないときの字）
HEART = (240, 110, 100)  # ハートのコーラル
# Q人Q色：Q・l・o・ハート・e の色（紫・青・緑・コーラル・オレンジ）。
# 原色を並べると Google のロゴに似るので、どれも少しくすませて、やわらかくしている
COLORS = [(124, 92, 230), (96, 150, 210), (104, 178, 132), HEART, (232, 160, 72)]
COLORS_DARK = [(170, 150, 255), (130, 182, 240), (130, 204, 156), (255, 140, 128), (246, 186, 110)]  # 暗い地では明るめに
COPY = "Q人Q色。くらしの部室へようこそ。"

# Q の形（100 × 100 の座標。ほかのツールの Q と同じくらいの太さ）
C = (47, 47)
R, W = 22, 9.5
RO = R + W / 2
TAIL = [polar(C, 45, R), polar(C, 45, RO + 13)]
Q_SHAPES = [
    {"t": "circle", "c": C, "r": R, "alpha": 0.16},
    {"t": "ring", "c": C, "r": R, "w": W},
    {"t": "line", "p": TAIL, "w": W + 3, "fill": "bg"},
    {"t": "line", "p": TAIL, "w": W},
]

# アプリのアイコン：白い地に紫の Q（ロゴの Q と同じ紫）
ICON_BRAND = Brand((255, 255, 255), (255, 255, 255))
ICON_SHAPES = [{**sh, "fill": sh.get("fill", COLORS[0])} for sh in Q_SHAPES]
ICON_SHAPES[0] = {**ICON_SHAPES[0], "alpha": 0.1}

font = TTFont(str(FONT_PATH))
GLYPHS, CMAP = font.getGlyphSet(), font.getBestCmap()


def bounds(ch):
    pen = BoundsPen(GLYPHS)
    GLYPHS[CMAP[ord(ch)]].draw(pen)
    return pen.bounds


CAP_TOP, BASE = bounds("I")[3], bounds("I")[1]
H = CAP_TOP - BASE  # 字の高さ（Q の輪の直径）
X_H = bounds("x")[3] - BASE  # 小文字の高さ（ハートの高さ）
GAP = H * 0.07


def heart(cx, top, w, h):
    """上のへこみの高さが top、先が top + h、幅 w のハート"""
    pts = []
    for i in range(96):
        t = 2 * math.pi * i / 96
        pts.append((16 * math.sin(t) ** 3, -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))))
    y0, y1 = min(y for _, y in pts), max(y for _, y in pts)
    return [(cx + x * w / 32, top + (y - y0) / (y1 - y0) * h) for x, y in pts]


def logo(ink=None, plate=False, colors=None):
    """「Qlove」の SVG。plate=True はグラデーションの板に白い字、そうでなければ ink の字＋ハートの色（地は透明）。
    colors は Q・l・o・ハート・e の色を1つずつ（Q人Q色の版）"""
    k = (H / 2) / RO
    qx = RO * k  # Q の輪の左はしを 0 に
    x = qx + (max(TAIL[1][0] + W / 2, C[0] + RO) - C[0]) * k + GAP
    letter = "#ffffff" if plate else hex_(ink)
    heart_fill = "#ffffff" if plate else hex_(HEART)
    if colors:
        letter_of = {ch: hex_(c) for ch, c in zip("lov", colors[1:4])} | {"e": hex_(colors[4])}
        heart_fill = letter_of["v"]
    body = ""
    for ch in "love":
        b = bounds(ch)
        if colors:
            letter = letter_of[ch]
        if ch == "v":  # v の幅の少し広めに、小文字の高さのハート
            vw = b[2] - b[0]
            pts = heart(x + vw / 2, H - X_H, vw * 1.12, X_H * 1.02)
            body += f'<polygon points="{" ".join(f"{num(px)},{num(py)}" for px, py in pts)}" fill="{heart_fill}"/>'
        else:
            pen = SVGPathPen(GLYPHS)
            GLYPHS[CMAP[ord(ch)]].draw(TransformPen(pen, (1, 0, 0, -1, x - b[0], CAP_TOP)))
            body += f'<path d="{pen.getCommands()}" fill="{letter}"/>'
        x += (b[2] - b[0]) + GAP * 0.6
    right = x - GAP * 0.6
    bottom = max(H, H / 2 + (TAIL[1][1] + W / 2 - C[1]) * k)

    if plate:
        pad_x, pad_y = H * 0.55, H * 0.42
        x0, y0, w, h = -pad_x, -pad_y, right + pad_x * 2, bottom + pad_y * 2
        ix0, iy0 = (x0 - qx) / k + C[0], (y0 - H / 2) / k + C[1]
        defs = BRAND.gradient_svg(x0, y0, w, h) + BRAND.gradient_svg(ix0, iy0, w / k, h / k, gid="gm")
        bg = f'<rect x="{num(x0)}" y="{num(y0)}" width="{num(w)}" height="{num(h)}" rx="{num(H * 0.3)}" fill="url(#g)"/>'
        q = BRAND.shapes_svg(Q_SHAPES, gid="gm")
    else:
        pad = H * 0.08
        x0, y0, w, h = -pad, -pad, right + pad * 2, bottom + pad * 2
        defs, bg = "", ""
        qc = hex_(colors[0]) if colors else letter
        q = (f'<circle cx="{C[0]}" cy="{C[1]}" r="{R}" fill="none" stroke="{qc}" stroke-width="{W}"/>'
             f'<path d="M{num(TAIL[0][0])} {num(TAIL[0][1])}L{num(TAIL[1][0])} {num(TAIL[1][1])}" fill="none" stroke="{qc}" '
             f'stroke-width="{W}" stroke-linecap="round"/>')
    mark = f'<g transform="translate({num(qx)} {num(H / 2)}) scale({k:.5f}) translate({-C[0]} {-C[1]})">{q}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(x0)} {num(y0)} {num(w)} {num(h)}" role="img" aria-label="Qlove（くらぶ）">'
            f"{f'<defs>{defs}</defs>' if defs else ''}{bg}{body}{mark}</svg>\n")


def logo_png(height, color=(255, 255, 255), colors=None):
    """logo() と同じ並びを Pillow で描いた PNG（地は透明。OGP に貼る）。height は Q の輪の高さ（px）。
    colors を渡すと Q・l・o・ハート・e を1字ずつその色で塗る（Q人Q色）"""
    from PIL import Image, ImageDraw, ImageFont

    big = 4  # 4 倍で描いて縮め、ふちをなめらかにする
    s = height * big / H
    k = (H / 2) / RO
    qx = RO * k
    x = qx + (max(TAIL[1][0] + W / 2, C[0] + RO) - C[0]) * k + GAP
    marks = []
    for ch in "love":
        b = bounds(ch)
        marks.append((ch, x, b))
        x += (b[2] - b[0]) + GAP * 0.6
    right = x - GAP * 0.6
    bottom = max(H, H / 2 + (TAIL[1][1] + W / 2 - C[1]) * k)
    img = Image.new("RGBA", (math.ceil(right * s) + 4, math.ceil(bottom * s) + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fill = color + (255,)
    fill_of = dict(zip("Qlove", [c + (255,) for c in colors])) if colors else dict.fromkeys("Qlove", fill)
    font_px = ImageFont.truetype(str(FONT_PATH), round(font["head"].unitsPerEm * s))
    for ch, ox, b in marks:
        if ch == "v":
            vw = b[2] - b[0]
            d.polygon([(px * s, py * s) for px, py in heart(ox + vw / 2, H - X_H, vw * 1.12, X_H * 1.02)], fill=fill_of["v"])
        else:  # 字の原点（左・ベースライン）に置く。ベースラインは CAP_TOP の高さ
            d.text(((ox - b[0]) * s, CAP_TOP * s), ch, font=font_px, fill=fill_of[ch], anchor="ls")
    # Q：輪としっぽ（100×100 の形を縮めて置く）
    to = lambda p: ((qx + (p[0] - C[0]) * k) * s, (H / 2 + (p[1] - C[1]) * k) * s)  # noqa: E731
    cx, cy = to(C)
    ro, ri = (R + W / 2) * k * s, (R - W / 2) * k * s
    fill = fill_of["Q"]
    d.ellipse((cx - ro, cy - ro, cx + ro, cy + ro), fill=fill)
    d.ellipse((cx - ri, cy - ri, cx + ri, cy + ri), fill=(0, 0, 0, 0))
    lw = W * k * s
    a, b2 = to(TAIL[0]), to(TAIL[1])
    d.line([a, b2], fill=fill, width=round(lw))
    for p in (a, b2):
        d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=fill)
    return img.resize((img.width // big, img.height // big), Image.LANCZOS)


def write_ogp(path):
    """OGP（1200×630）。白い地の真ん中に「Qlove」のロゴ（Q人Q色）を大きく、その下にキャッチと説明"""
    from PIL import Image, ImageDraw, ImageFont

    W_, H_ = 1200, 630
    img = Image.new("RGBA", (W_, H_), (255, 255, 255, 255))
    mark = logo_png(150, colors=COLORS)
    img.alpha_composite(mark, ((W_ - mark.width) // 2, 150))
    d = ImageDraw.Draw(img)
    hira = lambda w, size: ImageFont.truetype(f"/System/Library/Fonts/ヒラギノ角ゴシック W{w}.ttc", size)  # noqa: E731
    d.text((W_ / 2, 430), COPY, font=hira(8, 46), fill=INK, anchor="ms")
    d.text((W_ / 2, 490), "スマホと LINE で使う、くらしの小さなツールたち", font=hira(6, 28), fill=(110, 104, 140), anchor="ms")
    img.convert("RGB").save(path, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "logo.svg").write_text(logo(INK, colors=COLORS), encoding="utf-8")
    (OUT / "logo-dark.svg").write_text(logo(INK, colors=COLORS_DARK), encoding="utf-8")
    (OUT / "logo-plate.svg").write_text(logo(plate=True), encoding="utf-8")
    ICON_BRAND.write_icons(OUT, ICON_SHAPES)
    write_ogp(OUT / "ogp.png")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
