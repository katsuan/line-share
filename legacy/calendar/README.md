# LIFF Calendar Share

GitHub Pages にそのまま配置できる、静的な LIFF アプリです。Google カレンダー登録用 URL を生成し、LINE のトークへ Flex Message で共有できます。

## ファイル構成

- `index.html`
- `assets/styles.css`
- `assets/app.js`

## 対応内容

- 必須入力
  - 件名
  - 開始日 / 開始時刻
  - 終了日 / 終了時刻
- 追加オプションのアコーディオン
  - 場所 `location`
  - 関連URL
  - 予定詳細 `details`
  - タイムゾーン `ctz`
  - 繰り返しルール `recur`
  - 参照元情報 `sprop`
  - 任意の追加クエリパラメータ
- GoogleカレンダーURL生成
- Flex Messageプレビュー
- LIFF からの共有
  - `liff.sendMessages()` で現在のトークに送信
  - `liff.shareTargetPicker()` で送信先を選択

## GitHub Pages 前提の使い方

1. `index.html` と `assets/` をそのままリポジトリへ配置します。
2. `assets/app.js` の `CONFIG.liffId` を対象の LIFF ID に合わせます。
3. GitHub Pages を有効化して公開 URL を取得します。
4. LINE Developers の LIFF エンドポイント URL に GitHub Pages の URL を設定します。

## 実装メモ

- モバイルの `datetime-local` 崩れを避けるため、日時は `date` と `time` の分離入力にしています。
- GoogleカレンダーURLは `https://calendar.google.com/calendar/render?action=TEMPLATE...` を利用します。
- カスタムパラメータ欄は、既知の項目以外を任意に追加したい場合の逃げ道として入れています。
