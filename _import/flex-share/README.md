# FlexShare

GitHub Pages だけで動かす、LINE LIFF 向けの Flex Message 共有ページです。

## Files

- `docs/index.html`: 共有ページ本体
- `docs/config.json`: GitHub Pages で読む公開設定
- `docs/config.example.json`: 設定例

## Setup

1. LINE Developers で LIFF アプリを作成する
2. `docs/config.json` の `lineLiffId` に LIFF ID を入れる
3. GitHub Pages の公開先を `docs/` に設定する

## Query Parameters

- `headerTitle`
- `date`
- `title`
- `detail`
- `theme`
- `showDate`
- `showDetail`

例:

`?headerTitle=%E3%81%BF%E3%82%93%E3%81%AA%E3%81%AB%E5%85%B1%E6%9C%89&date=2026.08.12&title=FlexShare%E3%83%86%E3%82%B9%E3%83%88&detail=GitHub%20Pages%E3%81%8B%E3%82%89%E5%85%B1%E6%9C%89&theme=sunset`
