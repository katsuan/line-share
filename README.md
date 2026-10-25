# おくるん（OQRN）

場所・予定・お知らせ・文字・手書きを、LINE のトークにカードや画像で送れる LIFF ツール集です。
GitHub Pages で配信する静的サイトです。GAS（`gas/`）はプランの判定と有償プランの画像保存だけに使います。

公開URL: https://katsuan.github.io/line-share/

## ツール

| パス | 内容 |
|---|---|
| `/` | ツール一覧（おくるん。`index.html`・`app.js` 動き・`style.css` 見た目） |
| `/plan/` | 📍🗓️ 場所・予定（`app.js` 入口、`style.css`、`js/`：`map.js` 場所・`calendar.js` 予定・`card.js` 送るカード・`header.js` 色の帯・`place-search.js` 場所の検索・`link.js` リンクの確かめ・`page.js` 画面の状態と送る・`config.js` 決まった値）。Google Maps の場所を写真・バッジ・コメント付きで送る。場所から「この場所で予定を作る」で Google カレンダー登録リンク付きの予定カードにできる |
| `/card/` | 🪧 お知らせカード。見出し・写真・バッジ・リンクボタン付きのお知らせカード。カード上で直接編集でき、ひな形・テンプレート保存・JSONコピーあり。投票・チェックリスト・チケット・クーポンの形式もあり、`/card/?template=<data/templates.json のキー>` でその形式のテンプレートを入れて開く（HOME の「形式を選んでつくる」） |
| `/image/` | 💬👆 文字・手書き（`app.js` 画面・送信、`js/`：`config.js` 決まった値・`draw.js` 描く処理・`apng.js` 動く画像・`history.js` 送った画像・`card.js` 送るメッセージ）。文字入りアイコンと手書きを1枚に重ね、縁取り・背景・動き（APNG）を付けて画像またはカードで送る |
| `/account/` | プラン（無料・有償）と使える機能、有償プランへの支払い（Stripe） |
| `/reply/` | カードの投票・完了のボタンから開き、返事の文を書きかえてから送るかコピーするページ（LIFF で送るカードのボタンはリンクだけなので）。投票は候補もすべて渡し、ここで選び直せる（`?text=`・`title`・`format`・`pick`・`c`）。トークに送る権限（chat_message.write）があればそのトークに、なければ送り先を選んで送る。LINE の中ではコピーするとトークに戻る |
| `server/` | 画像アップロード用 API（Render で動かす Node.js）。無料プランの保存先 |
| `gas/` | プランの判定・有償プランの画像保存（Google ドライブ）・Stripe の知らせの受け取り（GAS のウェブアプリ） |

設定欄（アコーディオン `.ls-fold`）の決まり（全ツールでそろえる）

- 並び：テンプレート → 🎨 見た目（中に「カラー」など）→ その道具だけの設定 → 🔗 リンクボタン → ⚙️ 詳しい設定
- 名前とアイコン：同じ役割は同じ名前。🎨 は「見た目」だけに使う（文字・手書きの背景は 🌈）
- 見出しの右の小さな表示（`.ls-fold-meta`）：空なら「なし」、入っていれば中身の要約（場所名、リンクのドメイン、物の数は「2個」・設定の数は「2件」）
- テンプレートの説明：「選ぶと中身が入れ替わります。今の内容も名前を付けて保存できます。」

全ツールで共通の動き（`shared/`）

| 部品 | 中身 |
|---|---|
| `LineShareLiff.share(messages)`（`shared/liff.js`） | 送り先を選んで送る（複数選べる）。送れたら `true` |
| `LineShareUI.afterSent({ resend })`（`shared/ui.js`） | 送ったあとのシート。「続けて別のトークにも送る」「閉じる」「もう少し作る」。すぐには閉じない |
| `LineShareUI.firstTip(key, steps, before)` | はじめて開いた人にだけ、短い使い方を出す（「わかった」で消え、その端末では二度と出さない） |
| お知らせカードの下書き（`card/js/store.js`） | 編集するたびに少し間をおいて端末に残し、ページが隠れる・閉じるときもすぐ残す。次に開いたら「前回の続きから開きました［新しく作る］」。送ったら消す（送った内容は「前回送った内容」に残る） |
| `LineShareUI.toast(message, { actionLabel, onAction })` | 画面下に数秒だけ出る通知。お知らせカードでは、テンプレート・前回送った内容・入力をぜんぶ消す・カードを消すのあとに、文字・手書きでは、文字を消す・手書きを全部消す・送った画像を履歴から消すのあとに「元に戻す」を出す。消す操作は、聞かずに消してここで「元に戻す」を出すのが基本 |
| `LineShareUI.ask({ title, text, ok, cancel, danger, input })` | ブラウザ標準の `confirm`・`alert`・`prompt` の代わり（LINE の中で標準の窓を出すと、上にドメイン名が出て浮くため）。下から出るシートで聞き、Promise で返す（OK なら `true`。`input` を渡すと入れた文字か `null`）。`cancel: null` でお知らせだけ、`danger: true` で赤いボタン、`readonly: true` でコピー用の欄。Q のツールはどれもこれを使う |
| プレビューへ戻るボタン（`shared/ui.js` が自動で付ける） | 下の設定までスクロールしてプレビューが見えなくなったら右下に「👀 プレビュー」を出す。`.ls-preview` があるページすべて（場所・予定は表示中のタブのプレビューへ） |
| `LineShareUI.progress(label, show)` | 時間のかかる処理（画像の保存）に、経過秒数と、長引いたときの理由を出す |
| `LineSharePlan.warmUp()`（`shared/plan.js`） | 無料の画像サーバー（Render）を、画像を保存するページを開いた時点で起こしておく |
| `LineShareLiff.init()` | LINE とつながらないときは10秒で打ち切り、案内を出す（`reason: "timeout"`） |

