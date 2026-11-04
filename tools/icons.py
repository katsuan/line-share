#!/usr/bin/env python3
"""Q キットの線アイコン（shared/icons/*.svg）を ui.css に入れる。アイコンを足したり変えたりしたら動かす。

  python3 tools/icons.py          … ui.css の「線アイコン」の所を作りなおす
  python3 tools/icons.py --check  … ui.css が shared/icons/ と合っているか見る（合っていなければ 1 で終わる）

アイコンは Lucide（ISC ライセンス。shared/icons/LICENSE）。Q の名前 = Lucide の名前：
  send=send save=download copy=copy settings=settings back=chevron-left add=plus delete=trash-2 close=x
  share=share-2 link=link calendar=calendar clock=clock edit=pencil view=eye check=check done=circle-check
  warn=triangle-alert tip=lightbulb login=key-round app=smartphone user=user bot=bot inbox=inbox
  offline=wifi-off wait=hourglass backup=hard-drive-download target=target lock=lock celebrate=party-popper
  camera=camera image=image place=map-pin search=search info=info refresh=refresh-cw external=external-link
  down=chevron-down next=chevron-right menu=menu heart=heart star=star bell=bell undo=undo-2
  palette=palette list=list-checks archive=archive vote=vote bag=backpack ticket=ticket coupon=ticket-percent
  stack=layers notice=megaphone team=users trophy=trophy eraser=eraser
  （ここから下は Lucide と同じ名前）git-fork hash message-circle zap eye-off sprout baby heart-pulse notebook
  sparkles mic mic-off volume-2 cake gift play
足すときは、Lucide の SVG の中身（<path> など）を、ほかのファイルと同じ <svg …> で包んで shared/icons/<名前>.svg に置く。
線の太さ（stroke-width="2"）・角（round）・大きさ（viewBox 0 0 24 24）は全部そろえる。
"""
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "shared" / "icons"
CSS = ROOT / "shared" / "ui.css"
START = "/* ---- 線アイコン：ここから（tools/icons.py が作る。手で書きかえない） ---- */"
END = "/* ---- 線アイコン：ここまで ---- */"
HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'


def icons():
    out = {}
    for path in sorted(ICONS.glob("*.svg")):
        svg = path.read_text(encoding="utf-8").strip()
        if not svg.startswith(HEAD):
            raise SystemExit(f"{path.name}: <svg> の書き方がほかとちがいます（線の太さ・大きさをそろえる）")
        # マスクで使うので、線の色は何でもよい（黒）。色は background の currentColor で付く
        out[path.stem] = svg.replace('stroke="currentColor"', 'stroke="#000"')
    return out


def block():
    lines = [START, ":root {"]
    for name, svg in icons().items():
        lines.append(f"  --ls-i-{name}: url(\"data:image/svg+xml,{quote(svg, safe=' =/:,.-')}\");")
    lines.append("}")
    lines.append("")
    for name in icons():
        lines.append(f'.ls-icon[data-icon="{name}"] {{ --ls-i: var(--ls-i-{name}); }}')
    lines.append(END)
    return "\n".join(lines)


def main():
    css = CSS.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(css):
        raise SystemExit("ui.css に線アイコンの所（ここから・ここまで）がありません")
    new = pattern.sub(lambda m: block(), css)
    if "--check" in sys.argv:
        if new != css:
            print("ui.css の線アイコンが shared/icons/ と合っていません。python3 tools/icons.py を動かす")
            sys.exit(1)
        print(f"線アイコン {len(icons())} 個：ui.css と合っています")
        return
    CSS.write_text(new, encoding="utf-8")
    print(f"線アイコン {len(icons())} 個を ui.css に入れました")


if __name__ == "__main__":
    main()
