# LIFF Draw Send

LINE LIFF 上で手書きした canvas 画像を PNG 化し、Render 側で公開 URL を発行して `shareTargetPicker()` から画像送信する monorepo です。

## 構成

```txt
liff-draw-send/
├─ frontend/
│  ├─ .nojekyll
│  └─ index.html
├─ server/
│  ├─ .gitignore
│  ├─ index.js
│  └─ package.json
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml
└─ README.md
```

## 要件定義

### 目的

- GitHub Pages 上で LIFF フロントエンドを公開する
- Render 上で画像アップロード API と静的ファイル配信を動かす
- LIFF の canvas 描画結果を画像メッセージとして LINE Share Target Picker で送る

### 機能要件

- `frontend/index.html`
  - 1:1 の canvas を表示する
  - ポインター操作で手書き描画できる
  - ブラシ色と太さを変更できる
  - LIFF ID と Render API Base URL を保存できる
  - `liff.init()` で初期化する
  - canvas を PNG data URL に変換して Render API に送る
  - 返却された公開 URL を `liff.shareTargetPicker()` に渡して画像送信する
- `server/index.js`
  - `POST /api/upload` で base64 画像を受け取る
  - サーバー内に画像を保存する
  - 外部公開可能な画像 URL を返す
  - `/uploads/*` を静的配信する
  - `GET /health` を提供する

### 非機能要件

- GitHub Pages は `frontend/` をそのまま配信する
- Render 側は Node.js + Express で動作する
- CORS は `ALLOWED_ORIGIN` で制限できる
- 画像保存先は Render のローカルディスクのため永続ではない

## セットアップ

### 1. LIFF アプリを作成

- LINE Developers Console で LIFF アプリを作成する
- Endpoint URL には GitHub Pages の URL を設定する
- Share Target Picker が使えるチャネル設定を確認する

### 2. Render に server をデプロイ

`server` ディレクトリを Node サービスとしてデプロイします。

- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: `server`

環境変数:

- `ALLOWED_ORIGIN=https://<your-github-pages-domain>`
- `PUBLIC_BASE_URL=https://<your-render-service>.onrender.com`

### 3. GitHub Pages を有効化

- GitHub リポジトリに push する
- GitHub の Settings > Pages で GitHub Actions を利用する
- `.github/workflows/deploy-pages.yml` により `frontend/` が配信される

### 4. フロントエンド初期設定

- GitHub Pages 上でアプリを開く
- LIFF ID を入力する
- Render API Base URL を入力する
- `Save Config` を押す
- `Initialize LIFF` を押してログインと初期化を完了する
- 通常画面では背景を `Transparent` の ON/OFF とカラーピッカーで切り替えられる

通常は設定欄を隠したユーザー向け画面が表示されます。設定値や詳細ログを確認したい場合だけ、URL の末尾に `?debug=1` を付けてデバッグ表示に切り替えます。

LINE 認証なしで画面だけ確認したい場合は、URL の末尾に `?mock=1` を付けると LIFF 初期化と送信をスキップした確認モードで開けます。`?debug=1&mock=1` の併用も可能です。

## API

### `POST /api/upload`

Request:

```json
{
  "imageData": "data:image/png;base64,..."
}
```

Response:

```json
{
  "imageUrl": "https://your-render-service.onrender.com/uploads/xxxx.png"
}
```

## 注意点

- Share Target Picker は LIFF 対応環境でのみ使えます
- 通常モードでは透明背景の PNG を送信します
- Render のローカル保存は一時的です。永続化が必要なら S3 や Cloudinary に置き換えてください
- LINE の画像メッセージは HTTPS で外部公開された URL が必要です