サッカー・フットサルの形式（`card/js/soccer.js`）：「⚽ スタメン」（ピッチに選手を配置）と「🏆 試合結果」（スコア・勝敗・前半／後半／延長・PK・得点・MVP。同点で PK があれば PK で勝ち負け）。作るのは別のリポジトリの「さくせん盤」（SAQSEN。https://katsuan.github.io/soccer/）で、`/card/?kind=lineup|match&data=<JSON を base64url>` で渡される。お知らせカードは中身を確かめて（人数・長さ・位置の範囲）、ピッチの図やスコアをカードにして送る。ピッチの線と選手はカードの部品（位置を指定した箱）で描くので（フットサルはゴール前の D 形のエリアと小さめのセンターサークル）、画像のアップロードは要らない。「⚽ さくせん盤で直す」で同じ中身のままさくせん盤に戻る。送ったカードでは、スタメンのピッチをタップすると同じ配置のさくせん盤が、試合結果のところをタップするとさくせん盤が開く（結果の中身は渡さない）。この2つの形式は、渡されたカードのときだけ形式の切り替えに出る

お知らせカードの本体は `card/js/` に役割ごとに分けています（`config` 決まった値と編集中の状態 → `store` 端末に残す → `state` → `url` 送ってよいリンクか → `deck` 複数枚 → `render` 描画 → `kinds` 投票・チェックリスト・チケット・クーポン → `soccer` → `card` 送るカードの組み立て → `photo` → `templates` → `send` 送信 → `events` 操作 → `card/app.js` はじめに動かす）。どれも普通の `<script defer>` で、`card/index.html` に書いた順に読み、同じ範囲の変数（`state`・`els` など）を使います。新しい形式は `kinds.js`（プレビューと Flex の部品）・`config.js` の `KINDS` に足します。

前の名前のファイル（2026-11-25 に消す）：ファイルの並べ方の決まり（`docs/structure.md`）に合わせて名前を変えたので、LINE の中のブラウザが前の HTML を覚えているときのために、前の名前も残しています。`card/js/main.js`・`core.js`・`storage.js`・`flex.js`（新しいファイルと同じ中身。読む順を保つため写しにしている）、`plan/assets/main.js`・`styles.css`（新しいファイルを読むだけ）。

全ページ共通のデザイン（`shared/ui.css`。ほかの Q のツールも使う「Q キット」）、プランと使える機能・画像のアップロード先の振り分け（`shared/plan.js`）、LIFF の準備（`shared/liff.js`。LINE の外で開いたときのログインのしかただけツールごとに選ぶ）、送るカード末尾の「Created by おくるん」（`shared/credit.js`）、アイコンは `shared/` にあります。

### Q キット（Q のツールの共通部品）

**使い心地の決まり**（開いたとき・入力・消す／元に戻す・知らせ・送る・ことば・LINE のボット・ウィジェット）は [docs/ux.md](docs/ux.md)。ここには部品の使い方を書く。

**セキュリティの決まり**は [docs/security.md](docs/security.md)。テストの道具（GAS の偽物・危ない書き方を探すもの・GAS エディタで使う前に動かす確かめ）は [tools/qtest/](tools/qtest/README.md)。

ほかの Q のツール（しょくじ・キロっく・さくせん盤・ロクガ・くじ・くろのす・ひっくり・ぽもくる・ジェンダーリビール・くるかな・食事記録）も、おくるんと同じ部品を使えます。中身は `shared/ui.css`（見た目）と `shared/ui.js`（シート・トースト・はじめての案内など）。見本は `shared/kit.html`（ツールの色を切りかえて見られる。検索には出さない）。

読みこみ方（各ツールの HTML。ツールの CSS より前に読む）：

