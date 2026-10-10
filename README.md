# LINEで共有

場所・予定・カード・文字アイコン・手書きを、LINE のトークへ送れる LIFF ツール集です。
GitHub Pages で配信する静的サイトで、GAS は使いません。

公開URL: https://katsuan.github.io/line-share/

## ツール

| パス | 内容 |
|---|---|
| `/` | ツール一覧 |
| `/plan/` | 📍 場所 / 📅 予定。Google Maps の場所を写真・バッジ・コメント付きで送る。場所から「この場所で予定を作る」で Google カレンダー登録リンク付きの予定カードにできる |
| `/card/` | 🪧 カード。見出し・写真・バッジ・リンクボタン付きのお知らせカード。カード上で直接編集でき、ひな形・テンプレート保存・JSONコピーあり |
| `/image/` | 💬 文字 / 👆 手書き。文字入りアイコンと手書きを1枚に重ね、縁取り・背景・動き（APNG）を付けて画像またはカードで送る |
| `server/` | 画像アップロード用 API（Render で動かす Node.js） |

全ページ共通の骨格（上部バー・下部の送信バー・入力中の送信バー非表示）は `shared/` にあります。

## 設定

`config.js` の1か所にまとめています。

- `liffId`: LIFF アプリの ID（1つだけ作る）
- `googleMapsApiKey`: 場所の検索に使う Google Maps JavaScript API のキー（任意）
- `imageApiBaseUrl`: `server/` をデプロイした URL

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
