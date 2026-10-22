// 文字アイコン（TextIconSender）と手書き（LIFF Draw Send）の統合版。画面・手書きの操作・送信・送った画像。
// 文字と手書きを1枚に重ねられ、縁取り・背景・動きは両方に共通でかかる。
// 決まった値は constants.js、描く処理は draw.js、送るメッセージの組み立ては message.js。
import { MOTIONS, buildAnimationBlob, canvasToBlob, computeMotionTransform } from "./apng.js?v=202610230122";
import { addSent, deleteSent, listSent, restoreSent } from "./history.js?v=202610230122";

import {
  ANIMATION_LONG_SIDE, BACKGROUNDS, BASE, BASIC_BACKGROUNDS, BASIC_COLORS, BUBBLE_SIZES, DEFAULT_PREFS, FONTS, HUES,
  LONG_SIDE, OUTLINES, OUTLINE_COLORS, OUTLINE_WIDTHS, PEN_SIZES, PEN_SIZE_MAX, PEN_SIZE_MIN, PREFS_KEY, SHAPES
} from "./constants.js?v=202610230122";
import { buildLayer, compose, dims, fontOf, needsWebFont } from "./draw.js?v=202610230122";
import { buildMessage } from "./message.js?v=202610230122";

const config = window.LINE_SHARE_CONFIG || {};
// よく使う文字は data/templates.json の text（開いたあとに読み込む）

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

// ---- 描画（中身は draw.js） ----

// 手書き風の書体は読み込みに時間がかかるので、使う文字の分を読み込んでから描き直す
// （canvas は読み込み前だと代わりの書体で描いてしまう）
async function loadWebFont_() {
  if (!needsWebFont(state) || !document.fonts) return;
  try {
    await document.fonts.load(fontOf(state, 48), state.text || "あ");
  } catch {
    // 読み込めなくても代わりの書体で描ける
  }
}

// 描く前に呼ぶ。まだ読み込まれていなければ読み込み、終わったら描き直す（読み込み済みなら何もしない）
let fontLoading = "";
function ensureWebFont_() {
  if (!needsWebFont(state) || !document.fonts) return;
  const key = `${fontOf(state, 48)}|${state.text}`;
  if (fontLoading === key || document.fonts.check(fontOf(state, 48), state.text || "あ")) return;
  fontLoading = key;
  loadWebFont_().then(() => {
    if (fontLoading === key) fontLoading = "";
    restartPreview_();
  });
}

// プレビュー用の layer は内容が変わったときだけ作り直し、アニメーション中は使い回す
let previewLayer = null;

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  ensureWebFont_();
  requestAnimationFrame(() => {
    renderQueued = false;
    const { width, height } = dims(state, LONG_SIDE);
    previewLayer = buildLayer(state, width, height);
    if (!isPreviewMoving_()) {
      compose(state, els.canvas.getContext("2d"), width, height, previewLayer);
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
  const { width, height } = dims(state, LONG_SIDE);
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  els.canvasFrame.style.aspectRatio = `${width} / ${height}`;
  const ctx = els.canvas.getContext("2d");
  previewLayer = buildLayer(state, width, height);
  if (!isPreviewMoving_()) {
    compose(state, ctx, width, height, previewLayer);
    return;
  }
  const start = performance.now();
  const loop = (now) => {
    const t = ((now - start) % 900) / 900;
    compose(state, ctx, width, height, previewLayer, computeMotionTransform(state.motion, t, width, height));
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
  return "💬 LINEで送る";
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

// 聞かずに消して、トーストの「元に戻す」で戻せるようにする（docs/ux.md D1）
function clearText_() {
  if (!state.text) return;
  const before = state.text;
  state.text = "";
  onChange_();
  window.LineShareUI.toast(state.mode === "draw" ? "文字を消しました（手書きは残っています）" : "文字を消しました", {
    actionLabel: "元に戻す",
    onAction: () => {
      state.text = before;
      onChange_();
    }
  });
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
    const before = state.strokes;
    state.strokes = [];
    updateUndo_();
    requestRender();
    window.LineShareUI.toast("手書きを消しました", {
      actionLabel: "元に戻す",
      onAction: () => {
        pushUndo_();
        state.strokes = before;
        updateUndo_();
        requestRender();
      }
    });
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
    const { width, height } = dims(state, LONG_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    compose(state, canvas.getContext("2d"), width, height, buildLayer(state, width, height));
    return { blob: await canvasToBlob(canvas), width, height, animated: false };
  }
  const { width, height } = dims(state, ANIMATION_LONG_SIDE);
  const layer = buildLayer(state, width, height);
  const { blob, oversized } = await buildAnimationBlob({
    width,
    height,
    preset: state.motion,
    renderFrame: (ctx, transform) => compose(state, ctx, width, height, layer, transform)
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

    els.sendButton.textContent = "準備中…";
    // 画像の保存は30秒前後かかることがあるので、経過秒数と理由を出す（shared/ui.js）
    const stopProgress = window.LineShareUI.progress("画像を保存しています", (text) => setStatus_(text));
    let imageUrl;
    try {
      imageUrl = await uploadImage_(item.blob);
    } finally {
      stopProgress();
    }
    setStatus_("");
    const message = window.LineShareCredit?.withCredit(buildMessage(mode, imageUrl, item)) ?? buildMessage(mode, imageUrl, item);
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
      // 聞かずに消して、トーストの「元に戻す」で戻せるようにする（docs/ux.md D1）
      remove.addEventListener("click", async () => {
        await deleteSent(item.id);
        renderHistory_();
        window.LineShareUI.toast("送った画像を履歴から消しました", {
          actionLabel: "元に戻す",
          onAction: async () => {
            await restoreSent(item);
            renderHistory_();
          }
        });
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