```html
<link rel="stylesheet" href="https://katsuan.github.io/line-share/shared/ui.css">
<style>
  :root { --ls-accent: #ec8a16; --ls-accent-strong: #c97513; --ls-accent-soft: #fdf1e3; --ls-accent-ink: #995a0e; --ls-font: "M PLUS Rounded 1c", sans-serif; }
</style>
<script src="https://katsuan.github.io/line-share/shared/ui.js" defer></script>
```

色は `:root` に書く（開いた瞬間から色が付く）か、`LineShareUI.setAccent("#ec8a16")`（濃い色・薄い色・文字色を1色から作る）。`<script src=".../ui.js" data-accent="#ec8a16" defer>` でもよい。

**暗い表示（ダークモード）**：`<html lang="ja" data-ls-dark="auto">` を付けたページだけ、スマホが暗い表示のときに暗くなる。背景・カード・文字・線・薄い色（`--ls-*`）は `ui.css` が `!important` で上書きする（背景にはツールの色を少し混ぜる）。ツールの CSS に明るい色を直接書いているところは、同じ `@media (prefers-color-scheme: dark)` の中に `:root[data-ls-dark="auto"] …` で暗いときの色を書く。`<meta name="theme-color">` も `media` で明るい・暗いの2つを置く。LINE のトークの見た目（送る前のプレビュー・カードの見本）や、受け取った人が見るお祝いのページ（くろのす・ジェンダーリビールの表示ページ）は明るいまま。

**日本語の改行**：`ui.css` が、文（`p`・`li` など）に `text-wrap: pretty`、見出し・ラベル・ボタン・1〜2行の説明（`.ls-hint`・`li`・`small`・`.lead`・`.sub`・`.hint`・`.note`）に `word-break: auto-phrase`（文節で折る）を付けて、「〜ま／す。」のような1〜2文字だけの行を防ぐ。長い本文には文節で折る指定を付けない（右がガタガタになって行が増える）。折りたくない短い語は `<span class="ls-nowrap">`。説明は1〜2行に収まる長さにし、スマホの幅（375px と 320px）で確かめる。

**電波がないとき（service worker）**：各ツールのいちばん上に `sw.js`（2行：`self.CONNEQT_TOOL = "<key>"; importScripts("/line-share/shared/sw-core.js");`）を置き、各ページで `navigator.serviceWorker.register("./sw.js")`。中身は `shared/sw-core.js`：同じサイトのファイルはまずネットから取り（新しい版をすぐ出す）、取れない・5秒より遅いときだけ前に保存したものを出す。Google Fonts は保存したものを先に使う。LINE・Firebase・画像サーバーなどほかのサイトには触らない。

| 変数 | 中身 |
|---|---|
| `--ls-accent` / `-strong` / `-soft` / `-ink` | ツールの色・押したときの濃い色・薄い色（選択中のチップなど）・薄い色の上の文字 |
| `--ls-bg` / `--ls-surface` / `--ls-surface-sub` | ページの背景・カード・カードの中の箱 |
| `--ls-text` / `--ls-subtext` / `--ls-faint` / `--ls-line` | 文字・小さな文字・もっと薄い文字・線 |
| `--ls-danger` / `--ls-success` / `--ls-warn` | 消す・うまくいった・気をつけて |
| `--ls-radius-lg` / `-md` / `-sm`、`--ls-tap`（押せる高さ 44px）、`--ls-shadow`、`--ls-font` | 角の丸み・押せる大きさ・影・書体 |
| `--ls-tabs-bg` | 切りかえタブ（`ls-tabs`）の帯の色 |

| 部品（クラス） | 使いどころ |
|---|---|
| `ls-page`・`ls-stack` | ページの幅（560px まで）と、縦に並べる間隔 |
| `ls-brand`・`ls-brand-name`・`ls-brand-icon`・`ls-brand-logo`・`ls-brand-copy` | 見出しの行（アイコン＋名前、右にロゴ、下にひとこと） |
| `ls-panel`・`ls-panel-head`・`ls-panel-title`・`ls-hint` | 白いカードと見出し・説明 |
| `ls-tabs`・`ls-tab`（`aria-selected`） | 切りかえ |
| `ls-chips`・`ls-chip`（`aria-pressed`・`aria-checked`（`role="radio"` のとき）か `is-active`、中に radio・checkbox も可）・`is-small` | 選ぶもの |
| `ls-field`・`ls-label`・`ls-input`・`ls-row` | 入力欄（16px 以上、iPhone で寄らない） |
| `ls-button`（`is-primary`・`is-danger`・`is-block`・`line`＝LINE の緑の送るボタン。カードを送るボタンは `is-oqrn` も付けて、おくるんのマーク＋「カードで送る」（`shared/mark.svg`）。`ls-send line is-oqrn` も可）・`ls-icon-button`・`ls-actions` | ボタン |
| `ls-folds`・`ls-fold`（`<details>`）・`ls-fold-icon`・`ls-fold-meta`・`ls-fold-body` | 開閉する設定 |
| `ls-list`・`ls-list-item`・`ls-list-row` | 一覧から選ぶ |
| `ls-sheet`・`ls-sheet-card`・`ls-sheet-title`・`ls-sheet-actions`・`ls-sheet-cancel` | 下から出るシート（`hidden` で出し入れ） |
| `ls-empty`・`ls-empty-icon` | まだ何もないとき（一言と次にすること） |
| `ls-skeleton` | 読みこみ中の箱（中身と同じ大きさで） |
| `ls-sendbar` ほか | 下に固定する送るボタンの帯（入力中は自動で隠れる） |

