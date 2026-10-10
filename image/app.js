// 文字アイコン（TextIconSender）と手書き（LIFF Draw Send）の統合版。
// 文字と手書きを1枚に重ねられ、縁取り・背景・動きは両方に共通でかかる。
import { MOTIONS, buildAnimationBlob, canvasToBlob, computeMotionTransform } from "./apng.js";

const config = window.LINE_SHARE_CONFIG || {};

const SIZE = 480; // 静止画の一辺
const ANIMATION_SIZE = 240; // 動く画像は 300KB に収めるため小さめに作る
const BASE = 480; // 太さなどの数値はこの一辺を基準にした px
const EDGE_MARGIN = 10;
const PREFS_KEY = "line-share:image-prefs";

const FONTS = [
  { label: "ゴシック", value: "'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  { label: "丸ゴシック", value: "'Hiragino Maru Gothic ProN', 'M PLUS Rounded 1c', 'Hiragino Sans', sans-serif" },
  { label: "明朝", value: "'Hiragino Mincho ProN', 'Yu Mincho', serif" },
  { label: "英字太め", value: "'Arial Black', 'Hiragino Sans', sans-serif" }
];
const TEXT_PRESETS = ["OK", "了解！", "ありがとう", "おつかれさま", "確認します", "至急", "🙏", "？"];
const TEXT_COLORS = ["#38ba91", "#18222f", "#ffffff", "#e5484d", "#f5a524", "#3e7bfa", "#ff6fa8"];
const PEN_COLORS = ["#18222f", "#ffffff", "#e5484d", "#f5a524", "#30a46c", "#3e7bfa"];
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
const OUTLINE_WIDTHS = [
  { label: "細い", value: 4 },
  { label: "ふつう", value: 7 },
  { label: "太い", value: 11 }
];
const BACKGROUNDS = [null, "#ffffff", "#fff4d6", "#ffe1ea", "#dff1ff", "#e0f5e9", "#18222f"];

const DEFAULT_PREFS = {
  mode: "text",
  text: "OK",
  font: FONTS[0].value,
  textColor: TEXT_COLORS[0],
  penColor: PEN_COLORS[0],
  penSize: PEN_SIZES[1].value,
  outline: "double",
  outlineWidth: OUTLINE_WIDTHS[1].value,
  background: null,
  motion: "none",
  backdrop: "checker"
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
  [
    "canvas", "canvasFrame", "modeText", "modeDraw", "textPanel", "drawPanel",
    "textInput", "textPresets", "fontList", "textColors",
    "penColors", "penSizes", "undoButton", "clearButton",
    "outlineList", "outlineWidthList", "backgroundList", "motionList", "backdropList",
    "drawHint", "saveButton", "sendButton", "status",
    "saveSheet", "savePreview", "saveDownload", "saveClose",
    "sendSheet", "sendPreview", "sendAsImage", "sendAsCard", "sendCancel", "sendMotionNote"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.canvas.width = SIZE;
  els.canvas.height = SIZE;

  Object.assign(state, loadPrefs_());
  const modeParam = new URLSearchParams(location.search).get("mode");
  if (modeParam === "text" || modeParam === "draw") state.mode = modeParam;

  buildControls_();
  bindEvents_();
  applyState_();
  initLiff_();
});

// ---- 描画 ----

/**
 * 文字と手書きを重ね、縁取りまでかけた1枚（動きをかける前）を作る。
 */
function buildLayer(size) {
  const scale = size / BASE;
  const content = renderContent_(size, scale);
  const layer = document.createElement("canvas");
  layer.width = size;
  layer.height = size;
  const layerCtx = layer.getContext("2d");

  const width = state.outline === "none" ? 0 : Math.max(1, Math.round(state.outlineWidth * scale));
  if (state.outline === "double") {
    drawOutline_(layerCtx, content, width * 2, "#ffffff");
    drawOutline_(layerCtx, content, width, "#18222f");
  } else if (width > 0) {
    drawOutline_(layerCtx, content, width, state.outline === "white" ? "#ffffff" : "#18222f");
  }
  layerCtx.drawImage(content, 0, 0);
  return layer;
}

/**
 * 背景を敷き、動きの変形をかけて layer を ctx に描く。
 */
function compose(ctx, size, layer, transform = {}) {
  ctx.clearRect(0, 0, size, size);
  if (state.background) {
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, size, size);
  }

  const { offsetX = 0, offsetY = 0, scale: zoom = 1, rotation = 0, wrapX = false } = transform;
  for (const tileX of wrapX ? [-size, 0, size] : [0]) {
    ctx.save();
    ctx.translate(size / 2 + offsetX + tileX, size / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-size / 2, -size / 2);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

function renderContent_(size, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const text = state.text.trim();
  if (text) {
    const lines = text.split("\n");
    const outline = state.outline === "none" ? 0 : state.outlineWidth * scale * (state.outline === "double" ? 2 : 1);
    const padding = EDGE_MARGIN * scale + outline;
    const fontSize = fitFontSize_(ctx, lines, size - padding * 2);
    const lineHeight = fontSize * 1.15;
    const startY = size / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;

    ctx.font = font_(fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = state.textColor;
    lines.forEach((line, index) => ctx.fillText(line, size / 2, startY + index * lineHeight));
  }

  const strokes = state.currentStroke ? [...state.strokes, state.currentStroke] : state.strokes;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * scale;
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    stroke.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x * size, y * size);
      else ctx.lineTo(x * size, y * size);
    });
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0];
      ctx.lineTo(x * size + 0.01, y * size);
    }
    ctx.stroke();
  }

  return canvas;
}

