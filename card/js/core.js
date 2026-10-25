// 前の名前（2026-11-25 に消す）。LINE の中のブラウザが前の HTML を覚えているときのため、card/js/config.js と同じ中身を置いている（読む順を保つため写し）
// お知らせカード：決まった値（形式・色・大きさの上限など）と、編集中の状態。
// 本体は card/js/ に役割ごとに分けてある（読み込み順は card/index.html）。このファイルは定数・設定・編集中の状態。
const config = window.LINE_SHARE_CONFIG || {};

const LAST_SENT_KEY = "flexshare:lastSentState";
const SEND_WARNING_DISMISSED_KEY = "flexshare:sendWarningDismissed";
const TEMPLATE_KEY = "line-share:card-templates";
// 編集中の下書き（送る前に閉じても、次に開いたら続きから）。送ったら消す
const DRAFT_KEY = "line-share:card-draft";

// クエリから渡されたリンクは、ここにあるドメイン以外は送信時に外す
const ALLOWED_ACTION_HOSTS = ["katsuan.github.io"];
// liff.line.me は、自分たちの LIFF アプリ（おくるん・config.js の trustedLiffIds）だけ通す（ほかの人の LIFF は通さない）
const ALLOWED_LIFF_IDS = [config.liffId, ...(Array.isArray(config.trustedLiffIds) ? config.trustedLiffIds : [])].filter(Boolean);
const ACTION_PROTOCOLS = ["https:", "http:", "line:", "tel:", "mailto:"];

// LINE Flex Message の bubble.size（小さい順）。指定しないときの LINE の標準は mega
const BUBBLE_SIZES = ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"];
const MAX_BADGES = 5;
const MAX_BUTTONS = 3;
// 横スクロール（カルーセル）で送れるカードの枚数。LINE の上限（12枚）まで
const MAX_CARDS = 12;
// カードの種類。投票は候補をボタンで、チェックリストは項目を □ 付きで並べる
// title は画面の見出し（編集中のカードの種類に合わせて変える）
const KINDS = {
  notice: { label: "📣 お知らせ", title: "お知らせカード" },
  vote: { label: "🗳️ 投票", title: "投票カード", item: "候補", min: 2, max: 10, list: true },
  checklist: { label: "✅ チェックリスト", title: "チェックリスト", item: "項目", min: 1, max: 20, list: true },
  ticket: { label: "🎫 チケット", title: "チケット" },
  coupon: { label: "🎟️ クーポン", title: "クーポン" },
  // さくせん盤（別のツール）から渡されたときだけ使う形式。形式の切り替えには、その形式のカードのときだけ出す
  lineup: { label: "⚽ スタメン", title: "スタメン", external: true },
  match: { label: "🏆 試合結果", title: "試合結果", external: true }
};
// HOME の「カードの形式」から ?template=<テンプレートのキー> で開いたとき、読み込んだら当てはめる
const START_TEMPLATE = new URLSearchParams(location.search).get("template") || "";
// チケットの「項目名＋値」（便名・ゲート・座席など）の数
const MAX_PAIRS = 6;
// チケット・クーポンの端の欠け丸の色。LINE のトーク背景に近い色（プレビューの --ls-talk-bg と同じ）
const NOTCH_COLOR = "#8FABD3";
const DEFAULT_DONE_LABEL = "✅ 準備できた";
const DEFAULT_CUSTOM_COLOR = "#f59e0b";

// 色の並びは全ツール共通（shared/ui.js の PALETTE。先頭はおくるんの紫）。最後に「ほかの色」
const THEMES = {
  ...Object.fromEntries(
    window.LineShareUI.PALETTE.map((color) => [
      color.key,
      { label: color.label, start: color.start, end: color.end, detailBg: color.soft, detailText: color.ink }
    ])
  ),
  custom: { label: "カスタム" }
};

// おくるんのトップ（LINE で開くとツール一覧）。紹介テンプレートのリンク先
const TOP_URL = config.liffId ? `https://liff.line.me/${config.liffId}` : "https://katsuan.github.io/line-share/";

// 用意済みのテンプレート。中身は data/templates.json の card（開いたあとに読み込む）。
// "{top}" はおくるんのトップの URL に置き換える
let PRESETS = {};
// リンクのパラメータでカードの中身を渡されて開いたか（そのときは ?template= を当てはめない）
let startedWithQuery = false;

// 写真の形。auto は写真そのものの縦横比（読み込んだときに imageRatio に入れる）
const IMAGE_SHAPES = { auto: "", wide: "20:13", square: "1:1", tall: "3:4" };
// LINE の hero 画像は「縦が横の3倍まで」
const MAX_TALL_RATIO = 3;

const BLANK_STATE = {
  theme: "purple",
  customColor: DEFAULT_CUSTOM_COLOR,
  bubbleSize: "mega",
  headerTitle: "",
  date: "",
  title: "",
  detail: "",
  showDate: true,
  showDetail: true,
  imageUrl: "",
  imageActionUrl: "",
  imageShape: "auto",
  imageFit: "cover",
  imageRatio: "",
  badges: [],
  buttons: [],
  kind: "notice",
  // 投票の候補・チェックリストの項目
  items: [],
  // チェックリストの最後のボタンの文言
  doneLabel: DEFAULT_DONE_LABEL,
  // チケット：出発・到着（大きく）とその下の小さな文字、ミシン目の下の「項目名＋値」
  route: { from: "", fromSub: "", to: "", toSub: "" },
  pairs: [],
  // クーポン：特典（大きく）、コード、有効期限
  coupon: { offer: "", code: "", expiry: "" },
  lineup: null,
  match: null
};

const els = {};
let state = structuredClone(BLANK_STATE);
// 送るカードの並び。編集しているのは cards[current] で、編集中はそれを state として扱う
let cards = [state];
let current = 0;
// クエリ由来のURL（許可ドメイン以外は送信しない）
const queryUrls = new Set();
let hasTriedShare = false;
// 端末から選んだ写真のアップロード状態（アップロード中は手元の画像でプレビューする）
const photo = { uploading: false, localUrl: "" };
let shareReady = false;