| 動き（`window.LineShareUI`） | 中身 |
|---|---|
| `toast(message, { actionLabel, onAction, ms })` | 下に数秒出る知らせ。「元に戻す」などのボタンも付けられる |
| `firstTip(key, steps, before)` | はじめて開いた人にだけ、短い使い方 |
| `afterSent({ resend })` | 送ったあとのシート |
| `progress(label, show)` | 時間のかかる処理の経過秒数 |
| `setAccent(hex)` | ツールの色を変える |
| `PALETTE`・`paletteFromColor(hex)` | おくるんの色の並び・1色から薄い色などを作る |

クラス名と変数名は、読んでいるツールがあるので変えない（足すのはよい）。おくるん専用の部品（送信プレビュー・カードの大きさ・Created by）は、ほかのツールでは使わなくてよい。

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
- `gasWebAppUrl`: `gas/` をデプロイしたウェブアプリの URL（プランの判定・有償プランの画像の保存先）
- `premiumUsers`: 有償プランの LINE ユーザー（ユーザーIDの SHA-256）。GAS がプランを答えられないときだけ使う予備の一覧（正本は GAS のプランの一覧）
- `premiumCheckoutUrl`: 有償プランの支払いリンク（Stripe Payment Link）。空なら `/account/` に「準備中」と出す
- `billingPortalUrl`: お支払いの確認・解約のリンク（Stripe カスタマーポータル）。空ならボタンを出さない
- `showCredit`: 送るカードに「Created by おくるん」を付けるか（`false` で全員から消える）
- `creditFreeUsers`: Created by を出さない LINE ユーザー（ユーザーIDの SHA-256）。`https://liff.line.me/<LIFF ID>/?credit=whoami` を LINE で開くと自分の値が表示される
- `ownerUsers`: 作成者（ユーザーIDの SHA-256。値の確かめ方は上と同じ）。トップの「📤 紹介する」に「🗂 全ツールのカードを送る」が出て、おくるんとほかのツール（`data/hub-links.json` の `ogp` があるもの）の紹介カードを送れる。ツールが12個までは、全ツールを横に並べて1通（カルーセル。おくるんの紹介も入るときは先頭に、入らないときは1通目に別で）。12個をこえたら、おくるんの紹介（1通目）と、グループ（`groups`）ごとに横に並べて1通ずつ（カルーセル）送れる。グループのツールが12より少ないうちは、先頭にグループの説明のカード（`groups` の `desc` と、ツールの一覧）。12以上になったら説明はやめて12枚ずつに分ける。1回で送れるのは5通まで（こえるときは、おくるんの紹介をやめる）

### Created by を自分だけ消す

- その端末だけ: URL に `?credit=off` を付けて一度開く（`?credit=on` で戻る）
- LINE アカウント単位: `?credit=whoami` で表示された値を `creditFreeUsers` に追加する（機種変更しても有効）
- 有償プラン（`hideCredit` が使えるプラン）の人は、プランが決まると自動で消せるようになります（`shared/plan.js` が知らせる）
- 消せる人の送信バーには「Created by を付ける」スイッチが出て、送るごとに選べます

### LIFF

1. LINE Developers で LIFF アプリを1つ作る（Scope: `profile` / `chat_message.write`、Share Target Picker を有効化）
2. エンドポイント URL に `https://katsuan.github.io/line-share/` を設定する
3. 各ツールは `https://liff.line.me/<LIFF ID>/plan/` のようにパスを付けて開く。トップページが `liff.state` を受けて各ツールへ転送する

ブラウザ版で開いたとき（使い心地の決まり `docs/ux.md` の B6）：お知らせカード（`/card/`）と返事（`/reply/`）は、送るボタンの上に「🔑 ログインして送る」「📱 LINE 版で開く」を出す（`LineShareLiff.outsideHelp`）。場所・予定（`/plan/`）と文字・手書き（`/image/`）は決まりと違い、開いたときにそのまま LINE のログインへ移る。手書きは端末に残さないので、描いたあとにログインで行き来すると消えてしまうのと、画像の保存先（プラン）をログインで決めるため

