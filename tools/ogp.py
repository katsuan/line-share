#!/usr/bin/env python3
"""おくるん（OQRN）の OGP 画像（shared/ogp.png、1200x630）を作る。

リンクを共有したときの画像と、お知らせカードの「紹介」テンプレートの写真に使う。
ロゴの形は tools/brand.py から取る。macOS のヒラギノ角ゴシック・Jua・fontTools・Pillow が必要。

使い方: python3 tools/ogp.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from brand import WHITE, gradient, wordmark_image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "ogp.png"

S = 2  # 2倍で描いてから縮め、線や文字のふちをなめらかにする
CARD_SCALE = 0.84  # 右側のカードの見本の大きさ
CARD_MARGIN = 84  # 見本と画像の右端のあいだ（px）
W, H = 1200, 630

INK = (31, 31, 28)


def font(weight, size):
    return ImageFont.truetype(f"/System/Library/Fonts/ヒラギノ角ゴシック W{weight}.ttc", size * S)


def box(x0, y0, x1, y1):
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def pill(img, x, y, text, fnt, fill, color, pad_x=18, height=46):
    """半透明の色も重ねて描けるよう、別の層に描いてから合成する"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = d.textlength(text, font=fnt) / S
    d.rounded_rectangle(box(x, y, x + w + pad_x * 2, y + height), radius=height * S // 2, fill=fill)
    d.text(((x + pad_x) * S, (y + height / 2) * S), text, font=fnt, fill=color, anchor="lm")
    img.alpha_composite(layer)
    return x + w + pad_x * 2


def sample_card():
    """右側に置く、お知らせカードの見本"""
    cw, ch = 400, 470
    card = Image.new("RGBA", (cw * S, ch * S), (0, 0, 0, 0))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw * S - 1, ch * S - 1], radius=28 * S, fill=255)

    body = Image.new("RGBA", card.size, WHITE + (255,))
    header = gradient(cw * S, 120 * S, (245, 158, 11), (251, 113, 133))
    body.paste(header, (0, 0))
    d = ImageDraw.Draw(body)
    d.text((28 * S, 46 * S), "週末のお知らせ", font=font(8, 30), fill=WHITE, anchor="lm")
    d.text((28 * S, 88 * S), "10/18（土）10:00〜", font=font(6, 20), fill=(255, 255, 255, 230), anchor="lm")

    d.text((28 * S, 156 * S), "公園でピクニック", font=font(8, 28), fill=INK, anchor="lm")
    x = 28
    for label in ("雨天中止", "持ち物あり"):
        x = pill(body, x, 186, label, font(6, 17), (245, 158, 11), WHITE, pad_x=14, height=34) + 8
    d.rounded_rectangle(box(28, 238, cw - 28, 338), radius=16 * S, fill=(255, 247, 237))
    for i, width in enumerate((300, 250, 180)):
        d.rounded_rectangle(box(48, 260 + i * 26, 48 + width, 272 + i * 26), radius=6 * S, fill=(253, 205, 160))
    d.rounded_rectangle(box(28, 360, cw - 28, 418), radius=14 * S, fill=(245, 158, 11))
    d.text((cw / 2 * S, 389 * S), "地図を開く", font=font(7, 22), fill=WHITE, anchor="mm")
    d.text((cw / 2 * S, 446 * S), "Created by おくるん ›", font=font(4, 15), fill=(150, 150, 145), anchor="mm")

    card.paste(body, (0, 0), mask)
    return card


def main():
    img = gradient(W * S, H * S).convert("RGBA")
    d = ImageDraw.Draw(img)

    # 左：ロゴ・読み方・キャッチコピー・説明・できること
    logo = wordmark_image(96 * S, WHITE + (255,), WHITE + (255,), WHITE + (255,))
    img.alpha_composite(logo, (78 * S, 112 * S))
    d.text((84 * S, 268 * S), "おくるん", font=font(6, 26), fill=(255, 255, 255, 220), anchor="ls")
    d.text((82 * S, 342 * S), "つくって、おくるん。", font=font(8, 50), fill=WHITE, anchor="ls")
    d.text((84 * S, 396 * S), "写真やボタン付きのカードを、LINEで送れます。", font=font(5, 24), fill=WHITE, anchor="ls")
    x = 82
    for label in ("場所・予定", "お知らせ", "文字・手書き"):
        x = pill(img, x, 444, label, font(6, 24), (255, 255, 255, 56), WHITE) + 12

    # 右：カードの見本（少し傾けて影を付ける）
    # 小さく表示されても端からはみ出して見えないよう、上下左右に余白を取って置く
    card = sample_card().rotate(5, expand=True, resample=Image.BICUBIC)
    card = card.resize((round(card.width * CARD_SCALE), round(card.height * CARD_SCALE)), Image.LANCZOS)
    # ぼかしが層の端で切れないよう、影は余白を付けた層に描く
    pad = 60 * S
    shadow = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (31, 15, 90, 0))
    shadow.putalpha(0)
    alpha = Image.new("L", shadow.size, 0)
    alpha.paste(card.getchannel("A").point(lambda a: a * 0.32), (pad, pad))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(18 * S)))
    cx = W - CARD_MARGIN - card.width // S
    cy = (H - card.height // S) // 2
    img.alpha_composite(shadow, ((cx + 6) * S - pad, (cy + 16) * S - pad))
    img.alpha_composite(card, (cx * S, cy * S))

    img.convert("RGB").resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
