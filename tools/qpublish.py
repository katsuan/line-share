#!/usr/bin/env python3
"""公開するときに、GitHub Actions の中で1回だけ動かす（Q のツール共通。.github/workflows/q-pages.yml から呼ぶ）。

リポジトリの中のファイルは書きかえない。Actions が checkout した写しに、次の3つをしてから Pages に出す。

  1. 読み込む JS・CSS に ?v=（日本時間の年月日時分。今ある番号より必ず大きく）を付ける
     ・おくるん（tools/stamp.py があるリポジトリ）は stamp.py、ほかは qstamp.py のやり方で、HTML を全部
     HTML からたどれないところ（前の名前で読まれる入口・ロゴやアイコン）にある ?v=数字 も、同じ番号にそろえる
  2. Q キット（https://katsuan.github.io/oqrn/shared/…）を読む <script src>・<link href> に、
     Q キットの版（--kit。shared/ をさいごに変えたコミットの日本時間。中身が同じなら同じ番号）を付ける。?v= のないものにも付ける
  3. 何を出したかを qpublish.json に書く（3時間ごとの見回りが、Q キットの版が変わったかを見るのに使う）
     --kit-file を付けると shared/version.txt にも Q キットの版を書く（おくるんだけ。ほかのツールがこれを読む）

  4. --site <フォルダ> を付けると、Pages に出す写しをそのフォルダに作り、出してはいけないものが入っていないかを確かめる
     （テスト・作る道具・お試しの画面は出さない。入れないものは SITE_SKIP、入っていたら止めるものは unclean()）

使い方: python3 qpublish.py <リポジトリのフォルダ> [--kit 版] [--kit-file] [--commit SHA] [--site 写しのフォルダ]
       python3 qpublish.py --check-clean <フォルダ>   … 出してはいけないものが入っていないかだけ見る
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qstamp  # noqa: E402

KIT_ATTR = re.compile(r'((?:src|href)=")(https://katsuan\.github\.io/oqrn/shared/[^"?#]+\.(?:js|css))(?:\?v=[^"#]*)?(")')


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


# Pages に出す写しに入れないもの
#   どの深さでも：テストのフォルダ・テストのファイル・点で始まるもの（手元の設定・git。.nojekyll と .well-known は出す）
#   いちばん上だけ：作る道具（tools/）・node の設定・README.md でない .md（手元向けの決まりのメモ）
SITE_SKIP_ANY = {"node_modules", "test", "tests", "__tests__", "__pycache__"}
SITE_KEEP_DOT = {".nojekyll", ".well-known"}
SITE_SKIP_TOP = {"tools", "package.json", "package-lock.json"}
TEST_FILE = re.compile(r"\.(test|spec)\.[cm]?js$")
# 入っていたら止めるもの（写しの作り方をまちがえたとき・お試しの画面の名前）
UNCLEAN_NAME = re.compile(r"^(mock|mocks|__mocks__|fixtures|sandbox)$|[-_.]mock\.html?$", re.I)


def skip(rel):
    parts = rel.parts
    if set(parts) & SITE_SKIP_ANY or parts[0] in SITE_SKIP_TOP or TEST_FILE.search(rel.name):
        return True
    if any(part.startswith(".") and part not in SITE_KEEP_DOT for part in parts):
        return True
    return len(parts) == 1 and rel.suffix.lower() == ".md" and rel.name != "README.md"


def unclean(site):
    """出してはいけないもの（相対パスの一覧）。空なら出してよい"""
    site = Path(site)
    bad = []
    for path in sorted(site.rglob("*")):
        rel = path.relative_to(site)
        if any(rel.is_relative_to(Path(b)) for b in bad):
            continue  # 止めるフォルダの中は数えない（フォルダの名前だけ出す）
        if skip(rel) or UNCLEAN_NAME.search(rel.name):
            bad.append(str(rel))
    return bad


def make_site(root, site):
    """root から、出してよいものだけを site に写す"""
    site = Path(site).resolve()
    if site.exists():
        shutil.rmtree(site)
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if skip(rel) or not path.is_file():
            continue
        out = site / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, out)
    bad = unclean(site)
    if bad:
        sys.exit("公開の写しに、出してはいけないものがあります：" + "・".join(bad))
    print(f"公開の写し: {site}（{sum(1 for p in site.rglob('*') if p.is_file())} ファイル）")


def main():
    if sys.argv[1:2] == ["--check-clean"]:
        bad = unclean(sys.argv[2])
        if bad:
            sys.exit("出してはいけないものがあります：" + "・".join(bad))
        print("出してはいけないものは入っていません")
        return
    ap = argparse.ArgumentParser(description="公開のときに ?v= を付ける（Actions の中だけで使う）")
    ap.add_argument("root")
    ap.add_argument("--kit", default="")
    ap.add_argument("--kit-file", action="store_true")
    ap.add_argument("--commit", default="")
    ap.add_argument("--site", default="")
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
    if args.site:
        make_site(root, args.site)


if __name__ == "__main__":
    main()