### Google Maps（任意）

Google Cloud で Maps JavaScript API と Places API (New) を有効にし、API キーを「HTTP リファラー」で `https://katsuan.github.io/*` に制限して `googleMapsApiKey` に設定します。
未設定のときは、Google Maps の共有 URL を貼って場所名を手入力する方式になります。

### 画像アップロード（server/）

LINE の画像メッセージには HTTPS で公開された画像 URL が必要なため、`server/` を Render などにデプロイします。

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- 環境変数: `ALLOWED_ORIGIN=https://katsuan.github.io`（省略時もこれ）、`PUBLIC_BASE_URL=https://<サービス名>.onrender.com`、`UPLOADS_PER_MINUTE`（1つの接続元から1分に受ける数。省略時 20）
- 受け付けるのは `ALLOWED_ORIGIN` のページからの、中身が PNG・JPEG の画像（5MB まで）だけ
- 手元のテスト：`cd server && npm test`

Render のローカルディスクは永続ではないため、保存した画像は再起動（無料プランでは15分アクセスがないとスリープ）で消えます。受け取った人がすぐに開かないと画像が表示されないことがあるため、文字・手書きのプレビューの下と、お知らせカードの写真（端末から選んだとき）に注意書きを出しています。

### プランと課金（shared/plan.js・gas/・/account/）

プラン（無料・有償）と、プランごとに使える機能は `shared/plan.js` の `PLANS` で決めます。各ページは「その機能を使えるか」（`LineSharePlan.has("longImageStorage")` など）で判定します。

| 機能 | 無料 | 有償 |
|---|---|---|
| `longImageStorage` 画像を長く保存（Google ドライブ。無料は Render でスリープすると消える） | — | ✓ |
| `hideCredit` 送るカードの「Created by おくるん」を消せる | — | ✓ |

機能を足すときは `shared/plan.js` の `PLANS`・`FEATURE_LABELS` と、`gas/Code.js` の `PLANS` をそろえます。

**予定（まだ無い機能）**：`hideToolLink`（送るカードからさくせん盤へのリンクを外す）。リンクを付けるかどうかは `card/js/soccer.js` の `soccerToolAction()` だけで決めているので、`PLANS` に足してカードの設定（`state.hideToolLink`）を作れば、リンクと「タップすると…」の案内がまとめて消える。

**プランの決め方**：ページが GAS に `{ action: "me", accessToken }` で聞き、GAS が LINE のアクセストークンで本人を確かめてから、プランの一覧で判定します（結果はそのタブに10分覚える）。GAS が答えられないとき（未設定・古い版）は `config.js` の `premiumUsers` で判定します。画像の保存など実際の権限は、GAS がその都度確かめ直します。

**役割**

| 役割 | すること |
|---|---|
| システム管理者 | `gas/` のデプロイ、Script Properties（Stripe の鍵など）、`config.js` |
| ツール管理者 | プランの一覧（スプレッドシート「おくるん プランの一覧」のシート `plans`）で、誰をどのプランに・いつまで |
| ユーザー | `/account/` で自分のプランと使える機能を見る、Stripe で支払う |

プランの一覧の列：`userHash`（LINE ユーザーIDの SHA-256）・`plan`（`free`／`premium`）・`source`（`manual`／`stripe`）・`expiresAt`（空ならずっと。過ぎたら無料）・`stripeCustomerId`・`stripeSubscriptionId`・`note`・`updatedAt`。手で有償にするときは行を足します（`source` は `manual`）。シートを作る前からの Script Properties の `PREMIUM_USERS` も引き続き有効です。

**GAS の用意**

1. `cd gas && clasp push -f`（`.clasp.json` は git に含めない）
2. Apps Script エディタで `setup` を実行して権限を許可する。保存先フォルダ「おくるカード画像」、プランの一覧のスプレッドシート、毎日の掃除（`cleanupOldImages`）ができる（何度実行してもよい）
3. プロジェクトの設定 → スクリプト プロパティで値を確かめる
   - `PLANS_SHEET_ID`: プランの一覧（setup が作る）
   - `PREMIUM_USERS`: シートを使う前からの有償ユーザー（カンマか改行区切り）
   - `KEEP_DAYS`: 画像を残す日数（初期値 30）
   - `LINE_CHANNEL_ID`: LIFF アプリの LINE ログインチャネル ID
   - `DRIVE_FOLDER_ID`: 保存先フォルダ（setup が作る）
   - `STRIPE_SECRET_KEY`: Stripe の秘密鍵（Events を読めれば足りる制限付きキーがよい）。空なら Stripe の知らせは受けない
