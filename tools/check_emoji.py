#!/usr/bin/env python3
"""data/line-emoji.json の絵文字と作者の ID が、LINE STORE に本当にあるかを確かめる。

JSON を書き換えたら、公開前に流す。ページがない ID（書き間違い）は NG と出る。
ストア上の名前も表示するので、name の書き間違いにも気づける。

使い方: python3 tools/check_emoji.py
"""
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCT = "https://store.line.me/emojishop/product/{}/ja"
AUTHOR = "https://store.line.me/emojishop/author/{}/ja"


def store_title(url):
    """ページがあればストア上の題名、なければ None"""
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            page = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError:
        return None
    match = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    # 商品がないときも 200 で一覧などに飛ぶことがあるので、og:title の有無も見る
    return html.unescape(match.group(1)) if match else None


def main():
    data = json.loads((ROOT / "data" / "line-emoji.json").read_text(encoding="utf-8"))
    ok = True
    for item in data.get("items", []):
        title = store_title(PRODUCT.format(item.get("id", "")))
        ok &= title is not None
        print(f"{'OK' if title else 'NG'}  {item.get('id')}  {item.get('name')}  →  {title or 'ページが見つかりません'}")
    author = data.get("author") or {}
    if author.get("id"):
        title = store_title(AUTHOR.format(author["id"]))
        ok &= title is not None
        print(f"{'OK' if title else 'NG'}  作者 {author['id']}  {author.get('name')}  →  {title or 'ページが見つかりません'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
