# Flexメッセージ作成ツール

GitHub Pagesにそのまま配置できる LIFF Flex Message Builder です。

## ファイル

- index.html
- style.css
- app.js
- config.js
- README.md

## 設定

`config.js` の `YOUR_LIFF_ID` を自分のLIFF IDに変更してください。

```js
window.APP_CONFIG = {
  LIFF_ID: "2000000000-xxxxxxxx"
};
```

## 主な機能

- タイトル必須（Flex headerに固定表示）
- バッジ複数追加
- URIボタン複数追加
- 写真設定（画像はheroに配置）
- 写真タップ時のURIアクション
- OFF時の詳細設定アコーディオン非表示
- body内ブロック表示順変更（バッジ・サブタイトル・本文）
- カラープリセット
- プリセットカード自体の配色反映
- PC: 左設定 / 右プレビュー
- スマホ: 固定プレビューボタン
- localStorageテンプレート保存
- JSONコピー
- LIFF shareTargetPicker送信

## GitHub Pages

1. 全ファイルをリポジトリに配置
2. GitHub Pagesを有効化
3. 公開URLをLINE DevelopersのLIFF Endpoint URLに設定
4. LINEアプリ内でLIFFを開いて送信確認
