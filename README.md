# おくるん（OQRN）

場所・予定・お知らせ・文字・手書きを、LINE のトークにカードや画像で送れる LIFF ツール集です。
GitHub Pages で配信する静的サイトで、GAS は使いません。

公開URL: https://katsuan.github.io/line-share/

## ツール

| パス | 内容 |
|---|---|
| `/` | ツール一覧（おくるん） |
| `/plan/` | 📍📅 場所・予定。Google Maps の場所を写真・バッジ・コメント付きで送る。場所から「この場所で予定を作る」で Google カレンダー登録リンク付きの予定カードにできる |
| `/card/` | 🪧 お知らせカード。見出し・写真・バッジ・リンクボタン付きのお知らせカード。カード上で直接編集でき、ひな形・テンプレート保存・JSONコピーあり |
| `/image/` | 💬👆 文字・手書き。文字入りアイコンと手書きを1枚に重ね、縁取り・背景・動き（APNG）を付けて画像またはカードで送る |
| `server/` | 画像アップロード用 API（Render で動かす Node.js） |

全ページ共通のデザイン（`shared/ui.css`）、LIFF の準備（`shared/liff.js`。LINE の外で開いたときのログインのしかただけツールごとに選ぶ）、送るカード末尾の「Created by おくるん」（`shared/credit.js`）、アイコンは `shared/` にあります。

### 場所・予定をリンクから作る（クエリパラメータ）

`https://liff.line.me/<LIFF ID>/plan/?...` のように渡すと、その内容を入れた状態で開きます。渡したものだけが入ります。

| 対象 | パラメータ | 内容 |
|---|---|---|
| 共通 | `tab` | `map`（場所）か `calendar`（予定）。省略時は `start` があれば予定、ほかは場所 |
| 共通 | `header` / `sub` / `color` | ヘッダーの見出し・サブタイトル・色（`purple`・`sky`・`leaf`・`sunset`・`berry` か `ff6fa8` のような 16 進） |
| 場所 | `mapUrl` / `title` / `address` / `photoUrl` | Google Maps の URL・場所名・住所・写真（https） |
| 場所 | `comment` / `badges` | コメント、バッジ（カンマ区切り、5つまで） |
| 予定 | `title` / `details` / `url` | 件名・メモ・関連URL |
| 予定 | `start` / `end` / `minutes` | `2026-10-18T10:00` なら日時、`2026-10-18` なら終日。`end` の代わりに `minutes`（長さ・分）も使える |
| 予定 | `location` / `mapUrl` / `photoUrl` | 場所名・地図の URL・写真 |

例：`/plan/?tab=calendar&title=定例会&start=2026-10-18T10:00&minutes=90&location=渋谷オフィス&header=今週の定例&color=sky`
## 設定

`config.js` の1か所にまとめています。

- `liffId`: LIFF アプリの ID（1つだけ作る）
- `googleMapsApiKey`: 場所の検索に使う Google Maps JavaScript API のキー（任意）
- `imageApiBaseUrl`: `server/` をデプロイした URL
- `showCredit`: 送るカードに「Created by おくるん」を付けるか（`false` で全員から消える）
- `creditFreeUsers`: Created by を出さない LINE ユーザー（ユーザーIDの SHA-256）。`https://liff.line.me/<LIFF ID>/?credit=whoami` を LINE で開くと自分の値が表示される

### Created by を自分だけ消す

- その端末だけ: URL に `?credit=off` を付けて一度開く（`?credit=on` で戻る）
- LINE アカウント単位: `?credit=whoami` で表示された値を `creditFreeUsers` に追加する（機種変更しても有効）
- どちらもページ側の判定です。有償プランで消すときは、サーバーで購入状態を確かめてから `LineShareCredit.setEnabled(false)` を呼ぶ想定です

### LIFF

1. LINE Developers で LIFF アプリを1つ作る（Scope: `profile` / `chat_message.write`、Share Target Picker を有効化）
2. エンドポイント URL に `https://katsuan.github.io/line-share/` を設定する
3. 各ツールは `https://liff.line.me/<LIFF ID>/plan/` のようにパスを付けて開く。トップページが `liff.state` を受けて各ツールへ転送する

### Google Maps（任意）

Google Cloud で Maps JavaScript API と Places API (New) を有効にし、API キーを「HTTP リファラー」で `https://katsuan.github.io/*` に制限して `googleMapsApiKey` に設定します。
未設定のときは、Google Maps の共有 URL を貼って場所名を手入力する方式になります。

### 画像アップロード（server/）

LINE の画像メッセージには HTTPS で公開された画像 URL が必要なため、`server/` を Render などにデプロイします。

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- 環境変数: `ALLOWED_ORIGIN=https://katsuan.github.io`、`PUBLIC_BASE_URL=https://<サービス名>.onrender.com`

Render のローカルディスクは永続ではないため、保存した画像は再起動で消えます。

## 公開するとき

LINE アプリ内のブラウザが古いプログラムを持ち続けないよう、公開前に読み込むファイルの版を付け直します。

```bash
python3 tools/stamp.py
```

`?v=<日時>` が HTML の `<script>`・`<link>` と JS の import 先にまとめて付きます（同じモジュールは全ファイルで同じ版にそろえる必要があるため、必ずこのスクリプトで一括で付けます）。

## ロゴ・アイコン・OGP 画像

サービス名は「おくるん」、ロゴは「OQRN」（Q はふきだし。一筆でくるんと回り、書き始めが矢じり、終わりがしっぽ）。色は紫（`--ls-accent: #6c47ff`）。

```bash
python3 tools/brand.py   # shared/icon.svg・logo.svg・icon-512.png・apple-touch-icon.png
python3 tools/ogp.py     # shared/ogp.png（リンク共有時の画像・お知らせカードの「紹介」の写真）
```

macOS のヒラギノ角ゴシック、ロゴの字形に Jua（SIL Open Font License 1.1。`~/Library/Fonts/Jua.ttf`）、Pillow・fontTools を使います。

## ローカルでの確認

```bash
python3 -m http.server 8790
```

`http://localhost:8790/` を開きます。LINE の外のブラウザでは送信はできませんが、作成・プレビュー・保存は確認できます。

## 由来

次のリポジトリを履歴ごと取り込んで統合しました。

- line-googlemap（LIFF-GoogleMap）
- line-calendar-share（LIFF-calender）
- line-flex-share / line-flex-builder（LIFF-flexSender）
- line-text-icon-sender
- line-draw-share（LIFF-image）