4. コードを変えたら `clasp push -f` のあと、デプロイを管理 → 既存のデプロイを編集して新しいバージョンにする（URL を変えないため）
5. 使う前の確かめ：エディタで `qCheckAll`（`selfcheck.gs`）を実行し、実行ログを見る（何も書きこまない）。何を確かめるかは `Code.js` の終わりの `Q_SELF_CHECK`
6. 手元のテスト：`node --test gas/test/`（本番のシート・LINE・Stripe には触らない）

**利用状況とエラーの記録（shared/log.js・gas/ の action: "log"）**

- 記録するのは「開いた（open）」「送った（send：道具・形式・枚数）」「エラー（error：内容と場所）」だけ。LINE のユーザーIDなど個人がわかるものは送らない。`session` はそのタブの間だけの番号
- ページは10件ためるか、ページが隠れる・閉じるときに sendBeacon でまとめて送る（1ページ40件まで。同じエラーは1回だけ）。`config.js` の `logging: false` で止まる
- GAS はスプレッドシート「おくるん 利用状況」（`LOG_SHEET_ID`。setup が作る）のシート `events` に1行ずつ書く
- 流入口（`from`）：タブで最初に開いたページで決め、以後は引き継ぐ。リンクの目印（HOME の入口＝`home`、送ったカードの「Created by」＝`credit`、記念日・カウントダウン＝`countdown`、ジェンダーリビール＝`gender-reveal`）→ 直前のサイト → `direct` の順。`from` はカードの中身のパラメータとしては読まない
- 足跡：開くたびに `step`（そのタブで何ページ目か）と `prev`（直前のページ）を付ける。LINE で開いたときの HOME 経由の中継（`liff.state`）は数えない
- 毎日4時台（`rollupLogs`）：前日までの記録を、日・道具・種類・形式・流入口ごとの件数（`daily`：events・sessions・LINE の中で開いた数・from）と、ページの移り方の回数（`paths`：date・from・prev → tool・count。prev が空ならそのタブの入口）にまとめ、`LOG_KEEP_DAYS`（初期値30日）より古い `events` の行を消す。`daily`・`paths` は消さない

**Stripe（有償プランの支払い）**

1. Stripe で有償プランの商品（サブスクリプション）と支払いリンク（Payment Link）を作り、URL を `config.js` の `premiumCheckoutUrl` に入れる。`/account/` の「有償プランにする」が、`?client_reference_id=<ユーザーのハッシュ>` を付けて開く
2. カスタマーポータルのリンクを `billingPortalUrl` に入れると、有償の人に「お支払いの確認・解約」が出る
3. Webhook の送り先に GAS のウェブアプリの URL を登録し、`checkout.session.completed` と `customer.subscription.deleted`（あとで払う支払い方法を使うなら `checkout.session.async_payment_succeeded` も）を送るようにする
   - 支払いが済むと、その人の行が `premium`（`source`＝`stripe`）になる。解約（期間の終わり）で `free` に戻る
   - GAS はリクエストのヘッダーを読めず Stripe の署名を確かめられないので、届いたイベント ID で Stripe からイベントを取り直して処理する（偽の知らせは取り直せない。4日より古いイベントは使わない）
   - 注意：GAS のウェブアプリは POST に 302 で答えるため、Stripe の管理画面では送信が失敗に見え、再送されることがある（処理は1回目で済み、同じ内容を書き直すだけ）。続けて失敗扱いになると Stripe が送信を止めるので、本番では `server/`（Render）など 200 を返せる所で受けて GAS に渡す形に替える

## 公開するとき

LINE アプリ内のブラウザが古いプログラムを持ち続けないよう、公開前に読み込むファイルの版を付け直します。

```bash
python3 tools/stamp.py
```

`?v=<日時>` が HTML の `<script>`・`<link>` と JS の import 先にまとめて付きます（同じモジュールは全ファイルで同じ版にそろえる必要があるため、必ずこのスクリプトで一括で付けます）。

## JSON で管理している中身（data/）

コードを変えずに書き換えられます。読み込めないときや空のときは、その欄やテンプレートが出ないだけで、ツールは使えます。

