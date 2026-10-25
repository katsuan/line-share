#!/usr/bin/env python3
"""くらぶ 〜Qlove〜 の名前がつながるアニメーション（GIF と MP4）を作る。

流れ：アイコン（輪の中にハート）→ 横長のロゴ「Qlove」（ハートが輪から出て v の場所へ形を変えながら動く）
     → 「Qラブ」→「Qら部」→「くらぶ」→ アイコンにもどる（くり返し）
色は横長のロゴと同じ「Q人Q色」（tools/qlove.py の COLORS）。英字は Jua、かなと漢字はヒラギノ丸ゴ。

  python3 tools/qlove_anim.py [出す場所のフォルダ]
    … 横長の動画 qlove-intro.gif・qlove-intro.mp4（16:9。白い地）と、
      横長のロゴの代わりに置く qlove-anim.webp・qlove-anim-dark.webp（ロゴと同じ枠・地は透明・暗い表示用の色も）
"""
import os
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from brandkit import FONT_PATH  # noqa: E402
import qlove  # noqa: E402

# どの版を作るか（main がこのファイルを版ごとに読みなおす）：banner＝16:9 の白い地、logo・logo-dark＝ロゴの枠・透明
VARIANT = os.environ.get("QLOVE_ANIM", "banner")
COLORS = qlove.COLORS_DARK if VARIANT == "logo-dark" else qlove.COLORS
HEART = COLORS[3] if VARIANT == "logo-dark" else qlove.HEART
PURPLE = COLORS[0]
S = 2  # 2倍で描いて縮め、ふちをなめらかに
FPS = 30 if VARIANT == "banner" else 20  # ロゴの枠は軽くするため少なめ
MARU = "/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc"

if VARIANT == "banner":
    W, H = 960, 540  # 16:9
    Q_R = 72  # 横長のロゴの Q の輪の半径
    BG = (255, 255, 255, 255)
else:
    Q_R = 46  # 表示は高さ 26〜40px。2倍の画面でもにじまない大きさ
    _k = (qlove.H / 2) / qlove.RO
    _units = (qlove.H / 2 + (max(qlove.TAIL[1][0] + qlove.W / 2, qlove.C[0] + qlove.RO) - qlove.C[0]) * _k + qlove.GAP
              + sum(qlove.bounds(ch)[2] - qlove.bounds(ch)[0] for ch in "love") + qlove.GAP * 0.6 * 3)
    _px = 2 * Q_R / qlove.H
    _bottom = max(qlove.H, qlove.H / 2 + (qlove.TAIL[1][1] + qlove.W / 2 - qlove.C[1]) * _k) * _px
    PAD = 6
    W = round(_units * _px + PAD * 2)
    H = round(_bottom + PAD * 2)
    BG = (0, 0, 0, 0)  # 透明（ページの地の色がそのまま見える）
M = Q_R / 72  # 動きの大きさ（16:9 の版を 1 として）


def ease(t):
    """ゆっくり出てゆっくり止まる（0〜1 → 0〜1）"""
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    """a と b のあいだ（数・点・色）"""
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    return a + (b - a) * t


