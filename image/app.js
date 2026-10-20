// 文字アイコン（TextIconSender）と手書き（LIFF Draw Send）の統合版。
// 文字と手書きを1枚に重ねられ、縁取り・背景・動きは両方に共通でかかる。
import { MOTIONS, buildAnimationBlob, canvasToBlob, computeMotionTransform } from "./apng.js?v=202610202325";
import { addSent, deleteSent, listSent } from "./history.js?v=202610202325";

const config = window.LINE_SHARE_CONFIG || {};

const LONG_SIDE = 480; // 静止画の長い辺
const ANIMATION_LONG_SIDE = 240; // 動く画像は 300KB に収めるため小さめに作る
const BASE = 480; // 太さなどの数値は「短い辺 = 480px」を基準にした px

// 画像の形（横:縦）
const SHAPES = [
  { label: "正方形", value: "1:1" },
  { label: "横長", value: "4:3" },
  { label: "ワイド", value: "16:9" },
  { label: "縦長", value: "3:4" }
];
const EDGE_MARGIN = 10;
const PREFS_KEY = "line-share:image-prefs";

const FONTS = [
  { label: "ゴシック", value: "'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  { label: "丸ゴシック", value: "'Hiragino Maru Gothic ProN', 'M PLUS Rounded 1c', 'Hiragino Sans', sans-serif" },
  { label: "明朝", value: "'Hiragino Mincho ProN', 'Yu Mincho', serif" },
  { label: "英字太め", value: "'Arial Black', 'Hiragino Sans', sans-serif" },
  // 手書き風（Google Fonts、SIL OFL）。太さが1種類なので weight を合わせる（太字にすると字がつぶれる）
  { label: "手書き風", value: "'Yomogi', 'Hiragino Maru Gothic ProN', sans-serif", weight: 400, webFont: "Yomogi" },
  { label: "ペン字風", value: "'Klee One', 'Hiragino Mincho ProN', serif", weight: 600, webFont: "Klee One" }
];
// よく使う文字は data/templates.json の text（開いたあとに読み込む）
// 色は2行に分ける。1行目は基本の色（黒・白など）、2行目は全ツール共通の並び
// （shared/ui.js の PALETTE：紫・青・緑・橙・赤）で、最後に「ほかの色」
const BLACK = "#18222f";
const WHITE = "#ffffff";
const HUES = window.LineShareUI.PALETTE.map((color) => color.solid.toLowerCase());
const BASIC_COLORS = [BLACK, WHITE];
// スライダーで選べる太さの範囲（3段階のボタンはこの中のよく使う値）
const PEN_SIZE_MIN = 2;
const PEN_SIZE_MAX = 40;
const PEN_SIZES = [
  { label: "細い", value: 6 },
  { label: "ふつう", value: 12 },
  { label: "太い", value: 22 }
];
const OUTLINES = [
  { label: "なし", value: "none" },
  { label: "白", value: "white" },
  { label: "黒", value: "black" },
  { label: "白黒", value: "double" }
];
// 「ほかの色」で選べる縁の色（一重の縁取りになる）
const OUTLINE_COLORS = HUES;
// LINE のカード（bubble）の大きさ。小さい順
const BUBBLE_SIZES = ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"];
const OUTLINE_WIDTHS = [
  { label: "細い", value: 4 },
  { label: "ふつう", value: 7 },
  { label: "太い", value: 11 }
];
// 背景は 1行目が 透明・白・黒、2行目が薄い色（同じ並び）
const BASIC_BACKGROUNDS = [null, WHITE, BLACK];
const BACKGROUNDS = window.LineShareUI.PALETTE.map((color) => color.soft.toLowerCase());

const DEFAULT_PREFS = {
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

const state = {
  ...structuredClone(DEFAULT_PREFS),
  strokes: [],
  undoStack: [],
  currentStroke: null,
  liffReady: false,
  busy: false
};

const els = {};
let renderQueued = false;
let animationFrame = null;

document.addEventListener("DOMContentLoaded", () => {
  // はじめて開いた人にだけ、短い使い方を出す（shared/ui.js）
  window.LineShareUI.firstTip("image", [
    "文字を入れるか、手書きタブで描きます（重ねることもできます）。",
    "送り方は「画像」か「カード」を選べます。動きを付けるならカード。",
    "下のボタンで、送り先を選んで送れます。"
  ], document.querySelector(".ls-tabs"));
  [
    "canvas", "canvasFrame", "previewStage", "modeText", "modeDraw", "textPanel", "drawPanel",
    "textInput", "textPresets", "fontList", "textColors",
    "penColors", "penSizes", "penSizeRange", "penSizeDot", "undoButton", "clearButton",
    "outlineList", "outlineColors", "outlineWidthList", "backgroundList", "motionList", "cardPanel", "cardOnlyNote",
    "cardMeta", "cardSizeRange", "cardSizeLabel",
    "clearTextButton", "drawTextRow", "drawTextLabel", "drawClearTextButton", "sendModeImage", "sendModeCard", "cardFrame", "backgroundHint",
    "drawHint", "saveButton", "sendButton", "status",
    "saveSheet", "savePreview", "saveDownload", "saveClose",
    "shapeList", "historyPanel", "historyList",
    "textMeta", "penMeta", "shapeMeta", "outlineMeta", "backgroundMeta"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  Object.assign(state, loadPrefs_());
  const modeParam = new URLSearchParams(location.search).get("mode");
  if (modeParam === "text" || modeParam === "draw") state.mode = modeParam;

  buildControls_();
  bindEvents_();
  applyState_();
  renderHistory_();
  initLiff_();
});

// ---- 描画 ----

// 長い辺を longSide にしたときの幅と高さ
function dims_(longSide) {
  const [w, h] = state.shape.split(":").map(Number);
  return w >= h
    ? { width: longSide, height: Math.round((longSide * h) / w) }
    : { width: Math.round((longSide * w) / h), height: longSide };
}

/**
 * 文字と手書きを重ね、縁取りまでかけた1枚（動きをかける前）を作る。
 */
function buildLayer(width, height) {
  const scale = Math.min(width, height) / BASE;
  const content = renderContent_(width, height, scale);
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext("2d");

  const ring = state.outline === "none" ? 0 : Math.max(1, Math.round(state.outlineWidth * scale));
  if (state.outline === "double") {
    drawOutline_(layerCtx, content, ring * 2, WHITE);
    drawOutline_(layerCtx, content, ring, BLACK);
  } else if (ring > 0) {
    drawOutline_(layerCtx, content, ring, outlineColor_());
  }
  layerCtx.drawImage(content, 0, 0);
  return layer;
}

function outlineColor_() {
  if (state.outline === "custom") return state.outlineColor;
  return state.outline === "white" ? WHITE : BLACK;
}

/**
 * 背景を敷き、動きの変形をかけて layer を ctx に描く。
 */
function compose(ctx, width, height, layer, transform = {}) {
  ctx.clearRect(0, 0, width, height);
  if (state.background) {
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, width, height);
  }

  const { offsetX = 0, offsetY = 0, scale: zoom = 1, rotation = 0, wrapX = false } = transform;
  for (const tileX of wrapX ? [-width, 0, width] : [0]) {
    ctx.save();
    ctx.translate(width / 2 + offsetX + tileX, height / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

function renderContent_(width, height, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const text = state.text.trim();
  if (text) {
    const lines = text.split("\n");
    const outline = state.outline === "none" ? 0 : state.outlineWidth * scale * (state.outline === "double" ? 2 : 1);
    const padding = EDGE_MARGIN * scale + outline;
    const fontSize = fitFontSize_(ctx, lines, width - padding * 2, height - padding * 2);
    const lineHeight = fontSize * 1.15;
    const startY = height / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;

    ctx.font = font_(fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = state.textColor;
    lines.forEach((line, index) => ctx.fillText(line, width / 2, startY + index * lineHeight));
  }

  // 手書きの点は「中心からの距離 ÷ 短い辺」で持つので、形を変えても線が伸び縮みしない
  const unit = Math.min(width, height);
  const toX = (x) => width / 2 + x * unit;
  const toY = (y) => height / 2 + y * unit;
  const strokes = state.currentStroke ? [...state.strokes, state.currentStroke] : state.strokes;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * scale;
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    stroke.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(toX(x), toY(y));
      else ctx.lineTo(toX(x), toY(y));
    });
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0];
      ctx.lineTo(toX(x) + 0.01, toY(y));
    }
    ctx.stroke();
  }

  return canvas;
}

function font_(px) {
  const weight = FONTS.find((option) => option.value === state.font)?.weight ?? 800;
  return `${weight} ${px}px ${state.font}`;
}

// 手書き風の書体は読み込みに時間がかかるので、使う文字の分を読み込んでから描き直す
// （canvas は読み込み前だと代わりの書体で描いてしまう）
async function loadWebFont_() {
  if (!FONTS.find((option) => option.value === state.font)?.webFont || !document.fonts) return;
  try {
    await document.fonts.load(font_(48), state.text || "あ");
  } catch {
    // 読み込めなくても代わりの書体で描ける
  }
}

// 描く前に呼ぶ。まだ読み込まれていなければ読み込み、終わったら描き直す（読み込み済みなら何もしない）
let fontLoading = "";
function ensureWebFont_() {
  if (!FONTS.find((option) => option.value === state.font)?.webFont || !document.fonts) return;
  const key = `${font_(48)}|${state.text}`;
  if (fontLoading === key || document.fonts.check(font_(48), state.text || "あ")) return;
  fontLoading = key;
  loadWebFont_().then(() => {
    if (fontLoading === key) fontLoading = "";
    restartPreview_();
  });
}

function fitFontSize_(ctx, lines, maxWidth, maxHeight) {
  let low = 8;
  let high = Math.floor(maxHeight / (lines.length * 1.15));
  // 二分探索で枠に収まる最大の文字サイズを探す
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    ctx.font = font_(mid);
    const width = Math.max(
      ...lines.map((line) => {
        const m = ctx.measureText(line || " ");
        return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      })
    );
    if (width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low;
}

// 不透明な部分を円状にずらして重ね、縁取りを作る（文字・手書き・絵文字すべてに効く）
function drawOutline_(targetCtx, source, radius, color) {
  const tinted = document.createElement("canvas");
  tinted.width = source.width;
  tinted.height = source.height;
  const tintedCtx = tinted.getContext("2d");
  tintedCtx.drawImage(source, 0, 0);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);

  const steps = Math.max(16, Math.min(48, radius * 4));
  for (const ratio of [1, 0.66, 0.33]) {
    const r = radius * ratio;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      targetCtx.drawImage(tinted, Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
}

// プレビュー用の layer は内容が変わったときだけ作り直し、アニメーション中は使い回す
let previewLayer = null;

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  ensureWebFont_();
  requestAnimationFrame(() => {
    renderQueued = false;
    const { width, height } = dims_(LONG_SIDE);
    previewLayer = buildLayer(width, height);
    if (!isPreviewMoving_()) {
      compose(els.canvas.getContext("2d"), width, height, previewLayer);
    }
  });
}

// プレビューを動かすのはカードで動きがあるときだけ。手書き中は描きやすいように止める（送る画像には影響しない）
function isPreviewMoving_() {
  return state.motion !== "none" && state.sendMode === "card" && state.mode !== "draw";
}

function restartPreview_() {
  ensureWebFont_();
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  const { width, height } = dims_(LONG_SIDE);
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  els.canvasFrame.style.aspectRatio = `${width} / ${height}`;
  const ctx = els.canvas.getContext("2d");
  previewLayer = buildLayer(width, height);
  if (!isPreviewMoving_()) {
    compose(ctx, width, height, previewLayer);
    return;
  }
  const start = performance.now();
  const loop = (now) => {
    const t = ((now - start) % 900) / 900;
    compose(ctx, width, height, previewLayer, computeMotionTransform(state.motion, t, width, height));
    animationFrame = requestAnimationFrame(loop);
  };
  animationFrame = requestAnimationFrame(loop);
}

// ---- 手書き ----

function pointFromEvent_(event) {
  const rect = els.canvas.getBoundingClientRect();
  const unit = Math.min(rect.width, rect.height);
  return [
    (event.clientX - rect.left - rect.width / 2) / unit,
    (event.clientY - rect.top - rect.height / 2) / unit
  ];
}

function bindDrawing_() {
  const canvas = els.canvas;

  // iOS の LINE 内ブラウザでは touch-action だけだとスクロールが止まらないことがあるため、
  // 手書き中はキャンバス上のタッチを直接止める（passive: false が必要）
  const stopTouch = (event) => {
    if (state.mode === "draw") event.preventDefault();
  };
  canvas.addEventListener("touchstart", stopTouch, { passive: false });
  canvas.addEventListener("touchmove", stopTouch, { passive: false });

  canvas.addEventListener("pointerdown", (event) => {
    if (state.mode !== "draw" || state.currentStroke) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    state.currentStroke = {
      pointerId: event.pointerId,
      color: state.penColor,
      size: state.penSize,
      points: [pointFromEvent_(event)]
    };
    requestRender();
  });

  canvas.addEventListener("pointermove", (event) => {
    const stroke = state.currentStroke;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [event];
    for (const item of events) stroke.points.push(pointFromEvent_(item));
    requestRender();
  });

  const finish = (event) => {
    const stroke = state.currentStroke;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    state.currentStroke = null;
    pushUndo_();
    state.strokes.push({ color: stroke.color, size: stroke.size, points: stroke.points });
    updateUndo_();
    requestRender();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

function pushUndo_() {
  state.undoStack.push(state.strokes.slice());
  if (state.undoStack.length > 50) state.undoStack.shift();
}

function updateUndo_() {
  els.undoButton.disabled = state.undoStack.length === 0;
  els.clearButton.disabled = state.strokes.length === 0;
  els.drawHint.hidden = state.mode !== "draw" || state.strokes.length > 0;
  updateMeta_();
}

// ---- 画面 ----

function buildControls_() {
  window.LineShareUI.loadTemplates().then(({ text }) => {
    const presets = Array.isArray(text) ? text.filter((value) => typeof value === "string") : [];
    buildChoices_(els.textPresets, presets.map((value) => ({ label: value, value })), () => null, (value) => {
      state.text = value;
      els.textInput.value = value;
    });
  });
  buildChoices_(els.fontList, FONTS, () => state.font, (value) => (state.font = value), (button, option) => {
    button.style.fontFamily = option.value;
  });
  buildSwatches_(els.textColors, HUES, () => state.textColor, (color) => (state.textColor = color), { basics: BASIC_COLORS });
  buildSwatches_(els.penColors, HUES, () => state.penColor, (color) => (state.penColor = color), { basics: BASIC_COLORS });
  buildChoices_(els.penSizes, PEN_SIZES, () => state.penSize, (value) => (state.penSize = value));
  buildChoices_(els.outlineList, OUTLINES, () => state.outline, (value) => (state.outline = value));
  // ほかの色を選ぶと、その色の一重の縁取りにする（白・黒・白黒を選んでいる間はどれも選ばれていない表示）
  buildSwatches_(
    els.outlineColors,
    OUTLINE_COLORS,
    () => (state.outline === "custom" ? state.outlineColor : null),
    (color) => {
      state.outline = "custom";
      state.outlineColor = color;
    }
  );
  buildChoices_(els.outlineWidthList, OUTLINE_WIDTHS, () => state.outlineWidth, (value) => (state.outlineWidth = value));
  buildSwatches_(els.backgroundList, BACKGROUNDS, () => state.background, (color) => (state.background = color), {
    basics: BASIC_BACKGROUNDS,
    noneLabel: "透明"
  });
  buildChoices_(els.motionList, MOTIONS, () => state.motion, (value) => (state.motion = value));
  buildChoices_(els.shapeList, SHAPES, () => state.shape, (value) => (state.shape = value));
}

const choiceGroups = [];

function buildChoices_(container, options, get, set, decorate) {
  const buttons = options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ls-chip";
    button.textContent = option.label;
    button.dataset.value = JSON.stringify(option.value);
    decorate?.(button, option);
    button.addEventListener("click", () => {
      set(option.value);
      onChange_();
    });
    return button;
  });
  container.replaceChildren(...buttons);
  choiceGroups.push({ buttons, get });
}

// basics を渡すと、それを1行目に並べ、colors と「ほかの色」を2行目にする
function buildSwatches_(container, colors, get, set, { basics = [], noneLabel = "" } = {}) {
  const buttons = [...basics, ...colors].map((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ls-swatch";
    button.dataset.value = JSON.stringify(color);
    if (color === null) {
      button.classList.add("is-none");
      button.textContent = noneLabel;
    } else {
      button.style.setProperty("--swatch", color);
      button.setAttribute("aria-label", color);
    }
    button.addEventListener("click", () => {
      set(color);
      onChange_();
    });
    return button;
  });

  const custom = document.createElement("label");
  custom.className = "ls-swatch is-custom";
  custom.setAttribute("aria-label", "ほかの色");
  const input = document.createElement("input");
  input.type = "color";
  input.addEventListener("input", () => {
    set(input.value);
    onChange_();
  });
  custom.append(input);

  const rowBreak = document.createElement("span");
  rowBreak.className = "ls-swatch-break";
  rowBreak.setAttribute("aria-hidden", "true");
  container.replaceChildren(
    ...buttons.slice(0, basics.length),
    ...(basics.length ? [rowBreak] : []),
    ...buttons.slice(basics.length),
    custom
  );
  choiceGroups.push({ buttons, get, custom, input });
}

function syncChoices_() {
  for (const group of choiceGroups) {
    const current = JSON.stringify(group.get());
    let matched = false;
    for (const button of group.buttons) {
      const selected = button.dataset.value === current;
      button.setAttribute("aria-pressed", String(selected));
      matched ||= selected;
    }
    if (group.custom) {
      const value = group.get();
      group.custom.classList.toggle("is-selected", !matched && value !== null);
      if (value) {
        group.custom.style.setProperty("--swatch", value);
        group.input.value = value;
      }
    }
  }
}

function applyState_() {
  const isDraw = state.mode === "draw";
  els.modeText.setAttribute("aria-selected", String(!isDraw));
  els.modeDraw.setAttribute("aria-selected", String(isDraw));
  els.textPanel.hidden = isDraw;
  els.drawPanel.hidden = !isDraw;
  els.canvasFrame.classList.toggle("is-drawing", isDraw);
  // 文字タブではプレビューをタップすると文字の入力へ移る（ほかのツールと同じ。手書きタブでは描く場所なので付けない）
  if (isDraw) {
    for (const name of ["data-jump", "data-jump-focus", "role", "tabindex", "aria-label"]) els.canvasFrame.removeAttribute(name);
  } else {
    Object.assign(els.canvasFrame.dataset, { jump: "textPanel", jumpFocus: "textInput" });
    els.canvasFrame.setAttribute("role", "button");
    els.canvasFrame.tabIndex = 0;
    els.canvasFrame.setAttribute("aria-label", "文字を編集");
  }
  // 送り方でプレビューの見え方（トークの上に画像だけ／白いカードの中）と使える設定を切り替える
  const isCard = state.sendMode === "card";
  els.previewStage.dataset.sendMode = state.sendMode;
  els.sendModeImage.setAttribute("aria-checked", String(!isCard));
  els.sendModeImage.classList.toggle("is-active", !isCard);
  els.sendModeCard.setAttribute("aria-checked", String(isCard));
  els.sendModeCard.classList.toggle("is-active", isCard);
  els.backgroundHint.textContent = isCard
    ? "画像そのものの背景です。カードで送ると、透明にしても白い背景になります。"
    : "画像そのものの背景です。透明にすると、トークの背景が透けて見えます。";
  if (!state.busy) els.sendButton.textContent = sendLabel_();
  els.textInput.value = state.text;
  els.outlineWidthList.closest(".ls-field").hidden = state.outline === "none";
  // 大きさと動きはカードで送るときだけ（画像では LINE が大きさを決め、動きもしない）。画像のときは欄ごとグレーにする
  if (!BUBBLE_SIZES.includes(state.bubbleSize)) state.bubbleSize = "giga";
  els.cardPanel.classList.toggle("is-unavailable", !isCard);
  els.cardOnlyNote.hidden = isCard;
  els.cardSizeRange.disabled = !isCard;
  els.cardSizeRange.value = String(BUBBLE_SIZES.indexOf(state.bubbleSize));
  els.cardSizeLabel.textContent = state.bubbleSize;
  els.cardFrame.dataset.size = state.bubbleSize;
  for (const button of els.motionList.querySelectorAll("button")) button.disabled = !isCard;
  syncTextClear_();
  updateMeta_();
  syncChoices_();
  updateUndo_();
  restartPreview_();
}

// アコーディオンの見出しの右に、今の設定を短く出す
function updateMeta_() {
  const labelOf = (options, value) => options.find((option) => option.value === value)?.label || "";
  const text = state.text.trim().replace(/\s+/g, " ");
  els.textMeta.textContent = text ? (text.length > 10 ? `${text.slice(0, 10)}…` : text) : "なし";
  els.penMeta.textContent = `${labelOf(PEN_SIZES, state.penSize) || `太さ${state.penSize}`}・${state.strokes.length}本`;
  syncPenSize_();
  els.shapeMeta.textContent = labelOf(SHAPES, state.shape);
  els.outlineMeta.textContent =
    state.outline === "none"
      ? "なし"
      : `${labelOf(OUTLINES, state.outline) || "色"}・${labelOf(OUTLINE_WIDTHS, state.outlineWidth)}`;
  els.backgroundMeta.textContent = state.background ? "色あり" : "透明";
  updatePreviewError_();
  els.cardMeta.textContent = state.sendMode === "card" ? `${state.bubbleSize}・${labelOf(MOTIONS, state.motion) || "なし"}` : "—（画像）";
}

function sendLabel_() {
  return state.sendMode === "card" ? "🪧 カードで送る" : "🖼️ 画像で送る";
}

// スライダーと見本の丸を今の太さに合わせる。丸はプレビュー上で実際に描かれる太さ
function syncPenSize_() {
  els.penSizeRange.value = String(state.penSize);
  const rect = els.canvas.getBoundingClientRect();
  const px = Math.max(2, (state.penSize * Math.min(rect.width, rect.height)) / BASE);
  els.penSizeDot.style.width = els.penSizeDot.style.height = `${px}px`;
  els.penSizeDot.style.background = state.penColor;
}

// 文字を消すボタンは文字があるときだけ使える。手書きタブでは文字があるときだけ出す
function syncTextClear_() {
  const text = state.text.trim().replace(/\s+/g, " ");
  els.clearTextButton.disabled = !text;
  els.drawTextRow.hidden = !text;
  els.drawTextLabel.textContent = text.length > 10 ? `${text.slice(0, 10)}…` : text;
}

function clearText_() {
  if (!state.text) return;
  state.text = "";
  onChange_();
  setStatus_(state.mode === "draw" ? "文字を消しました。手書きだけになります。" : "文字を消しました。");
}

function onChange_() {
  savePrefs_();
  applyState_();
}

function bindEvents_() {
  els.cardSizeRange.addEventListener("input", () => {
    state.bubbleSize = BUBBLE_SIZES[Number(els.cardSizeRange.value)] || "giga";
    onChange_();
  });
  els.penSizeRange.addEventListener("input", () => {
    state.penSize = Math.min(PEN_SIZE_MAX, Math.max(PEN_SIZE_MIN, Number(els.penSizeRange.value) || PEN_SIZES[1].value));
    onChange_();
  });
  els.modeText.addEventListener("click", () => {
    state.mode = "text";
    onChange_();
  });
  els.modeDraw.addEventListener("click", () => {
    state.mode = "draw";
    onChange_();
  });
  els.sendModeImage.addEventListener("click", () => {
    if (state.sendMode === "image") return;
    state.sendMode = "image";
    if (state.motion !== "none") {
      state.motion = "none";
      setStatus_("画像では動かないため、動きを「なし」にしました。");
    }
    onChange_();
  });
  els.sendModeCard.addEventListener("click", () => {
    if (state.sendMode === "card") return;
    state.sendMode = "card";
    onChange_();
  });
  els.textInput.addEventListener("input", () => {
    state.text = els.textInput.value;
    savePrefs_();
    syncChoices_();
    updateMeta_();
    syncTextClear_();
    requestRender();
  });
  els.clearTextButton.addEventListener("click", clearText_);
  els.drawClearTextButton.addEventListener("click", clearText_);
  els.undoButton.addEventListener("click", () => {
    if (!state.undoStack.length) return;
    state.strokes = state.undoStack.pop();
    updateUndo_();
    requestRender();
  });
  els.clearButton.addEventListener("click", () => {
    if (!state.strokes.length) return;
    pushUndo_();
    state.strokes = [];
    updateUndo_();
    requestRender();
    setStatus_("手書きを消しました。「元に戻す」で戻せます。");
  });
  els.saveButton.addEventListener("click", openSaveSheet_);
  els.saveClose.addEventListener("click", () => closeSheet_(els.saveSheet));
  els.sendButton.addEventListener("click", send_);
  bindDrawing_();
}

function hasContent_() {
  return Boolean(state.text.trim()) || state.strokes.length > 0;
}

// 完成イメージのときに、送れない理由をプレビューの上に出す
function updatePreviewError_() {
  window.LineShareUI.setPreviewError(els.cardFrame, hasContent_() ? "" : "文字を入れるか、手書きで描いてください。");
}

function setStatus_(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `ls-status ${tone ? `is-${tone}` : ""}`;
}

// ---- 書き出し ----

async function buildImage_() {
  await loadWebFont_();
  if (state.motion === "none" || state.sendMode !== "card") {
    const { width, height } = dims_(LONG_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    compose(canvas.getContext("2d"), width, height, buildLayer(width, height));
    return { blob: await canvasToBlob(canvas), width, height, animated: false };
  }
  const { width, height } = dims_(ANIMATION_LONG_SIDE);
  const layer = buildLayer(width, height);
  const { blob, oversized } = await buildAnimationBlob({
    width,
    height,
    preset: state.motion,
    renderFrame: (ctx, transform) => compose(ctx, width, height, layer, transform)
  });
  if (oversized) {
    setStatus_("動く画像がLINEの上限（300KB）を超えたため、止まって表示される場合があります。", "error");
  }
  return { blob, width, height, animated: true };
}

async function openSaveSheet_() {
  if (!hasContent_()) {
    setStatus_("文字を入れるか、手書きで描いてください。", "error");
    return;
  }
  const { blob } = await buildImage_();
  const url = URL.createObjectURL(blob);
  els.savePreview.src = url;
  els.saveDownload.href = url;
  els.saveDownload.download = `line-share-${Date.now()}.png`;
  openSheet_(els.saveSheet);
}

function openSheet_(sheet) {
  sheet.hidden = false;
  sheet.querySelector("button, a")?.focus();
}

function closeSheet_(sheet) {
  sheet.hidden = true;
}

// ---- 送信 ----


// アップロード先（無料は画像サーバー、有償は GAS）は shared/plan.js が選ぶ
async function uploadImage_(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return window.LineSharePlan.upload(dataUrl);
}

// 今の LINE ではカード（Flex）の背景は透過しない（元の文字アイコンも同じ）。透過したいときは「画像で送る」
function buildMessage_(mode, imageUrl, item) {
  if (mode === "image") {
    return { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl };
  }
  const sourceText = item.text?.trim().replace(/\s+/g, " ") || "";
  const credit = window.LineShareCredit;
  return {
    type: "flex",
    altText: (sourceText || "画像").slice(0, 100),
    contents: {
      type: "bubble",
      size: BUBBLE_SIZES.includes(item.size) ? item.size : "giga",
      hero: {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: aspectRatio_(item.width, item.height),
        aspectMode: "fit",
        animated: item.animated,
        backgroundColor: "#00000000",
        // Created by が ON のときは画像のタップでも「おくるん」を開く
        ...(credit?.enabled() ? { action: { type: "uri", label: "おくるん", uri: credit.topUrl() } } : {})
      },
      // 画像だけを見せるため本文は空にする（Created by はフッターに付く）
      body: {
        type: "box",
        layout: "vertical",
        contents: [],
        paddingAll: "0px",
        spacing: "none",
        backgroundColor: "#00000000"
      },
      styles: {
        hero: { backgroundColor: "#00000000" },
        body: { backgroundColor: "#00000000" }
      }
    }
  };
}

// 縦横比を約分して「横:縦」にする（LINE の上限に合わせて 3 倍までに抑える）
function aspectRatio_(width, height) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height) || 1;
  let w = width / divisor;
  let h = height / divisor;
  if (w / h > 3) [w, h] = [3, 1];
  if (w / h < 1 / 3) [w, h] = [1, 3];
  return `${w}:${h}`;
}

async function send_() {
  if (!hasContent_()) {
    setStatus_("文字を入れるか、手書きで描いてください。", "error");
    return;
  }
  const image = await buildImage_();
  await sendImage_({ ...image, text: state.text, mode: state.sendMode, size: state.bubbleSize });
}

// 作った画像・送った画像のどちらも、ここから送る
async function sendImage_(item) {
  if (state.busy) return;
  if (!state.liffReady || !window.LineShareLiff.canShare()) {
    setStatus_(window.LineShareLiff.MESSAGES.notInLine, "error");
    return;
  }

  state.busy = true;
  els.sendButton.disabled = true;
  try {
    // 送った画像を送り直すときは、送ったときと同じ送り方にする
    const mode = item.mode || (item.animated ? "card" : "image");

    els.sendButton.textContent = "準備中...";
    // 画像の保存は30秒前後かかることがあるので、経過秒数と理由を出す（shared/ui.js）
    const stopProgress = window.LineShareUI.progress("画像を保存しています", (text) => setStatus_(text));
    let imageUrl;
    try {
      imageUrl = await uploadImage_(item.blob);
    } finally {
      stopProgress();
    }
    setStatus_("");
    const message = window.LineShareCredit?.withCredit(buildMessage_(mode, imageUrl, item)) ?? buildMessage_(mode, imageUrl, item);
    if (await window.LineShareLiff.share([message])) {
      setStatus_(window.LineShareLiff.MESSAGES.sent, "success");
      window.LineShareLog?.track("send", { kind: item.animated ? `${mode}-motion` : mode });
      await addSent({ blob: item.blob, width: item.width, height: item.height, animated: item.animated, text: item.text || "", mode, size: item.size });
      renderHistory_();
      // 続けて別のトークにも同じ画像を送れるように（アップロードし直さず、同じ URL のメッセージを送る）
      window.LineShareUI.afterSent({ resend: () => window.LineShareLiff.share([message]) });
    } else {
      setStatus_(window.LineShareLiff.MESSAGES.canceled);
    }
  } catch (error) {
    console.error(error);
    setStatus_(window.LineShareLiff.MESSAGES.sendFailed, "error");
  } finally {
    state.busy = false;
    els.sendButton.disabled = !state.liffReady;
    els.sendButton.textContent = sendLabel_();
  }
}

// ---- 送った画像 ----

let historyUrls = [];

async function renderHistory_() {
  const items = await listSent();
  historyUrls.forEach((url) => URL.revokeObjectURL(url));
  historyUrls = [];

  els.historyPanel.hidden = items.length === 0;
  els.historyList.replaceChildren(
    ...items.map((item) => {
      const url = URL.createObjectURL(item.blob);
      historyUrls.push(url);

      const cell = document.createElement("div");
      cell.className = "history-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-thumb ls-checker";
      button.setAttribute("aria-label", `${item.text || "画像"}を送り直す`);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      button.append(img);
      button.addEventListener("click", () => sendImage_(item));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "history-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "履歴から消す");
      remove.addEventListener("click", async () => {
        await deleteSent(item.id);
        renderHistory_();
      });

      cell.append(button, remove);
      return cell;
    })
  );
}

async function initLiff_() {
  els.sendButton.disabled = true;
  if (!config.liffId) {
    setStatus_("LIFF ID が未設定です（config.js）。画像の作成と保存は使えます。");
    return;
  }
  // LIFF の準備は shared/liff.js。LINE の外のブラウザでもログインして送れるようにする
  const { MESSAGES } = window.LineShareLiff;
  setStatus_(MESSAGES.connecting);
  // 無料の画像サーバーは眠っていると最初の保存が遅いので、開いた時点で起こしておく
  window.LineSharePlan?.warmUp();
  const { ready, reason } = await window.LineShareLiff.init({ login: "external" });
  if (!ready) {
    if (reason !== "redirecting") setStatus_(MESSAGES[reason] || MESSAGES.failed, "error");
    return;
  }
  state.liffReady = true;
  els.sendButton.disabled = false;
  // 準備中の表示だけ消す（その間に出た別のお知らせは残す）
  if (els.status.textContent === MESSAGES.connecting) setStatus_("");
}

// ---- 設定の保存（使えない環境でも動くように） ----

function loadPrefs_() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return Object.fromEntries(Object.keys(DEFAULT_PREFS).filter((key) => key in saved).map((key) => [key, saved[key]]));
  } catch {
    return {};
  }
}

function savePrefs_() {
  try {
    const prefs = Object.fromEntries(Object.keys(DEFAULT_PREFS).map((key) => [key, state[key]]));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 保存できなくても画面はそのまま使える
  }
}