| ファイル | 中身 |
|---|---|
| `data/line-emoji.json` | トップの「LINE絵文字」。`title`・`lead`、`items`（`id`＝LINE STORE の URL の `product/` のあと、`name`、`desc`）、`author`（`id`＝`author/` のあと、`name`）。リンクと画像は ID から作る（`url`・`image` を書くとそちらを使う） |
| `data/hub-links.json` | トップの「コネクト 〜ConneQt〜」（Connect＋Q。Q のツールをつなぐ仕組みの名前。前は「ほかのツール」「Qるっと」）と、補足の1行（`lead`：「｜Qらし《くらし》を、ひとつなぎ」。｜と《》で囲んだところはルビになる）。各ツールの紹介の窓口の下に並ぶアイコンの欄も同じ名前。`title`、`items`（`icon`・`name`・`desc`・`url`。`appIcon` にツールのアイコン画像の URL を入れると絵文字の代わりに出す。読めないときは `icon`。`en` に英字の名前を入れると、名前の右に「さくせん盤 〜SAQSEN〜」のように小さく添える。`ogp` は共有画像。`ogp` があるツールはタップするとまず画像と説明のカード（「○○を開く」）を出す。紹介カードの写真にも使う、`copy` はキャッチコピーで、画像のカードの名前の下と紹介カードの見出しに出す。`key`・`color`・`lead`・`intro` は下の紹介の窓口が使う）。`groups`（`key`・`label`）と各ツールの `group` で、トップの一覧を「⚽ スポーツ・からだ」などに分けて小さな見出しを入れる。`also`（部の key の配列）は兼部で、その部にも並べる（キロっく＝たいいく部とけいぞく部。`group` は元の部のまま）。`next`（`{ key, why }`）は、そのツールの紹介の窓口の上に出す「つぎにおすすめ」（使う流れでつながるツールを1つだけ）。`short` はアイコンの欄に出す短い名前（長い名前のツールだけ） |
| `shared/oqrn.js` | ほかのツール（さくせん盤・くろのす・ジェンダーリビール・くじ）から、おくるんのお知らせカードを開く入口。LIFF ID とカードの URL はここ1か所（config.js の liffId と同じ値）。`OQRN.cardUrl({ … })` で中身を入れたカードの URL を作る。各ツールは自分の script より前に `<script src="https://katsuan.github.io/line-share/shared/oqrn.js">` で読む |
| `shared/season.js` | 季節の絵文字。`<script src="https://katsuan.github.io/line-share/shared/season.js">` で読み、`QSeason.decorate(文)`（ときどき文の後ろに「 🎃」。ふだん3割・イベントの時期6割・当日9割）・`QSeason.maybe()`（出すときだけ絵文字、出さないときは空）・`QSeason.pick()`（必ず1つ）。日付は日本時間。うれしい瞬間の短い文にだけ使い、エラー・ボタン・送るカードの中身には付けない。`tool-share.js` を読んでいるツールは自動で読まれる。GAS には `season.gs` として写す（KazoQ・食事記録・LOgBOT・勉強クイズくん・くるかな。変えたら写しも直す） |
| `shared/week-start.js` | カレンダーの週のはじまり（1＝月曜・既定、0＝日曜）を、端末ごとに1つの共通設定にする（localStorage の `qlove:weekStart`）。1つのツールで日曜にすると、同じ katsuan.github.io のほかのツールも日曜で開く。自分の script より前に `<script src="https://katsuan.github.io/line-share/shared/week-start.js">` で読み、`QWeekStart.get(ツールの前からの値)`・`QWeekStart.set(値)`。読めないときに備え、`window.QWeekStart` がなくても動くようにする。使っているのはくるかな・つづく・BabyQ（キロっくは月曜で固定） |
| `shared/qlove-bot.js` | くらぶボット（仮。`katsuan/qlove-bot`、使う人がそれぞれ配布用シートをコピーして持つ LINE ボット）の受け口の URL を、端末ごとに1つだけ残す（localStorage の `qlove:bot`）。1つのツールで入れれば、同じ katsuan.github.io のほかのツールも読める（LINE の中とブラウザは別の保存場所なので、それぞれで入れる）。残すのは GAS の `…/exec` の URL だけ（合言葉・ID トークンは残さない）。`QloveBotLink.get()`・`set(text)`・`clear()`・`call(tool, action, payload)`（text/plain の JSON で送る）・`ping(url)`。つづく・しょくじは `botlink.js` の `target` から使う（自分で入れたつなぎ先がないとき、くらぶボットにそのツールの機能があれば、そちらにつなぐ） |
| `shared/botlink.js` | ボットとつなぐ（LINE 版のツールを、使う人の自分のボットにつなぐ共通の部品。`window.QBotLink`）。つづく（記録ボット）・しょくじ（食事記録ボット）が使う。自分の script より前に `qlove-bot.js` と `<script src="https://katsuan.github.io/line-share/shared/botlink.js?v=…" defer>` で読む。中身：`cleanUrl(text)`（GAS の `…/exec` だけ）・`inLineApp()`・`target({ own, tool })`（つなぎ先：ツールに入れた URL が先。なければ くらぶボット（`qlove:bot`）に聞いて、そのツールの機能があるときだけ）・`start({ liffId, url, tool, legacyApp, mapError })`（LINE 版でログインしていれば送る口 `client.call(action, payload, { keepalive })`。ID トークンを付けて text/plain で送る）・`outbox(key)`（送れなかったものを覚えて、次に開いたときに送りなおす箱。ID トークンは入れない）・`reopenHidden()`（「LINE 版で開きなおす」を出すか）・`guide({ key, openUrl, say, closedText })`（ブラウザ版の「📱 LINE 版で使う」の案内と4コマ。ページに `#lineGuidePanel`・`#lineOutside`・`[data-close-line-guide]`・`[data-show-line-guide]`）。送る形はくらぶボットの `{ app: "qlove", v: 1, tool, action, liffId, idToken, … }`。すでに配った記録ボットのコピーに送るときだけ `legacyApp` で前の形（`app: "tuzuq"`・`op`）も入れる。ツールごとの違い（送る中身・ボットの言葉の読みかえ）は各ツールの `js/linelog.js` に。テストは `shared/test/botlink.test.js`（つづく・しょくじのテストもこの部品を読む） |
| `shared/tool-share.js` | ほかのツールに置く「📤 ○○を紹介する」の窓口。`<script src="https://katsuan.github.io/line-share/shared/tool-share.js" data-tool="<key>" defer>` と `<div data-tool-share></div>`（置き場所。なければページの最後）で使う。押すとシートで「LINE にカードで送る（おくるん）」か「リンクでシェア」を選べる。カードはお知らせカード（`/card/`）に、`data/hub-links.json` の同じ `key` の中身（名前・英字・ツールの色・OGP 画像・説明・URL）を渡して作る。流入口は `from=<key>-intro`。上に「つぎにおすすめ」（`next` があるツールだけ）、アイコンの欄（名前つき）の下に「💾 この端末の記録をバックアップ」（`/backup/?from=<key>`）。開くたびに「最近使ったツール」（localStorage の `conneqt:recent`）を覚え、トップの「最近つかった」に3つまで出す。`navigator.storage.persist()` で、ブラウザが記録を勝手に消さないようにもお願いする |
| `backup/` | 記録のバックアップ。ConneQt のツールが katsuan.github.io の localStorage に残した記録（名前の頭が `line-share:`・`soccer:`・`kiloq:` など、`backup/app.js` の `OWNERS` にあるものだけ。LINE のログイン情報は入れない）を1つのファイル（`conneqt-年月日.json`）か文字にまとめて保存し、ファイルを選ぶか文字を貼ると戻す（戻す前に確かめる）。写真・動画・手書きの画像（IndexedDB）は入らない。新しいツールが記録を残すなら `OWNERS` に名前の頭を足す |
| `data/templates.json` | テンプレートと候補。`card`＝お知らせカードのテンプレート（`key`・`label`・`icon`・`description`・`status`・`state`。`"{top}"` はおくるんのトップの URL に置き換わる）、`place.presets`＝場所のテンプレート、`place.badges`＝バッジの候補、`text`＝文字・手書きの「よく使う文字」 |

