#!/usr/bin/env python3
"""公開するときに、GitHub Actions の中で1回だけ動かす（Q のツール共通。.github/workflows/q-pages.yml から呼ぶ）。

リポジトリの中のファイルは書きかえない。Actions が checkout した写しに、次の3つをしてから Pages に出す。

  1. 読み込む JS・CSS に ?v=（日本時間の年月日時分。今ある番号より必ず大きく）を付ける
     ・おくるん（tools/stamp.py があるリポジトリ）は stamp.py、ほかは qstamp.py のやり方で、HTML を全部
     HTML からたどれないところ（前の名前で読まれる入口・ロゴやアイコン）にある ?v=数字 も、同じ番号にそろえる
  2. Q キット（https://katsuan.github.io/line-share/shared/…）を読む <script src>・<link href> に、
     Q キットの版（--kit。shared/ をさいごに変えたコミットの日本時間。中身が同じなら同じ番号）を付ける。?v= のないものにも付ける
  3. 何を出したかを qpublish.json に書く（3時間ごとの見回りが、Q キットの版が変わったかを見るのに使う）
     --kit-file を付けると shared/version.txt にも Q キットの版を書く（おくるんだけ。ほかのツールがこれを読む）

使い方: python3 qpublish.py <リポジトリのフォルダ> [--kit 版] [--kit-file] [--commit SHA]
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qstamp  # noqa: E402

KIT_ATTR = re.compile(r'((?:src|href)=")(https://katsuan\.github\.io/line-share/shared/[^"?#]+\.(?:js|css))(?:\?v=[^"#]*)?(")')


def html_files(root):
    """公開する HTML（テスト・道具などの中は除く）"""
    out = []
    for path in sorted(root.rglob("*.html")):
        parts = path.relative_to(root).parts
        if qstamp.SKIP_DIRS.intersection(parts) or any(p.startswith(".") for p in parts):
            continue
        out.append(path)
    return out


def stamp_own(root):
    """1. 自分のファイルに ?v=。番号を返す"""
    version = qstamp.next_version(root)
    if (root / "tools" / "stamp.py").exists():
        subprocess.run([sys.executable, str(root / "tools" / "stamp.py")], check=True)
        return version
    qstamp.STAMP = version
    cwd = os.getcwd()
    os.chdir(root)
    try:
        for path in html_files(root):
            qstamp.stamp_html(path.relative_to(root))
    finally:
        os.chdir(cwd)
    sweep_versions(root, version)
    return version


# 自分のファイルを読む ?v=数字（"js/app.js?v=…" "../app.js?v=…"・ロゴやアイコンの画像など。https:// の外のファイルは除く）
OWN_VERSION = re.compile(r'(["\'(])([^"\'()\s?]+\.(?:js|mjs|css|svg|png|jpe?g|webp|gif|ico|json|webmanifest))\?v=\d{8,14}(?![0-9])')


def sweep_versions(root, version):
    """HTML からたどれないところ（前の名前で読まれる入口・document.write の中など）の ?v= も同じ番号に。
    手で付けていたころは、テストが「全部そろっている」ことを確かめていた。公開の写しでもそろえる"""
    count = 0
    for path in sorted(root.rglob("*")):
        parts = path.relative_to(root).parts
        if path.suffix not in (".html", ".js", ".mjs", ".css") or qstamp.SKIP_DIRS.intersection(parts) or any(p.startswith(".") for p in parts):
            continue
        text = path.read_text(encoding="utf-8")
        new, n = OWN_VERSION.subn(lambda m: m.group(0) if "//" in m.group(2) else f"{m.group(1)}{m.group(2)}?v={version}", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            count += n
    print(f"そのほかの ?v= も {version} に（{count} か所）")


def stamp_kit(root, kit):
    """2. Q キットを読むところに、Q キットの版を付ける"""
    count = 0
    for path in html_files(root):
        text = path.read_text(encoding="utf-8")
        new, n = KIT_ATTR.subn(lambda m: f"{m.group(1)}{m.group(2)}?v={kit}{m.group(3)}", text)
        if n:
            path.write_text(new, encoding="utf-8")
            count += n
    print(f"Q キットの版 ?v={kit}（{count} か所）")


def main():
    ap = argparse.ArgumentParser(description="公開のときに ?v= を付ける（Actions の中だけで使う）")
    ap.add_argument("root")
    ap.add_argument("--kit", default="")
    ap.add_argument("--kit-file", action="store_true")
    ap.add_argument("--commit", default="")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    version = stamp_own(root)
    if args.kit:
        stamp_kit(root, args.kit)
        if args.kit_file:
            (root / "shared" / "version.txt").write_text(args.kit + "\n", encoding="utf-8")
    info = {"version": version, "kit": args.kit, "commit": args.commit}
    (root / "qpublish.json").write_text(json.dumps(info, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"qpublish.json: {info}")


if __name__ == "__main__":
    main()
