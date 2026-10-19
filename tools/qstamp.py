#!/usr/bin/env python3
"""公開する前に、読み込む JS・CSS に版の番号（?v=UTC の年月日時分）を付け直す。Q のツール共通（おくるん自身は tools/stamp.py）。

LINE アプリの中のブラウザと GitHub Pages は JS・CSS を強くキャッシュするので、直したのに古いファイルが残り、
新しい HTML と古い JS が混ざって画面が真っ白になる（「export が見つからない」など）。毎回これを通して防ぐ。

  ・HTML の <script src>・<link href> と、CSS の @import のうち、このリポジトリの中のファイル（http で始まらないもの）に ?v= を付ける
  ・読み込まれる CSS の中の @import も同じように付け直す（キロっくの style.css → css/*.css など）
  ・モジュール（type="module"）から import でたどれる JS は、import の中（from "./x.js"）にも同じ ?v= を付ける
    （おくるんの tools/stamp.py と同じやり方。同じモジュールは全部同じ URL にしないと二重に読み込まれるので、まとめて付け直す）

使い方（リポジトリのフォルダで）: python3 ../q-oqrn/tools/qstamp.py index.html [create.html ...]
"""
import datetime
import re
import sys
from pathlib import Path

STAMP = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M")
LOCAL = r"(?![a-z]+:|//)"  # http: や // で始まらない（このリポジトリの中の）パス
ATTR = re.compile(r'((?:src|href)=")' + LOCAL + r'([^"?#]+\.(?:js|css))(?:\?v=[^"#]*)?(")')
IMPORT_CSS = re.compile(r'(@import\s+(?:url\()?["\'])' + LOCAL + r'([^"\'?#]+\.css)(?:\?v=[^"\'#]*)?(["\'])')
IMPORT_JS = re.compile(r'((?:from|import)\s*["\'])(\.{1,2}/[^"\'?]+\.js)(?:\?v=[^"\']*)?(["\'])')
MODULE = re.compile(r'<script[^>]*type="module"[^>]*src="' + LOCAL + r'([^"?#]+\.js)')


def stamp_css(path, done):
    if path in done or not path.exists():
        return
    done.add(path)
    text = path.read_text(encoding="utf-8")
    for m in IMPORT_CSS.finditer(text):
        stamp_css((path.parent / m.group(2)).resolve(), done)
    new = IMPORT_CSS.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={STAMP}{m.group(3)}", text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print(f"  {path.name}: @import に ?v={STAMP}")


def stamp_module(path, done):
    """モジュールの import の中に ?v= を付け、import 先もたどって同じように付ける"""
    if path in done or not path.exists():
        return
    done.add(path)
    text = path.read_text(encoding="utf-8")
    for m in IMPORT_JS.finditer(text):
        stamp_module((path.parent / m.group(2)).resolve(), done)
    new = IMPORT_JS.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={STAMP}{m.group(3)}", text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print(f"  {path.name}: import に ?v={STAMP}")


def stamp_html(path):
    root = path.parent.resolve()
    text = path.read_text(encoding="utf-8")
    for m in ATTR.finditer(text):
        if m.group(2).endswith(".css"):
            stamp_css((root / m.group(2)).resolve(), set())
    text = ATTR.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={STAMP}{m.group(3)}", text)
    done = set()
    for m in MODULE.finditer(text):
        stamp_module((root / m.group(1)).resolve(), done)
    path.write_text(text, encoding="utf-8")
    print(f"{path}: ?v={STAMP}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for name in sys.argv[1:]:
        stamp_html(Path(name))
