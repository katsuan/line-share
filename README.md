# おくるん（OQRN）

場所・予定・お知らせ・文字・手書きを、LINE のトークにカードや画像で送れる LIFF ツール集です。
GitHub Pages で配信する静的サイトです。GAS（`gas/`）はプランの判定と有償プランの画像保存だけに使います。

公開URL: https://katsuan.github.io/line-share/

## ツール

| パス | 内容 |
|---|---|
| `/` | ツール一覧（おくるん） |
| `/plan/` | 📍🗓️ 場所・予定。Google Maps の場所を写真・バッジ・コメント付きで送る。場所から「この場所で予定を作る」で Google カレンダー登録リンク付きの予定カードにできる |
| `/card/` | 🪧 お知らせカード。見出し・写真・バッジ・リンクボタン付きのお知らせカード。カード上で直接編集でき、ひな形・テンプレート保存・JSONコピーあり。投票・チェックリスト・チケット・クーポンの形式もあり、`/card/?template=<data/templates.json のキー>` でその形式のテンプレートを入れて開く（HOME の「形式を選んでつくる」） |
| `/image/` | 💬👆 文字・手書き。文字入りアイコンと手書きを1枚に重ね、縁取り・背景・動き（APNG）を付けて画像またはカードで送る |
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
| お知らせカードの下書き（`card/js/storage.js`） | 編集するたびに少し間をおいて端末に残し、ページが隠れる・閉じるときもすぐ残す。次に開いたら「前回の続きから開きました［新しく作る］」。送ったら消す（送った内容は「前回送った内容」に残る） |
| `LineShareUI.toast(message, { actionLabel, onAction })` | 画面下に数秒だけ出る通知。お知らせカードでは、テンプレート・前回送った内容・リセットのあとに「元に戻す」を出す |
| プレビューへ戻るボタン（`shared/ui.js` が自動で付ける） | 下の設定までスクロールしてプレビューが見えなくなったら右下に「👀 プレビュー」を出す。`.ls-preview` があるページすべて（場所・予定は表示中のタブのプレビューへ） |
| `LineShareUI.progress(label, show)` | 時間のかかる処理（画像の保存）に、経過秒数と、長引いたときの理由を出す |
| `LineSharePlan.warmUp()`（`shared/plan.js`） | 無料の画像サーバー（Render）を、画像を保存するページを開いた時点で起こしておく |
| `LineShareLiff.init()` | LINE とつながらないときは10秒で打ち切り、案内を出す（`reason: "timeout"`） |

サッカー・フットサルの形式（`card/js/soccer.js`）：「⚽ スタメン」（ピッチに選手を配置）と「🏆 試合結果」（スコア・勝敗・前半／後半／延長・PK・得点・MVP。同点で PK があれば PK で勝ち負け）。作るのは別のリポジトリの「さくせん盤」（SAQSEN。https://katsuan.github.io/soccer/）で、`/card/?kind=lineup|match&data=<JSON を base64url>` で渡される。お知らせカードは中身を確かめて（人数・長さ・位置の範囲）、ピッチの図やスコアをカードにして送る。ピッチの線と選手はカードの部品（位置を指定した箱）で描くので（フットサルはゴール前の D 形のエリアと小さめのセンターサークル）、画像のアップロードは要らない。「⚽ さくせん盤で直す」で同じ中身のままさくせん盤に戻る。送ったカードでは、スタメンのピッチをタップすると同じ配置のさくせん盤が、試合結果のところをタップするとさくせん盤が開く（結果の中身は渡さない）。この2つの形式は、渡されたカードのときだけ形式の切り替えに出る

お知らせカードの本体は `card/js/` に役割ごとに分けています（`core` 定数と状態 → `storage` → `state` → `url` → `deck` 複数枚 → `render` 描画 → `kinds` 投票・チェックリスト・チケット・クーポン → `flex` 送るカードの組み立て → `photo` → `templates` → `send` 送信 → `events` 操作 → `main` はじめに動かす）。どれも普通の `<script defer>` で、`card/index.html` に書いた順に読み、同じ範囲の変数（`state`・`els` など）を使います。新しい形式は `kinds.js`（プレビューと Flex の部品）・`core.js` の `KINDS` に足します。

全ページ共通のデザイン（`shared/ui.css`）、プランと使える機能・画像のアップロード先の振り分け（`shared/plan.js`）、LIFF の準備（`shared/liff.js`。LINE の外で開いたときのログインのしかただけツールごとに選ぶ）、送るカード末尾の「Created by おくるん」（`shared/credit.js`）、アイコンは `shared/` にあります。

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

### Created by を自分だけ消す

- その端末だけ: URL に `?credit=off` を付けて一度開く（`?credit=on` で戻る）
- LINE アカウント単位: `?credit=whoami` で表示された値を `creditFreeUsers` に追加する（機種変更しても有効）
- 有償プラン（`hideCredit` が使えるプラン）の人は、プランが決まると自動で消せるようになります（`shared/plan.js` が知らせる）
- 消せる人の送信バーには「Created by を付ける」スイッチが出て、送るごとに選べます

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
3. Webhook の送り先に GAS のウェブアプリの URL を登録し、`checkout.session.completed` と `customer.subscription.deleted` を送るようにする
   - 支払いが済むと、その人の行が `premium`（`source`＝`stripe`）になる。解約（期間の終わり）で `free` に戻る
   - GAS はリクエストのヘッダーを読めず Stripe の署名を確かめられないので、届いたイベント ID で Stripe からイベントを取り直して処理する（偽の知らせは取り直せない）
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
| `data/hub-links.json` | トップの「ほかのツール」。`title`、`items`（`icon`・`name`・`desc`・`url`。`appIcon` にツールのアイコン画像の URL を入れると絵文字の代わりに出す。読めないときは `icon`。`en` に英字の名前を入れると、名前の右に「さくせん盤 〜SAQSEN〜」のように小さく添える） |
| `data/templates.json` | テンプレートと候補。`card`＝お知らせカードのテンプレート（`key`・`label`・`icon`・`description`・`status`・`state`。`"{top}"` はおくるんのトップの URL に置き換わる）、`place.presets`＝場所のテンプレート、`place.badges`＝バッジの候補、`text`＝文字・手書きの「よく使う文字」 |

`data/line-emoji.json` を書き換えたら、公開前に `python3 tools/check_emoji.py` で各 ID の LINE STORE のページがあるか（とストア上の名前）を確かめる。トップでは代表画像が取れない絵文字の行に代わりのアイコン（😀、`fallbackIcon` で変更可）を出す。

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
