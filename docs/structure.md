# Q のツールのファイルの並べ方と名前

どのツールを開いても、同じ名前のファイルに同じ役わりがあるようにするための決まりです。新しいツールは最初からこの形で作り、今のツールは手を入れるときにそろえます。
使い心地の決まりは [ux.md](ux.md)、共通の部品は [README の「Q キット」](../README.md#q-キットq-のツールの共通部品) にあります。

## ページ（GitHub Pages のツール）

| 名前 | 役わり |
|---|---|
| `index.html` | 使う画面。ページが2つあるときは、作る画面を `create.html`（受けとった人が見るほうを `index.html`） |
| `app.js` | 画面の入口（1ページに1つ）。部品をつないで、ボタンや入力を受ける。`create.html` の入口は `create.js` |
| `style.css` | 見た目（1ページに1つ）。大きくなったら `css/○○.css` に分けて、`style.css` から `@import` |
| `js/○○.js` | 役わりごとの部品。名前は小文字の英語、2語以上は `-` でつなぐ（`place-name.js`） |
| `data/○○.json` | 決まった中身（お題・市区町村の表など） |
| `sw.js`・`manifest.webmanifest` | 電波がないときに開く仕組みと、ホーム画面に置くときの設定（`manifest.json` にしない） |
| `test/○○.test.js`（`.mjs`） | テスト（`node --test test/`） |
| `tools/○○.py` | 画像や表を作る道具（公開するが、ページからは読まない） |
| `docs/○○.html`・`privacy.html` | 手順書・LINE の情報の使い方 |
| `README.md` | 何のツールか・ファイルの一覧・公開のしかた |

### `js/` の名前（同じ役わりは、どのツールでも同じ名前）

| 名前 | 役わり |
|---|---|
| `store.js` | 端末に残すもの（localStorage）の読み書きと形の確かめ |
| `card.js` | 送るカード（Flex・おくるんのお知らせカード）を作る |
| `link.js` | URL の受け渡し（ほかのツールへのリンク・受けとったリンクを読む・共有リンク） |
| `stats.js` | 数える・まとめる（何日つづいた・合計など） |
| `line-config.js`・`linelog.js` | LINE 版のつなぎ先の設定と、記録ボット・くらぶボットへ送る |
| そのほか | ツールにしかないものは、中身を表す名詞で（`meteo.js`・`board.js`・`draw.js`） |

- 使わない名前：`main.js`・`script.js`・`common.js`・`utils.js`・`core.js`（何が入っているかわからない）。中身に合わせて分けるか、`app.js` にまとめる
- ページの直下に部品を置かない（`calendar.js`・`params.js` は `js/` の中へ）

### 名前を変えるとき

- 部品（`js/` の中）は、読む側の `import` もいっしょに変え、`?v=` を前より大きい値にそろえる（[README の qstamp](../tools/qstamp.py)）
- HTML から読むファイル（`app.js`・`style.css` など）の名前を変えるときは、LINE の中のブラウザが古い HTML を覚えていることがあるので、前の名前のファイルを1か月ほど残す（新しいファイルを読むだけの短い中身にする）。消す日を README に書く
- `sw.js` の覚えるファイルの一覧も直す
- 公開している URL（`index.html`・`create.html`・`privacy.html`・`docs/` の手順書）の名前は変えない

## GAS（LINE のボット）

- ファイルは「番号＋役わり」で、読みこむ順がわかるように（例：`01_config.js`・`02_entry.js`）。1つのリポジトリの中でそろえる
- 共通の部品は、どのボットでも同じ名前：`season.gs`（季節の絵文字。q-oqrn の `shared/season.js` の写し）・`selfcheck.gs`（自己点検。`tools/qtest/selfcheck.gs` の写し）
- 写しの中身は元と同じにする（テストで確かめる）