`data/line-emoji.json` を書き換えたら、公開前に `python3 tools/check_emoji.py` で各 ID の LINE STORE のページがあるか（とストア上の名前）を確かめる。トップでは代表画像が取れない絵文字の行に代わりのアイコン（😀、`fallbackIcon` で変更可）を出す。

## ロゴ・アイコン・OGP 画像

サービス名は「おくるん」、ロゴは「OQRN」（Q はふきだし。一筆でくるんと回り、書き始めが矢じり、終わりがしっぽ）。色は紫（`--ls-accent: #6c47ff`）。

```bash
python3 tools/brand.py   # shared/icon.svg・logo.svg・icon-512.png・apple-touch-icon.png
python3 tools/ogp.py     # shared/ogp.png（リンク共有時の画像・お知らせカードの「紹介」の写真）
```

macOS のヒラギノ角ゴシック、ロゴの字形に Jua（SIL Open Font License 1.1。`~/Library/Fonts/Jua.ttf`）、Pillow・fontTools を使います。

`tools/qstamp.py` は、Q のツール（キロっく・くじ・ひっくり・ぽもくるなど）が公開する前に通す共通のスクリプト。読み込む JS・CSS（モジュールの import と CSS の @import も）に `?v=<UTC の年月日時分>` を付け直し、LINE の中のブラウザに古いファイルが残って画面が真っ白になるのを防ぐ。各ツールのフォルダで `python3 ../q-oqrn/tools/qstamp.py index.html` のように使う（おくるん自身は `tools/stamp.py`）。

`tools/brandkit.py` は、Q のツール（ぽもくる・くろのす・ジェンダーリビール・ひっくり・くじ）のアイコン・ロゴ・OGP を描く共通のスクリプト。各ツールの `tools/icon.py` が、となり（`~/GitHub/q-oqrn`。ローカルのフォルダ名）のこのファイルを読む（`tools/brandkit_path.py`）。直すのはここだけでよい。

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