def heart_points(cx, cy, w, h, n=96):
    """真ん中 (cx, cy)・幅 w・高さ h のハートの点（先が下）"""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        pts.append((16 * math.sin(t) ** 3, -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    mx, my = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    sx, sy = w / (max(xs) - min(xs)), h / (max(ys) - min(ys))
    return [(cx + (x - mx) * sx, cy + (y - my) * sy) for x, y in pts]


class Layer:
    """1コマぶんの絵（2倍の大きさ）。図形と字を、透明度つきで重ねる"""

    def __init__(self):
        self.img = Image.new("RGBA", (W * S, H * S), BG)

    def _over(self, draw_fn, alpha):
        if alpha <= 0:
            return
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(layer))
        if alpha < 1:
            a = layer.getchannel("A").point(lambda v: int(v * alpha))
            layer.putalpha(a)
        self.img.alpha_composite(layer)

    def q(self, c, r, alpha=1.0, color=PURPLE, inner=1.0, gap=1.0):
        """Q（輪としっぽ）。tools/qlove.py と同じ数値（100×100 の形）を、輪の外側の半径が r になるよう縮めて c に置く。
        inner は輪の中のうすい色、gap はしっぽのまわりの白いすき間（アイコンは 1、横長のロゴは 0）"""
        k = r / qlove.RO * S
        to = lambda pt: (c[0] * S + (pt[0] - qlove.C[0]) * k, c[1] * S + (pt[1] - qlove.C[1]) * k)  # noqa: E731
        cx, cy = to(qlove.C)
        rr, w = qlove.R * k, qlove.W * k
        p0, p1 = to(qlove.TAIL[0]), to(qlove.TAIL[1])

        def cap_line(d, width, fill):
            d.line([p0, p1], fill=fill, width=round(width))
            for pt in (p0, p1):
                d.ellipse((pt[0] - width / 2, pt[1] - width / 2, pt[0] + width / 2, pt[1] + width / 2), fill=fill)

        def draw(d):
            if inner > 0:
                ri = rr - w / 2
                d.ellipse((cx - ri, cy - ri, cx + ri, cy + ri), fill=color + (round(255 * 0.1 * inner),))
            ro = rr + w / 2
            d.ellipse((cx - ro, cy - ro, cx + ro, cy + ro), outline=color + (255,), width=round(w))
            if gap > 0:
                cap_line(d, w + 3 * k * gap, (0, 0, 0, 0))  # すき間：輪を消して地を見せる
            cap_line(d, w, color + (255,))

        self._over(draw, alpha)

    def heart(self, c, w, h, alpha=1.0, color=HEART):
        """ハート（真ん中 c）"""
        pts = [(x * S, y * S) for x, y in heart_points(c[0], c[1], w, h)]
        self._over(lambda d: d.polygon(pts, fill=color + (255,)), alpha)

    def text(self, s, c, size, font, color, alpha=1.0, dy=0.0, anchor="mm", bold=0.0):
        """字（anchor の点が c）。dy で上下にずらす。bold は字のふちを太らせる割合（細い書体を太く見せる）"""
        f = ImageFont.truetype(font, round(size * S))
        sw = round(size * S * bold)
        self._over(lambda d: d.text((c[0] * S, (c[1] + dy) * S), s, font=f, fill=color + (255,), anchor=anchor,
                                    stroke_width=sw, stroke_fill=color + (255,)), alpha)

    def frame(self):
        img = self.img.resize((W, H), Image.LANCZOS)
        return img.convert("RGB") if VARIANT == "banner" else img


# ---- 場面ごとの置き場所 ----
CY = H / 2 if VARIANT == "banner" else PAD + Q_R
# アイコン：16:9 では大きな Q、ロゴの枠ではロゴの Q と同じ大きさで真ん中に
ICON_Q = ((W / 2 - 18, CY - 14), 150) if VARIANT == "banner" else ((W / 2 - Q_R * 0.25, CY), Q_R)
_u = ICON_Q[1] / qlove.RO  # アイコンの 1 目盛りの大きさ
ICON_HEART = ((ICON_Q[0][0], ICON_Q[0][1] + 0.5 * _u), qlove.ICON_HEART["w"] * _u, qlove.ICON_HEART["h"] * _u)

JUA = str(FONT_PATH)


def logo_layout(q_r=72):
    """横長のロゴ「Qlove」の並び（tools/qlove.py の logo() と同じ計算：輪の直径＝字の高さ、字のあいだは GAP × 0.6）。
    返すのは (Q の中心と半径, 字の大きさ, [(字, 字の原点x, 色)], ハートの (中心, 幅, 高さ), ベースラインの y)"""
    hh = qlove.H  # 字の高さ（フォントの単位）
    px = (2 * q_r) / hh  # フォントの 1 単位が何 px か
    k = (hh / 2) / qlove.RO
    qx = hh / 2
    x = qx + (max(qlove.TAIL[1][0] + qlove.W / 2, qlove.C[0] + qlove.RO) - qlove.C[0]) * k + qlove.GAP
    slots, heart = [], None
    for ch, col in zip("love", COLORS[1:]):
        b = qlove.bounds(ch)
        vw = b[2] - b[0]
        if ch == "v":
            heart = (x + vw / 2, hh - qlove.X_H, vw * 1.12, qlove.X_H * 1.02)
            slots.append(("♥", x - b[0], col))
        else:
            slots.append((ch, x - b[0], col))
        x += vw + qlove.GAP * 0.6
    right = x - qlove.GAP * 0.6
    left = W / 2 - right * px / 2  # 全体を真ん中に
    top = CY - hh / 2 * px
    to_x = lambda u: left + u * px  # noqa: E731
    q = ((to_x(qx), CY), q_r)
    slots = [(ch, to_x(ox), col) for ch, ox, col in slots]
    hc, ht, hw, hgt = heart
    heart = ((to_x(hc), top + (ht + hgt / 2) * px), hw * px, hgt * px)
    size = qlove.font["head"].unitsPerEm * px
    baseline = top + qlove.CAP_TOP * px
    return q, size, slots, heart, baseline


LOGO_Q, LOGO_SIZE, LOGO_SLOTS, LOGO_HEART, LOGO_BASE = logo_layout(Q_R)

KANA_SIZE = Q_R * (2.33 if VARIANT == "banner" else 1.8)  # ロゴの枠では高さに収まる大きさ


def kana_x(n, i, with_q):
    """かなを n 字並べたときの i 字目の中心。Q を左に置くときは、横長のロゴの Q のしっぽのすぐ右から"""
    step = KANA_SIZE * 1.04
    if with_q:
        return LOGO_Q[0][0] + LOGO_Q[1] * 1.6 + KANA_SIZE * 0.62 + i * step
    return W / 2 + (i - (n - 1) / 2) * step


def draw_icon(L, a=1.0):
    L.q(*ICON_Q, alpha=a)
    c, w, h = ICON_HEART
    L.heart(c, w, h, alpha=a)


def draw_logo(L, a=1.0, skip_heart=False, letters=1.0):
    L.q(*LOGO_Q, alpha=a, inner=0, gap=0)
    for ch, x, col in LOGO_SLOTS:
        if ch == "♥":
            if not skip_heart:
                c, w, h = LOGO_HEART
                L.heart(c, w, h, alpha=a)
        else:
            L.text(ch, (x, LOGO_BASE), LOGO_SIZE, JUA, col, anchor="ls", alpha=a * letters)


def draw_word(L, chars, with_q, a=1.0, dy=0.0):
    """「Q＋かな」か「かなだけ」を描く。chars は [(字, 色)]"""
    if with_q:
        L.q(*LOGO_Q, alpha=a, inner=0, gap=0)
    n = len(chars)
    for i, (ch, col) in enumerate(chars):
        L.text(ch, (kana_x(n, i, with_q), CY), KANA_SIZE, MARU, col, bold=0.03, alpha=a, dy=dy)


QLOVE_KANA = [("ラ", COLORS[1]), ("ブ", COLORS[3])]
QRA_BU = [("ら", COLORS[1]), ("部", COLORS[3])]
KURABU = [("く", PURPLE), ("ら", COLORS[1]), ("ぶ", COLORS[3])]


def frames():
    """1コマずつ返す"""
    sec = lambda s: max(1, round(s * FPS))  # noqa: E731

    def hold(fn, s):
        for _ in range(sec(s)):
            L = Layer()
            fn(L)
            yield L.frame()

    # 1. アイコン
    yield from hold(draw_icon, 1.0)

    # 2. アイコン → 横長のロゴ：輪は小さく左へ、ハートは輪から出て v の場所へ形を変えながら動く。ほかの字はあとから出る
    for k in range(sec(1.2)):
        t = ease(k / (sec(1.2) - 1))
        L = Layer()
        L.q(lerp(ICON_Q[0], LOGO_Q[0], t), lerp(ICON_Q[1], LOGO_Q[1], t), inner=1 - t, gap=1 - t)
        th = ease(min(1, k / (sec(1.2) - 1) * 1.15))  # ハートは少し先に着く
        hc = lerp(ICON_HEART[0], LOGO_HEART[0], th)
        hc = (hc[0], hc[1] - math.sin(th * math.pi) * (60 * M if VARIANT == "banner" else Q_R * 0.12))  # 弧をえがいて動く
        L.heart(hc, lerp(ICON_HEART[1], LOGO_HEART[1], th), lerp(ICON_HEART[2], LOGO_HEART[2], th))
        for ch, x, col in LOGO_SLOTS:
            if ch != "♥":
                L.text(ch, (x, LOGO_BASE), LOGO_SIZE, JUA, col, anchor="ls", alpha=ease((t - 0.45) / 0.55), dy=(1 - ease((t - 0.45) / 0.55)) * 24 * M)
        yield L.frame()
    yield from hold(draw_logo, 1.1)

    # 3. Qlove → Qラブ：love が上へ消え、ラブが下から出る（Q はそのまま）
    def word_change(old, new, s=0.7):
        for k in range(sec(s)):
            t = ease(k / (sec(s) - 1))
            L = Layer()
            old(L, 1 - t, -t * 30 * M)
            new(L, t, (1 - t) * 30 * M)
            yield L.frame()

    def logo_letters(L, a, dy):
        L.q(*LOGO_Q, inner=0, gap=0)
        for ch, x, col in LOGO_SLOTS:
            if ch == "♥":
                c, w, h = LOGO_HEART
                L.heart((c[0], c[1] + dy), w, h, alpha=a)
            else:
                L.text(ch, (x, LOGO_BASE), LOGO_SIZE, JUA, col, anchor="ls", alpha=a, dy=dy)

    def kana_only(chars, with_q):
        def fn(L, a, dy):
            n = len(chars)
            for i, (ch, col) in enumerate(chars):
                L.text(ch, (kana_x(n, i, with_q), CY), KANA_SIZE, MARU, col, bold=0.03, alpha=a, dy=dy)
        return fn

    yield from word_change(logo_letters, kana_only(QLOVE_KANA, True))
    yield from hold(lambda L: draw_word(L, QLOVE_KANA, True), 0.9)

    # 4. Qラブ → Qら部：1字ずつ入れかわる
    def swap(old, new, with_q_old, with_q_new, s=0.8):
        for k in range(sec(s)):
            t = ease(k / (sec(s) - 1))
            L = Layer()
            if with_q_old and with_q_new:
                L.q(*LOGO_Q, inner=0, gap=0)
            elif with_q_old:
                L.q(LOGO_Q[0], LOGO_Q[1], alpha=1 - t, inner=0, gap=0)
            kana_only(old, with_q_old)(L, 1 - t, -t * 26 * M)
            kana_only(new, with_q_new)(L, t, (1 - t) * 26 * M)
            yield L.frame()

    yield from swap(QLOVE_KANA, QRA_BU, True, True)
    yield from hold(lambda L: draw_word(L, QRA_BU, True), 0.9)

    # 5. Qら部 → くらぶ（Q が「く」に）
    yield from swap(QRA_BU, KURABU, True, False)
    yield from hold(lambda L: draw_word(L, KURABU, False), 1.3)

    # 6. くらぶ → アイコン（くり返しのつなぎ目）
    for k in range(sec(0.6)):
        t = ease(k / (sec(0.6) - 1))
        L = Layer()
        kana_only(KURABU, False)(L, 1 - t, 0)
        draw_icon(L, t)
        yield L.frame()


def write_banner(out):
    """16:9 の GIF（半分の大きさ）と MP4"""
    fs = list(frames())
    gif = out / "qlove-intro.gif"
    small = [f.resize((W // 2, H // 2), Image.LANCZOS) for f in fs]
    small[0].save(gif, save_all=True, append_images=small[1:], duration=round(1000 / FPS), loop=0, optimize=True)
    print(f"{gif}：{len(fs)} コマ・{len(fs) / FPS:.1f} 秒")
    if shutil.which("ffmpeg"):
        with tempfile.TemporaryDirectory() as tmp:
            for i, f in enumerate(fs):
                f.save(Path(tmp) / f"{i:04d}.png")
            mp4 = out / "qlove-intro.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(Path(tmp) / "%04d.png"),
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)], check=True)
            print(mp4)


def write_logo(out):
    """ロゴの枠の WebP（地は透明。くり返し）"""
    fs = list(frames())
    name = "qlove-anim-dark.webp" if VARIANT == "logo-dark" else "qlove-anim.webp"
    fs[0].save(out / name, save_all=True, append_images=fs[1:], duration=round(1000 / FPS), loop=0, quality=80, method=6)
    print(f"{out / name}：{W}×{H}・{len(fs)} コマ・{(out / name).stat().st_size // 1024} KB")


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "shared" / "qlove"
    out.mkdir(parents=True, exist_ok=True)
    if os.environ.get("QLOVE_ANIM"):
        (write_banner if VARIANT == "banner" else write_logo)(out)
        return
    for v in ("banner", "logo", "logo-dark"):  # 版ごとに、このファイルを読みなおして作る（置き場所と色が変わるため）
        subprocess.run([sys.executable, __file__, str(out)], env={**os.environ, "QLOVE_ANIM": v}, check=True)


if __name__ == "__main__":
    main()