function font_(px) {
  return `800 ${px}px ${state.font}`;
}

function fitFontSize_(ctx, lines, box) {
  let low = 8;
  let high = Math.floor(box / (lines.length * 1.15));
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
    if (width <= box) low = mid;
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
  requestAnimationFrame(() => {
    renderQueued = false;
    previewLayer = buildLayer(SIZE);
    if (state.motion === "none") {
      compose(els.canvas.getContext("2d"), SIZE, previewLayer);
    }
  });
}

function restartPreview_() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  const ctx = els.canvas.getContext("2d");
  previewLayer = buildLayer(SIZE);
  if (state.motion === "none") {
    compose(ctx, SIZE, previewLayer);
    return;
  }
  const start = performance.now();
  const loop = (now) => {
    const t = ((now - start) % 900) / 900;
    compose(ctx, SIZE, previewLayer, computeMotionTransform(state.motion, t, SIZE));
    animationFrame = requestAnimationFrame(loop);
  };
  animationFrame = requestAnimationFrame(loop);
}

// ---- 手書き ----

function pointFromEvent_(event) {
  const rect = els.canvas.getBoundingClientRect();
  return [
    Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  ];
}

function bindDrawing_() {
  const canvas = els.canvas;

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
}

// ---- 画面 ----

function buildControls_() {
  buildChoices_(els.textPresets, TEXT_PRESETS.map((text) => ({ label: text, value: text })), () => null, (value) => {
    state.text = value;
    els.textInput.value = value;
  });
  buildChoices_(els.fontList, FONTS, () => state.font, (value) => (state.font = value), (button, option) => {
    button.style.fontFamily = option.value;
  });
  buildSwatches_(els.textColors, TEXT_COLORS, () => state.textColor, (color) => (state.textColor = color));
  buildSwatches_(els.penColors, PEN_COLORS, () => state.penColor, (color) => (state.penColor = color));
  buildChoices_(els.penSizes, PEN_SIZES, () => state.penSize, (value) => (state.penSize = value));
  buildChoices_(els.outlineList, OUTLINES, () => state.outline, (value) => (state.outline = value));
  buildChoices_(els.outlineWidthList, OUTLINE_WIDTHS, () => state.outlineWidth, (value) => (state.outlineWidth = value));
  buildSwatches_(els.backgroundList, BACKGROUNDS, () => state.background, (color) => (state.background = color), "透明");
  buildChoices_(els.motionList, MOTIONS, () => state.motion, (value) => (state.motion = value));
  buildChoices_(
    els.backdropList,
    [
      { label: "透過", value: "checker" },
      { label: "明るいトーク", value: "light" },
      { label: "暗いトーク", value: "dark" }
    ],
    () => state.backdrop,
    (value) => (state.backdrop = value)
  );
}

const choiceGroups = [];

