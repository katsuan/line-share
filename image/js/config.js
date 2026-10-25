// 文字・手書き：決まった値（形・書体・色・太さ・縁取り・カードの大きさ）と、はじめの設定。image/app.js・draw.js・card.js が読む。
// 色の並びは全ツール共通（shared/ui.js の PALETTE：紫・青・緑・橙・赤）。ui.js は app.js より先に読まれる
export const LONG_SIDE = 480; // 静止画の長い辺
export const ANIMATION_LONG_SIDE = 240; // 動く画像は 300KB に収めるため小さめに作る
export const BASE = 480; // 太さなどの数値は「短い辺 = 480px」を基準にした px
export const EDGE_MARGIN = 10;
export const PREFS_KEY = "line-share:image-prefs";

// 画像の形（横:縦）
export const SHAPES = [
  { label: "正方形", value: "1:1" },
  { label: "横長", value: "4:3" },
  { label: "ワイド", value: "16:9" },
  { label: "縦長", value: "3:4" }
];

export const FONTS = [
  { label: "ゴシック", value: "'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  { label: "丸ゴシック", value: "'Hiragino Maru Gothic ProN', 'M PLUS Rounded 1c', 'Hiragino Sans', sans-serif" },
  { label: "明朝", value: "'Hiragino Mincho ProN', 'Yu Mincho', serif" },
  { label: "英字太め", value: "'Arial Black', 'Hiragino Sans', sans-serif" },
  // 手書き風（Google Fonts、SIL OFL）。太さが1種類なので weight を合わせる（太字にすると字がつぶれる）
  { label: "手書き風", value: "'Yomogi', 'Hiragino Maru Gothic ProN', sans-serif", weight: 400, webFont: "Yomogi" },
  { label: "ペン字風", value: "'Klee One', 'Hiragino Mincho ProN', serif", weight: 600, webFont: "Klee One" }
];

// 色は2行に分ける。1行目は基本の色（黒・白など）、2行目は全ツール共通の並びで、最後に「ほかの色」
export const BLACK = "#18222f";
export const WHITE = "#ffffff";
export const HUES = window.LineShareUI.PALETTE.map((color) => color.solid.toLowerCase());
export const BASIC_COLORS = [BLACK, WHITE];

// スライダーで選べる太さの範囲（3段階のボタンはこの中のよく使う値）
export const PEN_SIZE_MIN = 2;
export const PEN_SIZE_MAX = 40;
export const PEN_SIZES = [
  { label: "細い", value: 6 },
  { label: "ふつう", value: 12 },
  { label: "太い", value: 22 }
];

export const OUTLINES = [
  { label: "なし", value: "none" },
  { label: "白", value: "white" },
  { label: "黒", value: "black" },
  { label: "白黒", value: "double" }
];
// 「ほかの色」で選べる縁の色（一重の縁取りになる）
export const OUTLINE_COLORS = HUES;
export const OUTLINE_WIDTHS = [
  { label: "細い", value: 4 },
  { label: "ふつう", value: 7 },
  { label: "太い", value: 11 }
];

// LINE のカード（bubble）の大きさ。小さい順
export const BUBBLE_SIZES = ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"];

// 背景は 1行目が 透明・白・黒、2行目が薄い色（同じ並び）
export const BASIC_BACKGROUNDS = [null, WHITE, BLACK];
export const BACKGROUNDS = window.LineShareUI.PALETTE.map((color) => color.soft.toLowerCase());

export const DEFAULT_PREFS = {
  mode: "text",
  text: "OK",
  font: FONTS[0].value,
  textColor: HUES[0],
  penColor: BLACK,
  penSize: PEN_SIZES[1].value,
  outline: "double",
  // outline が "custom" のときの縁の色
  outlineColor: OUTLINE_COLORS[0],
  outlineWidth: OUTLINE_WIDTHS[1].value,
  background: null,
  motion: "none",
  shape: "1:1",
  // 送り方。画像は透過できるが動かない、カードは動くが背景が白くなる（今の LINE の表示）
  sendMode: "image",
  // カードで送るときの LINE のカードの大きさ。標準は mega だが、スタンプを大きく見せるため最初は giga
  bubbleSize: "giga"
};
