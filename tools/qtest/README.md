# qtest：Q のツールのテストの道具

本番のシート・LINE・ドライブに触らずに、Q のツール（と、これから Q に入れるツール）を確かめる道具です。決まりは [docs/security.md](../../docs/security.md)（セキュリティ）と [docs/ux.md](../../docs/ux.md)（使い心地）。

| ファイル | 使いどころ |
|---|---|
| `fake-gas.js` | GAS の偽物。node のテストで GAS のコードを動かす |
| `check-code.mjs` | 危ない書き方を探す（コードを読むだけ）。`docs/security.md` の番号で出す |
| `selfcheck.gs` | GAS のプロジェクトに入れて、使う前に GAS エディタで `qCheckAll` を動かす。`safeCell()` もここ |
| `example.test.js` | テストの書き方の見本 |

## GAS のテスト（node）

各リポジトリに `test/` を作り、node の標準のテスト（`node:test`）で書きます。npm の部品は要りません。

```bash
node --test test/
```

```js
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { createGas } = require(path.join(process.env.HOME, "GitHub/q-oqrn/tools/qtest/fake-gas.js"));

test("本人確認なしの呼び出しは断る", () => {
  const gas = createGas({ dir: path.join(__dirname, "../gs"), properties: { LINE_CHANNEL_ACCESS_TOKEN: "test" } });
  const res = gas.doPost({ action: "getLiffAppState" });
  assert.equal(res.ok, false);
});
```

`createGas` に渡すもの：`dir`（GAS のフォルダ。`test` は読まない）か `source`、`properties`（Script Properties）、`fetch(url, opt)`（外への問い合わせの返事。`response(status, body)` を返す。渡さなければ LINE の見本の返事）、`expose`（`const`・`let` で書いた名前を外から読みたいとき）。

できること：

| 呼び方 | 中身 |
|---|---|
| `gas.call("名前", …)` | トップレベルの関数を呼ぶ |
| `gas.eval("式")` | GAS の中で式を動かす（定数を読むなど） |
| `gas.doPost(body)` / `gas.doGet(param)` | 画面からの呼び出し。JSON で返したものは中身を返す |
| `gas.lineEvent(event, { key })` | LINE の Webhook として1つのイベントを送る |
| `gas.replies()` / `gas.lastMessages()` | LINE に送ったメッセージ |
| `gas.flexProblems()` | LINE が受けつけない（error）・受けつけないことがある（warn）書き方 |
| `gas.seed("シート", rows)` / `gas.rows("シート")` | シートに見本を入れる／中身を見る |
| `gas.formulaCells()` | 外の文字が、式のまま（= + - @ で始まる）シートに書かれたところ |
| `gas.fetches` / `gas.calls` / `gas.logs` / `gas.reads.count` | 外への問い合わせ・置きもののサービスの呼び出し・ログ・シートを読んだ回数 |
| `gas.reset()` | 記録を空にする |

足りないサービス（CalendarApp など）は、呼んだことだけを覚える置きもの（`gas.calls`）です。要るものは `fake-gas.js` に足します（ほかのツールも使うので、名前は変えない）。

## 使う前の確かめ（GAS エディタ）

1. `selfcheck.gs` を GAS のプロジェクトにコピーする（`99_selfcheck.gs` など。番号の並びの最後に）
2. プロジェクトに `Q_SELF_CHECK` を書く（何を確かめるか。書き方は `selfcheck.gs` の上）
3. GAS エディタで `qCheckAll` を実行し、実行ログを見る（✅ だいじょうぶ／⚠️ 見てほしい／❌ 直す）

何も書きこまず、LINE にも送りません（カードは LINE の「確かめるだけ」の API に渡します）。

## 危ない書き方を探す

```bash
node ~/GitHub/q-oqrn/tools/qtest/check-code.mjs .
```

出るのは「ここを見てね」の目印です。確かめて問題ないものは、その行（か1つ上の行）に `// qcheck-ok: W1 決まった文字だけ` のように書くと、次から出ません。鍵のような文字（S1）・知らない所の script（W4）・`eval`（W2）があると、終わりの値が 1 になります。