function buildChoices_(container, options, get, set, decorate) {
  const buttons = options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
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

function buildSwatches_(container, colors, get, set, noneLabel) {
  const buttons = colors.map((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
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
  custom.className = "swatch is-custom";
  custom.setAttribute("aria-label", "ほかの色");
  const input = document.createElement("input");
  input.type = "color";
  input.addEventListener("input", () => {
    set(input.value);
    onChange_();
  });
  custom.append(input);

  container.replaceChildren(...buttons, custom);
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
  els.canvasFrame.dataset.backdrop = state.backdrop;
  els.textInput.value = state.text;
  els.outlineWidthList.closest(".field").hidden = state.outline === "none";
  syncChoices_();
  updateUndo_();
  restartPreview_();
}

function onChange_() {
  savePrefs_();
  applyState_();
}

function bindEvents_() {
  els.modeText.addEventListener("click", () => {
    state.mode = "text";
    onChange_();
  });
  els.modeDraw.addEventListener("click", () => {
    state.mode = "draw";
    onChange_();
  });
  els.textInput.addEventListener("input", () => {
    state.text = els.textInput.value;
    savePrefs_();
    syncChoices_();
    requestRender();
  });
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

function setStatus_(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `ls-status ${tone ? `is-${tone}` : ""}`;
}

// ---- 書き出し ----

async function buildImage_() {
  if (state.motion === "none") {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    compose(canvas.getContext("2d"), SIZE, buildLayer(SIZE));
    return { blob: await canvasToBlob(canvas), size: SIZE, animated: false };
  }
  const layer = buildLayer(ANIMATION_SIZE);
  const { blob, oversized } = await buildAnimationBlob({
    size: ANIMATION_SIZE,
    preset: state.motion,
    renderFrame: (ctx, transform) => compose(ctx, ANIMATION_SIZE, layer, transform)
  });
  if (oversized) {
    setStatus_("動く画像がLINEの上限（300KB）を超えたため、止まって表示される場合があります。", "error");
  }
  return { blob, size: ANIMATION_SIZE, animated: true };
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

function chooseSendMode_(previewUrl) {
  els.sendPreview.src = previewUrl;
  const animated = state.motion !== "none";
  els.sendMotionNote.hidden = !animated;
  openSheet_(els.sendSheet);

  return new Promise((resolve) => {
    const done = (mode) => {
      closeSheet_(els.sendSheet);
      els.sendAsImage.onclick = els.sendAsCard.onclick = els.sendCancel.onclick = null;
      resolve(mode);
    };
    els.sendAsImage.onclick = () => done("image");
    els.sendAsCard.onclick = () => done("card");
    els.sendCancel.onclick = () => done(null);
  });
}

async function uploadImage_(blob) {
  const base = String(config.imageApiBaseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("画像のアップロード先（config.js の imageApiBaseUrl）が未設定です。");

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const response = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData: dataUrl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.imageUrl) {
    console.error("upload failed", response.status, data);
    throw new Error("画像のアップロードに失敗しました。");
  }
  return data.imageUrl;
}

function buildMessage_(mode, imageUrl, animated) {
  const altText = (state.text.trim().replace(/\s+/g, " ") || "画像").slice(0, 100);
  if (mode === "image") {
    return { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl };
  }
  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "kilo",
      hero: {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "fit",
        animated,
        ...(config.liffId
          ? { action: { type: "uri", label: "自分も作る", uri: `https://liff.line.me/${config.liffId}/image/` } }
          : {})
      },
      styles: { hero: { backgroundColor: "#00000000" } }
    }
  };
}

async function send_() {
  if (state.busy) return;
  if (!hasContent_()) {
    setStatus_("文字を入れるか、手書きで描いてください。", "error");
    return;
  }
  if (!state.liffReady || !liff.isApiAvailable("shareTargetPicker")) {
    setStatus_("LINEアプリ内で開くと送れます。", "error");
    return;
  }

  state.busy = true;
  els.sendButton.disabled = true;
  try {
    const { blob, animated } = await buildImage_();
    const previewUrl = URL.createObjectURL(blob);
    const mode = await chooseSendMode_(previewUrl);
    URL.revokeObjectURL(previewUrl);
    if (!mode) {
      setStatus_("送信をやめました。");
      return;
    }

    els.sendButton.textContent = "準備中...";
    setStatus_("画像を準備しています…");
    const imageUrl = await uploadImage_(blob);
    const result = await liff.shareTargetPicker([buildMessage_(mode, imageUrl, animated)], { isMultiple: true });
    setStatus_(result ? "送信しました。" : "送信をやめました。", result ? "success" : "");
  } catch (error) {
    console.error(error);
    setStatus_("送信に失敗しました。時間をおいてもう一度お試しください。", "error");
  } finally {
    state.busy = false;
    els.sendButton.disabled = !state.liffReady;
    els.sendButton.textContent = "LINEで送る";
  }
}

async function initLiff_() {
  els.sendButton.disabled = true;
  if (!config.liffId) {
    setStatus_("LIFF ID が未設定です（config.js）。画像の作成と保存は使えます。");
    return;
  }
  try {
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: true });
    state.liffReady = true;
    els.sendButton.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus_("LINEとの接続に失敗しました。LINEアプリから開き直してください。", "error");
  }
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
