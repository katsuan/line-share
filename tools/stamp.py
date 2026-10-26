#!/usr/bin/env python3
"""公開前に実行し、読み込むファイルの URL に ?v=<日時> を付け直す。

LINE アプリ内のブラウザや GitHub Pages のキャッシュで古いプログラムが動き続けないよう、
HTML の <script>/<link> と、JS の import 先に同じ版を付ける。
同じモジュールは全ファイルで同じ URL にしないと二重に読み込まれるため、必ず全体をまとめて付け直す。

使い方: python3 tools/stamp.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from qstamp import next_version  # noqa: E402  付ける番号の決め方は Q のツール共通（今あるいちばん大きい番号より必ず大きく）

VERSION = next_version(ROOT)

# 自分のファイル（./ や ../ で始まる .js / .css）だけを対象にする
HTML_REF = re.compile(r'((?:src|href)="(?:\./|\.\./)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"')
JS_IMPORT = re.compile(r'((?:from|import\()\s*"\./[^"?]+\.js)(?:\?v=[^"]*)?"')


def stamp(path: Path, pattern: re.Pattern) -> bool:
    text = path.read_text(encoding="utf-8")
    updated = pattern.sub(lambda m: f'{m.group(1)}?v={VERSION}"', text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def main() -> int:
    changed = []
    for html in sorted(ROOT.glob("**/*.html")):
        if "server" in html.parts or "node_modules" in html.parts:
            continue
        if stamp(html, HTML_REF):
            changed.append(html)
    # ES モジュールの import 先（場所・予定と文字・手書き）。plan/assets/ は前の名前を読むだけなので触らない
    modules = [ROOT / "plan/app.js", ROOT / "image/app.js", *ROOT.glob("plan/js/*.js"), *ROOT.glob("image/js/*.js")]
    for js in sorted(modules):
        if stamp(js, JS_IMPORT):
            changed.append(js)
    for path in changed:
        print(f"stamped {path.relative_to(ROOT)} (v={VERSION})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
