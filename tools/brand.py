#!/usr/bin/env python3
"""おくるん（OQRN）のロゴとアイコンを作る。

Q はふきだし：輪を一筆でくるんと回り、終わりが細くなって右下のしっぽになる（💬 を左右反転した向き）。
書き始めは矢じりにして、回ってまた戻ってくる（くり返し送る）感じを出す。
中の「…」はチャットの入力中。同じ形から次のファイルを書き出す（tools/ogp.py もこの形を使う）。
  shared/icon.svg             … ファビコン・ハブの見出し
  shared/icon-512.png         … PWA（maskable）
  shared/apple-touch-icon.png … iPhone のホーム画面
  shared/logo.svg             … 横長のロゴ「OQRN」

O は Q の輪と同じ真円で描く。R・N の字形は Jua（SIL Open Font License 1.1、~/Library/Fonts/Jua.ttf）から取る。
fontTools と Pillow が必要。

使い方: python3 tools/brand.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = Path.home() / "Library" / "Fonts" / "Jua.ttf"

ACCENT = (108, 71, 255)  # shared/ui.css の --ls-accent
ACCENT_LIGHT = (164, 139, 255)
INK = (43, 35, 80)  # ロゴの O・R・N の色（紫寄りの紺）
WHITE = (255, 255, 255)

# Q の形（輪の半径を 1 とした値）
RING_FROM, RING_SWEEP = 75, 320  # 右下（75°）から時計回りに 320° 回る
TAIL_TAN, TAIL_DOWN = 0.45, (0.2, 0.75)  # しっぽ：終わりの向きに伸ばし、右下へ曲げる
TAIL_END_WIDTH = 0.3  # しっぽの先の太さ（輪の太さに対する割合）
HEAD_BARB, HEAD_REACH = 0.32, 0.75  # 矢じりの張り出しと、とがりの長さ（輪の太さに対する割合）
HEAD = "full"  # おくるんのロゴは両側に矢じり（くるんと回って戻ってくる＝くり返し）


def hex_(rgb):
    return "#%02x%02x%02x" % rgb


def _bezier(p0, p1, p2, n):
    return [
        ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
         (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
        for t in (i / n for i in range(n + 1))
    ]


def q_outline(cx, cy, r, w, head=None):
    """Q（輪＋しっぽ）の外形を1つの多角形で返す。線の両側をずらして囲み、両端は丸める。
    head を付けると、輪の書き始め（しっぽと反対の端）を矢じりにする（"full"＝両側、"outer"/"inner"＝片側だけ）"""
    ring = [
        (cx + r * math.cos(math.radians(RING_FROM + RING_SWEEP * i / 160)),
         cy + r * math.sin(math.radians(RING_FROM + RING_SWEEP * i / 160)))
        for i in range(161)
    ]
    end = math.radians(RING_FROM + RING_SWEEP)
    tan = (-math.sin(end), math.cos(end))
    e = ring[-1]
    tail = _bezier(
        e,
        (e[0] + tan[0] * r * TAIL_TAN, e[1] + tan[1] * r * TAIL_TAN),
        (e[0] + r * TAIL_DOWN[0], e[1] + r * TAIL_DOWN[1]),
        60,
    )[1:]
    line = ring + tail
    widths = [w] * len(ring) + [w * (1 - (1 - TAIL_END_WIDTH) * (i / len(tail)) ** 0.8) for i in range(1, len(tail) + 1)]

    left, right = [], []
    for i, (x, y) in enumerate(line):
        a, b = line[max(i - 1, 0)], line[min(i + 1, len(line) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1
        nx, ny = -dy / length, dx / length
        h = widths[i] / 2
        left.append((x + nx * h, y + ny * h))
        right.append((x - nx * h, y - ny * h))

    def cap(center, h, frm, steps=16):
        # frm の向きから 180° 回して丸い端を作る
        a0 = math.atan2(frm[1] - center[1], frm[0] - center[0])
        return [(center[0] + h * math.cos(a0 - math.pi * k / steps), center[1] + h * math.sin(a0 - math.pi * k / steps)) for k in range(1, steps)]

    end_cap = cap(line[-1], widths[-1] / 2, left[-1])
    if not head:
        start_cap = cap(line[0], widths[0] / 2, right[0])
        return left + end_cap + right[::-1] + start_cap

    # 書き始めの矢じり：線の向きと逆（↺ の向き）へとがらせ、両側に少し張り出す
    (x0, y0), (x1, y1) = line[0], line[3]
    length = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x0 - x1) / length, (y0 - y1) / length
    nx, ny = -uy, ux
    barb, reach = w * HEAD_BARB, w * HEAD_REACH
    tip = (x0 + ux * reach, y0 + uy * reach)
    out_l = (left[0][0] + (left[0][0] - x0) / (w / 2) * barb, left[0][1] + (left[0][1] - y0) / (w / 2) * barb)
    out_r = (right[0][0] + (right[0][0] - x0) / (w / 2) * barb, right[0][1] + (right[0][1] - y0) / (w / 2) * barb)
    l_side = [out_l] if head in ("full", "outer") else []
    r_side = [out_r] if head in ("full", "inner") else []
    return left + end_cap + right[::-1] + r_side + [tip] + l_side


def q_dots(cx, cy, r):
    """中の「…」（中心と半径）"""
    gap = r * 0.42
    return [(cx + gap * i, cy, r * 0.15) for i in (-1, 0, 1)]


def _num(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def q_svg(cx, cy, r, w, fill, dot_fill):
    points = " ".join(f"{_num(x)} {_num(y)}" for x, y in q_outline(cx, cy, r, w, head=HEAD))
    dots = "".join(f'<circle cx="{_num(x)}" cy="{_num(y)}" r="{_num(rr)}" fill="{dot_fill}"/>' for x, y, rr in q_dots(cx, cy, r))
    return f'<path d="M{points}Z" fill="{fill}"/>{dots}'


def q_draw(d, cx, cy, r, w, fill, dot_fill, scale=1.0):
    d.polygon([(x * scale, y * scale) for x, y in q_outline(cx, cy, r, w, head=HEAD)], fill=fill)
    for x, y, rr in q_dots(cx, cy, r):
        d.ellipse([(x - rr) * scale, (y - rr) * scale, (x + rr) * scale, (y + rr) * scale], fill=dot_fill)


# ---- アイコン（100 x 100）----
# 「…」の真ん中のドット（輪の中心）を左右の真ん中に置き、上下は少し上（しっぽと矢じりで下が重くなる分と、
# 目で見た中央が実際より少し上にあることを合わせる）
ICON_Q = dict(cx=50, cy=48.5, r=26, w=11)


def icon_svg():
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{hex_(ACCENT)}"/><stop offset="1" stop-color="{hex_(ACCENT_LIGHT)}"/>'
        "</linearGradient></defs>"
        '<rect width="100" height="100" rx="23" fill="url(#g)"/>'
        f"{q_svg(**ICON_Q, fill='#ffffff', dot_fill='#ffffff')}"
        "</svg>\n"
    )


def gradient(width, height, start=ACCENT, end=ACCENT_LIGHT):
    """左上から右下へのグラデーション"""
    base = Image.new("RGB", (width, height), start)
    vertical = Image.linear_gradient("L").resize((width, height))
    horizontal = Image.linear_gradient("L").rotate(90).resize((width, height))
    mask = Image.blend(horizontal, vertical, 0.5)
    return Image.composite(Image.new("RGB", (width, height), end), base, mask)


# Android の maskable アイコンは中心から半径 40 の円の中しか必ずは見えないので、しっぽの先が入るよう縮める
MASKABLE_SCALE = 0.88


def icon_png(size, rounded=False, shrink=1.0):
    """rounded=False は角を丸めない（iPhone や maskable は OS 側で丸める）。shrink で Q を中央を基準に縮める"""
    big = size * 4
    img = gradient(big, big).convert("RGBA")
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    q = dict(cx=50 + (ICON_Q["cx"] - 50) * shrink, cy=50 + (ICON_Q["cy"] - 50) * shrink, r=ICON_Q["r"] * shrink, w=ICON_Q["w"] * shrink)
    q_draw(ImageDraw.Draw(layer), **q, fill=WHITE + (255,), dot_fill=WHITE + (255,), scale=big / 100)
    img.alpha_composite(layer)
    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.23, fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


# ---- 横長のロゴ「OQRN」 ----

def wordmark_layout():
    """フォントの単位で、R・N の輪郭（SVG のパス）と O・Q の円の位置を返す。y は下向き。
    O は Q の輪と同じ円にして、O と Q の丸さ・太さをそろえる（R・N は Jua の字形）"""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    font = TTFont(str(FONT_PATH))
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    r_bounds = _glyph_bounds(glyphs, cmap[ord("R")])
    cap_top, cap_bottom = r_bounds[3], r_bounds[1]  # 上下が平らな R で文字の高さを決める
    height = cap_top - cap_bottom
    w = height * 0.21  # O・Q の線の太さ（R・N の線とそろえる）
    r = height / 2 - w / 2
    gap = height * 0.07  # 文字のあいだ

    o = dict(cx=r + w / 2, cy=height / 2, r=r, w=w)
    q = dict(cx=o["cx"] + 2 * r + w + gap, cy=height / 2, r=r, w=w)
    paths, places = [], []
    x = q["cx"] + r + w / 2 + gap

    for char in "RN":
        name = cmap[ord(char)]
        lsb = _glyph_bounds(glyphs, name)[0]
        origin = x - lsb  # 字の左端（余白を除いた形の端）を x にそろえる
        places.append((char, origin))
        pen = SVGPathPen(glyphs)
        # フォントは y 上向きなので反転し、上端を 0 にそろえる
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, origin, cap_top)))
        paths.append(pen.getCommands())
        x = origin + _glyph_bounds(glyphs, name)[2] + gap

    width = x - gap
    tail_bottom = max(y for _, y in q_outline(**q))
    return dict(paths=paths, places=places, o=o, q=q, width=width, height=max(height, tail_bottom),
                cap_top=cap_top, units_per_em=font["head"].unitsPerEm)


def _glyph_bounds(glyphs, name):
    from fontTools.pens.boundsPen import BoundsPen

    pen = BoundsPen(glyphs)
    glyphs[name].draw(pen)
    return pen.bounds


def logo_svg():
    layout = wordmark_layout()
    paths, o, q, width, height = layout["paths"], layout["o"], layout["q"], layout["width"], layout["height"]
    pad = q["w"] * 0.2
    letters = "".join(f'<path d="{p}"/>' for p in paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_num(-pad)} {_num(-pad)} {_num(width + pad * 2)} {_num(height + pad * 2)}" role="img" aria-label="OQRN（おくるん）">'
        '<defs><linearGradient id="q" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{hex_(ACCENT)}"/><stop offset="1" stop-color="{hex_(ACCENT_LIGHT)}"/>'
        "</linearGradient></defs>"
        f'<g fill="{hex_(INK)}">{letters}</g>'
        f'<circle cx="{_num(o["cx"])}" cy="{_num(o["cy"])}" r="{_num(o["r"])}" fill="none" stroke="{hex_(INK)}" stroke-width="{_num(o["w"])}"/>'
        f"{q_svg(**q, fill='url(#q)', dot_fill=hex_(ACCENT))}"
        "</svg>\n"
    )


def wordmark_image(cap_height, letter_fill, q_fill, dot_fill):
    """ロゴ「OQRN」を画像にする（OGP などに使う）。cap_height は O の高さ（px）。q_fill は色か画像（グラデーション）"""
    from PIL import ImageFont

    layout = wordmark_layout()
    k = cap_height / (layout["q"]["cy"] * 2)  # Q の中心は O の高さの半分
    s = 4  # 4倍で描いてから縮める
    size = (round(layout["width"] * k * s) + 8, round(layout["height"] * k * s) + 8)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT_PATH), round(layout["units_per_em"] * k * s))
    for char, x in layout["places"]:
        d.text((x * k * s, layout["cap_top"] * k * s), char, font=font, fill=letter_fill, anchor="ls")
    o = {key: v * k * s for key, v in layout["o"].items()}
    outer, inner = o["r"] + o["w"] / 2, o["r"] - o["w"] / 2
    ring = Image.new("L", size, 0)
    ring_d = ImageDraw.Draw(ring)
    ring_d.ellipse([o["cx"] - outer, o["cy"] - outer, o["cx"] + outer, o["cy"] + outer], fill=255)
    ring_d.ellipse([o["cx"] - inner, o["cy"] - inner, o["cx"] + inner, o["cy"] + inner], fill=0)
    img.paste(Image.new("RGBA", size, letter_fill), (0, 0), ring)
    q = {key: v * k for key, v in layout["q"].items()}
    shape = Image.new("RGBA", size, (0, 0, 0, 0))
    q_draw(ImageDraw.Draw(shape), q["cx"], q["cy"], q["r"], q["w"], (255, 255, 255, 255), (0, 0, 0, 0), scale=s)
    fill = q_fill.resize(size) if isinstance(q_fill, Image.Image) else Image.new("RGBA", size, q_fill)
    fill = fill.convert("RGBA")
    fill.putalpha(shape.getchannel("A"))
    img.alpha_composite(fill)
    for x, y, rr in q_dots(q["cx"], q["cy"], q["r"]):
        d.ellipse([(x - rr) * s, (y - rr) * s, (x + rr) * s, (y + rr) * s], fill=dot_fill)
    return img.resize((size[0] // s, size[1] // s), Image.LANCZOS)


def main():
    (ROOT / "shared" / "icon.svg").write_text(icon_svg(), encoding="utf-8")
    (ROOT / "shared" / "logo.svg").write_text(logo_svg(), encoding="utf-8")
    icon_png(512, shrink=MASKABLE_SCALE).convert("RGB").save(ROOT / "shared" / "icon-512.png", optimize=True)
    icon_png(180).convert("RGB").save(ROOT / "shared" / "apple-touch-icon.png", optimize=True)
    print("wrote shared/icon.svg, shared/logo.svg, shared/icon-512.png, shared/apple-touch-icon.png")


if __name__ == "__main__":
    main()
