// カード送信：flex-share（カード上で直接編集）と flex-builder（写真・バッジ・複数ボタン・テンプレート）の統合版
const config = window.LINE_SHARE_CONFIG || {};

const LAST_SENT_KEY = "flexshare:lastSentState";
const SEND_WARNING_DISMISSED_KEY = "flexshare:sendWarningDismissed";
const TEMPLATE_KEY = "line-share:card-templates";

// クエリから渡されたリンクは、ここにあるドメイン以外は送信時に外す
const ALLOWED_ACTION_HOSTS = ["katsuan.github.io"];
const ACTION_PROTOCOLS = ["https:", "http:", "line:", "tel:", "mailto:"];

const BUBBLE_SIZES = ["nano", "micro", "kilo", "mega", "giga"];
const MAX_BADGES = 5;
const MAX_BUTTONS = 3;
const DEFAULT_CUSTOM_COLOR = "#f59e0b";

const THEMES = {
  sunset: { label: "サンセット", start: "#F59E0B", end: "#FB7185", detailBg: "#FFF7ED", detailText: "#9A3412" },
  sky: { label: "スカイ", start: "#2563EB", end: "#06B6D4", detailBg: "#EFF6FF", detailText: "#1D4ED8" },
  leaf: { label: "リーフ", start: "#16A34A", end: "#10B981", detailBg: "#ECFDF5", detailText: "#047857" },
  berry: { label: "ベリー", start: "#E11D48", end: "#FB7185", detailBg: "#FFF1F2", detailText: "#BE123C" },
  custom: { label: "カスタム" }
};

const PRESETS = {
  emergency: {
    label: "緊急",
    description: "障害告知・営業時間変更など",
    state: {
      theme: "berry",
      headerTitle: "【緊急】重要なお知らせ",
      date: "ご確認をお願いします",
      title: "重要なご案内があります",
      detail: "詳細をご確認のうえ、必要な対応をお願いいたします。",
      badges: ["至急", "重要"],
      buttons: [{ label: "詳細を確認", url: "" }]
    }
  },
  share: {
    label: "共有",
    description: "資料共有・周知・案内など",
    state: {
      theme: "sky",
      headerTitle: "共有のお知らせ",
      date: "関係者へ展開してください",
      title: "共有用の情報をまとめました",
      detail: "必要に応じてメンバーへ展開し、内容をご確認ください。",
      badges: ["共有", "案内"],
      buttons: [{ label: "資料を見る", url: "" }]
    }
  },
  link: {
    label: "リンク誘導",
    description: "予約・商品詳細・記事など",
    state: {
      theme: "leaf",
      headerTitle: "こちらからご確認ください",
      date: "詳細ページへご案内",
      title: "詳しい内容はリンク先にまとめています",
      detail: "気になる方は下のボタンからご確認ください。",
      badges: ["LINK"],
      buttons: [{ label: "詳細ページへ", url: "" }, { label: "予約する", url: "" }]
    }
  }
};

// 写真の形。auto は写真そのものの縦横比（読み込んだときに imageRatio に入れる）
const IMAGE_SHAPES = { auto: "", wide: "20:13", square: "1:1", tall: "3:4" };
// LINE の hero 画像は「縦が横の3倍まで」
const MAX_TALL_RATIO = 3;

const BLANK_STATE = {
  theme: "sunset",
  customColor: DEFAULT_CUSTOM_COLOR,
  bubbleSize: "giga",
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
  buttons: []
};

const els = {};
let state = structuredClone(BLANK_STATE);
// クエリ由来のURL（許可ドメイン以外は送信しない）
const queryUrls = new Set();
let hasTriedShare = false;
// 端末から選んだ写真のアップロード状態（アップロード中は手元の画像でプレビューする）
const photo = { uploading: false, localUrl: "" };
let shareReady = false;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [
    "bubble", "bubbleHeader", "headerInput", "dateInput", "titleInput", "detailInput",
    "heroArea", "heroImage", "badgeRow", "buttonStack",
    "showDateToggle", "showDetailToggle", "customColorInput",
    "imageUrlInput", "imageActionUrlInput", "imageWarning",
    "photoFileInput", "photoClearButton", "photoStatus",
    "photoShapeField", "photoShapeHint", "photoFitField",
    "badgeList", "badgeInput", "addBadgeButton",
    "buttonList", "addButtonButton", "buttonWarning",
    "presetGrid", "templateNameInput", "templateSelect",
    "saveTemplateButton", "loadTemplateButton", "deleteTemplateButton",
    "copyJsonButton", "resetButton", "shareButton", "status",
    "sendWarningModal", "sendWarningDontShow", "sendWarningConfirm", "sendWarningCancel"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  const queryState = getQueryState();
  state = hydrate(queryState ?? loadJson(LAST_SENT_KEY) ?? BLANK_STATE);

  bindEvents();
  renderPresets();
  renderTemplateOptions();
  applyStateToEditor();
  render();

  window.addEventListener("resize", autoGrowAll);
  requestAnimationFrame(autoGrowAll);

  await initLiff();
}

// ---- 状態 ----

function hydrate(source = {}) {
  const legacyButton = source.showAction && (source.actionUrl || source.actionLabel)
    ? [{ label: source.actionLabel || "", url: source.actionUrl || "" }]
    : [];

  return {
    ...structuredClone(BLANK_STATE),
    ...pick(source, ["headerTitle", "date", "title", "detail", "imageUrl", "imageActionUrl"], String),
    theme: Object.hasOwn(THEMES, source.theme) ? source.theme : "sunset",
    customColor: normalizeHexColor(source.customColor),
    bubbleSize: BUBBLE_SIZES.includes(source.bubbleSize) ? source.bubbleSize : "giga",
    imageShape: Object.hasOwn(IMAGE_SHAPES, source.imageShape) ? source.imageShape : "auto",
    imageFit: source.imageFit === "fit" ? "fit" : "cover",
    imageRatio: /^\d+:\d+$/.test(source.imageRatio || "") ? source.imageRatio : "",
    showDate: source.showDate !== false,
    showDetail: source.showDetail !== false,
    badges: (Array.isArray(source.badges) ? source.badges : [])
      .map((badge) => String(badge?.text ?? badge ?? "").trim())
      .filter(Boolean)
      .slice(0, MAX_BADGES),
    buttons: (Array.isArray(source.buttons) ? source.buttons : legacyButton)
      .map((button) => ({ label: String(button?.label ?? ""), url: String(button?.url ?? button?.uri ?? "") }))
      .slice(0, MAX_BUTTONS)
  };
}

function pick(source, keys, cast) {
  const result = {};
  for (const key of keys) {
    if (source[key] != null) result[key] = cast(source[key]).trim();
  }
  return result;
}

function getQueryState() {
  const params = new URLSearchParams(location.search);
  const get = (...keys) => keys.map((key) => params.get(key)).find((value) => value != null) ?? "";
  const isOff = (key, fallback) => ["0", "false", "off"].includes(String(params.get(key) ?? fallback).toLowerCase());

  const source = {
    theme: get("theme"),
    customColor: get("customColor", "color"),
    bubbleSize: get("bubbleSize", "size"),
    headerTitle: get("headerTitle"),
    date: get("date"),
    title: get("title"),
    detail: get("detail", "content"),
    showDate: !isOff("showDate", "true"),
    showDetail: !isOff("showDetail", "true"),
    imageUrl: get("imageUrl", "image"),
    imageActionUrl: get("imageActionUrl"),
    badges: params.getAll("badge"),
    buttons: []
  };

  const actionUrl = get("actionUrl", "url");
  const actionLabel = get("actionLabel", "buttonLabel");
  if (!isOff("showAction", "false") || actionUrl) {
    source.buttons.push({ label: actionLabel, url: actionUrl });
  }

  const hasAny = [...params.keys()].some((key) => !key.startsWith("liff."));
  if (!hasAny) return null;

  [actionUrl, source.imageActionUrl].filter(Boolean).forEach((url) => queryUrls.add(url.trim()));
  return source;
}

function getEditorState() {
  return structuredClone(state);
}

// ---- 描画 ----

function applyStateToEditor() {
  els.headerInput.value = state.headerTitle;
  els.dateInput.value = state.date;
  els.titleInput.value = state.title;
  els.detailInput.value = state.detail;
  els.showDateToggle.checked = state.showDate;
  els.showDetailToggle.checked = state.showDetail;
  els.customColorInput.value = state.customColor;
  els.imageUrlInput.value = state.imageUrl;
  els.imageActionUrlInput.value = state.imageActionUrl;
  checkRadio("theme", state.theme);
  checkRadio("imageShape", state.imageShape);
  checkRadio("imageFit", state.imageFit);
  checkRadio("bubbleSize", state.bubbleSize);
  renderBadgeList();
  renderButtonList();
}

function checkRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function render() {
  const palette = getPalette();
  els.bubbleHeader.style.background = `linear-gradient(135deg, ${palette.start} 0%, ${palette.end} 100%)`;
  els.detailInput.style.background = palette.detailBg;
  els.detailInput.style.color = palette.detailText;
  els.bubble.dataset.size = state.bubbleSize;

  els.dateInput.hidden = !state.showDate;
  els.dateInput.disabled = !state.showDate;
  els.detailInput.hidden = !state.showDetail;
  els.detailInput.disabled = !state.showDetail;

  const imageUrl = photo.uploading ? photo.localUrl : state.imageUrl.trim();
  els.heroArea.hidden = !imageUrl;
  if (imageUrl && els.heroImage.getAttribute("src") !== imageUrl) {
    els.heroImage.src = imageUrl;
  }
  const hero = getHeroSpec(palette);
  els.heroImage.style.aspectRatio = hero.ratio.replace(":", " / ");
  els.heroImage.style.objectFit = hero.mode === "fit" ? "contain" : "cover";
  els.heroImage.style.background = hero.mode === "fit" ? hero.background : "";
  els.photoShapeField.hidden = !imageUrl;
  els.photoFitField.hidden = !imageUrl || state.imageShape === "auto";
  els.photoShapeHint.textContent = hero.note;
  els.photoShapeHint.hidden = !imageUrl || !hero.note;
  els.imageWarning.hidden = photo.uploading || !imageUrl || isHttpsUrl(imageUrl);
  els.photoClearButton.hidden = !imageUrl;

  els.badgeRow.replaceChildren(
    ...state.badges.map((text) => {
      const badge = document.createElement("span");
      badge.className = "bubble-badge";
      badge.style.background = palette.start;
      badge.textContent = text;
      return badge;
    })
  );
  els.badgeRow.hidden = state.badges.length === 0;

  els.buttonStack.replaceChildren(
    ...state.buttons.map((button) => {
      const item = document.createElement("div");
      const usable = Boolean(getSendableUrl(button.url));
      item.className = "bubble-action";
      item.classList.toggle("is-disabled", !usable);
      item.style.background = usable ? palette.start : "";
      item.textContent = button.label.trim() || "詳しく見る";
      return item;
    })
  );
  els.buttonStack.hidden = state.buttons.length === 0;
  els.buttonWarning.hidden = !state.buttons.some((button) => isBlockedQueryUrl(button.url));
  els.addButtonButton.disabled = state.buttons.length >= MAX_BUTTONS;
  els.addBadgeButton.disabled = state.badges.length >= MAX_BADGES;

  updateShareButtonState();
  autoGrowAll();
}

function renderBadgeList() {
  els.badgeList.replaceChildren(
    ...state.badges.map((text, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ls-chip";
      chip.textContent = `${text} ×`;
      chip.setAttribute("aria-label", `バッジ「${text}」を削除`);
      chip.addEventListener("click", () => {
        state.badges.splice(index, 1);
        renderBadgeList();
        render();
      });
      return chip;
    })
  );
}

function renderButtonList() {
  els.buttonList.replaceChildren(
    ...state.buttons.map((button, index) => {
      const row = document.createElement("div");
      row.className = "button-row";

      const label = createInput("text", button.label, "ボタン文言（例：詳しく見る）", "ボタンの文言");
      label.maxLength = 40;
      label.addEventListener("input", () => {
        state.buttons[index].label = label.value;
        render();
      });

      const url = createInput("url", button.url, "https://example.com", "ボタンのリンク先");
      url.addEventListener("input", () => {
        state.buttons[index].url = url.value;
        render();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ls-icon-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "このボタンを削除");
      remove.addEventListener("click", () => {
        state.buttons.splice(index, 1);
        renderButtonList();
        render();
      });

      row.append(label, url, remove);
      return row;
    })
  );
}

function createInput(type, value, placeholder, ariaLabel) {
  const input = document.createElement("input");
  input.type = type;
  input.className = "ls-input";
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", ariaLabel);
  if (type === "url") {
    input.inputMode = "url";
    input.autocapitalize = "off";
    input.spellcheck = false;
  }
  return input;
}

function renderPresets() {
  els.presetGrid.replaceChildren(
    ...Object.entries(PRESETS).map(([key, preset]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ls-list-item";
      button.innerHTML = `<strong></strong><small></small>`;
      button.querySelector("strong").textContent = preset.label;
      button.querySelector("small").textContent = preset.description;
      button.addEventListener("click", () => {
        state = hydrate({ ...BLANK_STATE, bubbleSize: state.bubbleSize, ...PRESETS[key].state });
        queryUrls.clear();
        applyStateToEditor();
        render();
        setStatus(`「${preset.label}」のひな形を適用しました。リンク先を入力してください。`);
      });
      return button;
    })
  );
}

function autoGrowAll() {
  for (const element of [els.titleInput, els.detailInput]) {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }
}

// ---- 色 ----

function getPalette() {
  if (state.theme !== "custom") return THEMES[state.theme];
  const base = normalizeHexColor(state.customColor);
  return {
    start: base.toUpperCase(),
    end: lightenHex(base, 0.35).toUpperCase(),
    detailBg: lightenHex(base, 0.88).toUpperCase(),
    detailText: base.toUpperCase()
  };
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : DEFAULT_CUSTOM_COLOR;
}

function lightenHex(hex, amount) {
  const num = parseInt(normalizeHexColor(hex).slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[(num >> 16) & 255, (num >> 8) & 255, num & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

// ---- URL ----

function parseUrl(value, protocols) {
  try {
    const url = new URL(String(value || "").trim());
    return protocols.includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isHttpsUrl(value) {
  return Boolean(parseUrl(value, ["https:"]));
}

function isAllowedHost(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_ACTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function isBlockedQueryUrl(value) {
  const url = String(value || "").trim();
  return Boolean(url) && queryUrls.has(url) && !isAllowedHost(url);
}

// 送信に使えるリンク。不正な形式やクエリ由来の未許可ドメインは空文字
function getSendableUrl(value) {
  if (isBlockedQueryUrl(value)) return "";
  return parseUrl(value, ACTION_PROTOCOLS);
}

// ---- 入力チェックと送信 ----

function getValidation() {
  if (photo.uploading) return { message: "写真をアップロードしています。少しお待ちください。", fieldId: "photoFileInput" };
  if (!state.headerTitle) return { message: "タイトルを入力してください。", fieldId: "headerInput" };
  if (!state.title) return { message: "本文タイトルを入力してください。", fieldId: "titleInput" };
  if (state.showDate && !state.date) {
    return { message: "サブタイトルを入力するか、表示設定でOFFにしてください。", fieldId: "dateInput" };
  }
  if (state.showDetail && !state.detail) {
    return { message: "詳細を入力するか、表示設定でOFFにしてください。", fieldId: "detailInput" };
  }
  if (state.imageUrl && !isHttpsUrl(state.imageUrl)) {
    return { message: "写真のURLは https:// から始まる公開URLを入力してください。", fieldId: "imageUrlInput" };
  }
  if (state.imageActionUrl && !getSendableUrl(state.imageActionUrl) && !isBlockedQueryUrl(state.imageActionUrl)) {
    return { message: "写真タップ時のURLの形式が正しくありません。", fieldId: "imageActionUrlInput" };
  }
  const brokenIndex = state.buttons.findIndex(
    (button) => !button.url.trim() || (!getSendableUrl(button.url) && !isBlockedQueryUrl(button.url))
  );
  if (brokenIndex >= 0) {
    return {
      message: "ボタンのリンク先を http(s)・tel・mailto・line のいずれかで入力するか、ボタンを削除してください。",
      fieldId: null,
      focus: () => els.buttonList.querySelectorAll("input[type=url]")[brokenIndex]?.focus()
    };
  }
  return { message: "" };
}

function updateShareButtonState() {
  const { message } = getValidation();
  els.shareButton.disabled = !shareReady;
  els.shareButton.classList.toggle("is-incomplete", Boolean(message));

  if (!shareReady) return;
  setStatus(message || "送信後は修正できません。", Boolean(message) && hasTriedShare);
}

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.classList.toggle("is-error", isError);
}

function buildFlexMessage() {
  const palette = getPalette();
  const headerContents = [
    { type: "text", text: state.headerTitle, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }
  ];
  if (state.showDate && state.date) {
    headerContents.push({ type: "text", text: state.date, color: "#FFFFFF", size: "xs", margin: "sm", wrap: true });
  }

  const bodyContents = [
    { type: "text", text: state.title, size: "xl", weight: "bold", color: "#111827", wrap: true }
  ];

  if (state.badges.length > 0) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: state.badges.map((text) => ({
        type: "box",
        layout: "vertical",
        backgroundColor: palette.start,
        cornerRadius: "999px",
        paddingAll: "xs",
        paddingStart: "md",
        paddingEnd: "md",
        flex: 0,
        contents: [{ type: "text", text, size: "xs", color: "#FFFFFF", weight: "bold", flex: 0 }]
      }))
    });
  }

  if (state.showDetail && state.detail) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      backgroundColor: palette.detailBg,
      cornerRadius: "12px",
      contents: [{ type: "text", text: state.detail, size: "sm", color: palette.detailText, wrap: true }]
    });
  }

  const bubble = {
    type: "bubble",
    size: state.bubbleSize,
    header: {
      type: "box",
      layout: "vertical",
      background: { type: "linearGradient", angle: "135deg", startColor: palette.start, endColor: palette.end },
      paddingAll: "16px",
      contents: headerContents
    },
    body: { type: "box", layout: "vertical", spacing: "md", contents: bodyContents }
  };

  if (state.imageUrl) {
    const hero = getHeroSpec(palette);
    bubble.hero = {
      type: "image",
      url: state.imageUrl,
      size: "full",
      aspectRatio: hero.ratio,
      aspectMode: hero.mode,
      ...(hero.mode === "fit" ? { backgroundColor: hero.background } : {})
    };
    const imageAction = getSendableUrl(state.imageActionUrl);
    if (imageAction) {
      bubble.hero.action = { type: "uri", uri: imageAction };
    }
  }

  const buttons = state.buttons
    .map((button) => ({ label: button.label.trim() || "詳しく見る", uri: getSendableUrl(button.url) }))
    .filter((button) => button.uri);
  if (buttons.length > 0) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons.map((button) => ({
        type: "button",
        style: "primary",
        color: palette.start,
        action: { type: "uri", label: button.label.slice(0, 40), uri: button.uri }
      }))
    };
  }

  return {
    type: "flex",
    altText: `${state.headerTitle}: ${state.title}`.slice(0, 400),
    contents: bubble
  };
}

async function share() {
  if (!window.liff || !liff.isApiAvailable("shareTargetPicker")) {
    setStatus("LINE アプリ内で開いてください。", true);
    return;
  }

  const validation = getValidation();
  if (validation.message) {
    hasTriedShare = true;
    setStatus(validation.message, true);
    focusField(validation);
    return;
  }

  if (!(await confirmSendWarning())) {
    setStatus("送信をキャンセルしました。");
    return;
  }

  try {
    setStatus("共有先を開いています…");
    const message = window.LineShareCredit.withCredit(buildFlexMessage());
    const result = await liff.shareTargetPicker([message], { isMultiple: true });

    if (!result) {
      setStatus("共有はキャンセルされました。");
      return;
    }

    saveJson(LAST_SENT_KEY, getEditorState());
    setStatus("共有しました。");
    if (liff.isInClient()) {
      setTimeout(() => liff.closeWindow(), 600);
    }
  } catch (error) {
    console.error(error);
    setStatus("共有に失敗しました。時間をおいて再度お試しください。", true);
  }
}

function focusField(validation) {
  if (validation.focus) {
    document.getElementById("linkSettings").open = true;
    validation.focus();
    return;
  }
  const field = document.getElementById(validation.fieldId);
  if (!field) return;
  field.closest("details")?.setAttribute("open", "");
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  field.focus({ preventScroll: true });
}

function confirmSendWarning() {
  if (localStorageGet(SEND_WARNING_DISMISSED_KEY) === "true") {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const close = (result) => {
      els.sendWarningModal.hidden = true;
      els.sendWarningConfirm.removeEventListener("click", onConfirm);
      els.sendWarningCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => {
      if (els.sendWarningDontShow.checked) {
        localStorageSet(SEND_WARNING_DISMISSED_KEY, "true");
      }
      close(true);
    };
    const onCancel = () => close(false);

    els.sendWarningDontShow.checked = false;
    els.sendWarningConfirm.addEventListener("click", onConfirm);
    els.sendWarningCancel.addEventListener("click", onCancel);
    els.sendWarningModal.hidden = false;
    els.sendWarningConfirm.focus();
  });
}

async function initLiff() {
  if (location.protocol === "file:") {
    setStatus("ローカルプレビュー中です。共有確認は GitHub Pages など https 上で行ってください。");
    return;
  }
  if (!config.liffId) {
    setStatus("LIFF ID が未設定です（リポジトリ直下の config.js）。カードの作成とJSONコピーは使えます。", true);
    return;
  }
  try {
    await liff.init({ liffId: config.liffId });
    shareReady = true;
    els.shareButton.addEventListener("click", share);
  } catch (error) {
    console.error(error);
    setStatus("LIFF の初期化に失敗しました。", true);
  }
  updateShareButtonState();
}

// ---- 写真の形 ----

/**
 * カードの写真の縦横比と収め方を決める。
 * 「元のまま」は写真の比率をそのまま使うので切れない（縦が横の3倍を超える分だけ上下を切る）。
 */
function getHeroSpec(palette) {
  const background = palette.detailBg;
  if (state.imageShape !== "auto") {
    const mode = state.imageFit === "fit" ? "fit" : "cover";
    const note =
      mode === "cover"
        ? "はみ出した部分は切り取られます（中央が残ります）。"
        : "写真全体が入り、余白はカードの色で埋まります。";
    return { ratio: IMAGE_SHAPES[state.imageShape], mode, background, note };
  }

  const [width, height] = (state.imageRatio || "20:13").split(":").map(Number);
  if (height > width * MAX_TALL_RATIO) {
    return {
      ratio: `${width}:${width * MAX_TALL_RATIO}`,
      mode: "cover",
      background,
      note: "縦にとても長い写真のため、LINEの上限に合わせて上下を少し切り取ります。"
    };
  }
  return { ratio: `${width}:${height}`, mode: "cover", background, note: "" };
}

// 写真を読み込んだら縦横比を覚えておく（URL の写真でも使える）
function rememberImageRatio() {
  const { naturalWidth: width, naturalHeight: height } = els.heroImage;
  if (!width || !height) return;
  const ratio = `${width}:${height}`;
  if (state.imageRatio !== ratio) {
    state.imageRatio = ratio;
    render();
  }
}

// ---- 端末の写真 ----

const PHOTO_MAX_SIDE = 1200;

async function uploadPhoto(file) {
  if (!file.type.startsWith("image/")) {
    setPhotoStatus("画像ファイルを選んでください。", true);
    return;
  }
  const base = String(config.imageApiBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    setPhotoStatus("写真のアップロード先が未設定です（config.js の imageApiBaseUrl）。", true);
    return;
  }

  try {
    const dataUrl = await resizePhoto(file);
    photo.uploading = true;
    photo.localUrl = dataUrl;
    setPhotoStatus("アップロードしています…（初回は30秒ほどかかることがあります）");
    render();

    const response = await fetch(`${base}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: dataUrl })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !isHttpsUrl(data.imageUrl)) {
      console.error("photo upload failed", response.status, data);
      throw new Error("upload failed");
    }

    state.imageUrl = data.imageUrl;
    state.imageRatio = "";
    els.imageUrlInput.value = data.imageUrl;
    setPhotoStatus("写真を入れました。");
  } catch (error) {
    console.error(error);
    setPhotoStatus("写真をアップロードできませんでした。時間をおいてもう一度お試しください。", true);
  } finally {
    photo.uploading = false;
    photo.localUrl = "";
    render();
  }
}

// 長い辺を 1200px までに縮めて JPEG にする（アップロードを軽くし、カードに十分な大きさを保つ）
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした。"));
    };
    img.src = url;
  });
}

function setPhotoStatus(message, isError = false) {
  els.photoStatus.textContent = message;
  els.photoStatus.hidden = !message;
  els.photoStatus.classList.toggle("is-error", isError);
}

// ---- テンプレート ----

function getTemplates() {
  const templates = loadJson(TEMPLATE_KEY);
  return Array.isArray(templates) ? templates : [];
}

function renderTemplateOptions() {
  const options = getTemplates().map((template) => {
    const option = document.createElement("option");
    option.value = template.name;
    option.textContent = template.name;
    return option;
  });
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "保存済みテンプレート";
  els.templateSelect.replaceChildren(placeholder, ...options);
}

function saveTemplate() {
  const name = els.templateNameInput.value.trim();
  if (!name) {
    setStatus("テンプレート名を入力してください。", true);
    return;
  }
  const templates = getTemplates().filter((template) => template.name !== name);
  templates.push({ name, state: getEditorState(), savedAt: new Date().toISOString() });
  saveJson(TEMPLATE_KEY, templates);
  renderTemplateOptions();
  els.templateSelect.value = name;
  els.templateNameInput.value = "";
  setStatus(`テンプレート「${name}」を保存しました。`);
}

function loadTemplate() {
  const template = getTemplates().find((item) => item.name === els.templateSelect.value);
  if (!template) {
    setStatus("テンプレートを選択してください。", true);
    return;
  }
  state = hydrate(template.state);
  queryUrls.clear();
  applyStateToEditor();
  render();
  setStatus(`テンプレート「${template.name}」を読み込みました。`);
}

function deleteTemplate() {
  const name = els.templateSelect.value;
  if (!name) {
    setStatus("テンプレートを選択してください。", true);
    return;
  }
  if (!confirm(`テンプレート「${name}」を削除しますか？`)) return;
  saveJson(TEMPLATE_KEY, getTemplates().filter((template) => template.name !== name));
  renderTemplateOptions();
  setStatus(`テンプレート「${name}」を削除しました。`);
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildFlexMessage(), null, 2));
    setStatus("Flex Message の JSON をコピーしました。");
  } catch (error) {
    console.error(error);
    setStatus("コピーできませんでした。", true);
  }
}

// ---- イベント ----

function bindEvents() {
  const textFields = [
    ["headerInput", "headerTitle"],
    ["dateInput", "date"],
    ["titleInput", "title"],
    ["detailInput", "detail"],
    ["imageUrlInput", "imageUrl"],
    ["imageActionUrlInput", "imageActionUrl"]
  ];
  for (const [id, key] of textFields) {
    els[id].addEventListener("input", () => {
      state[key] = els[id].value.trim();
      if (key === "imageUrl") state.imageRatio = "";
      render();
    });
  }

  els.showDateToggle.addEventListener("change", () => {
    state.showDate = els.showDateToggle.checked;
    render();
  });
  els.showDetailToggle.addEventListener("change", () => {
    state.showDetail = els.showDetailToggle.checked;
    render();
  });

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.theme = input.value;
      render();
    });
  });
  els.customColorInput.addEventListener("input", () => {
    state.customColor = normalizeHexColor(els.customColorInput.value);
    state.theme = "custom";
    checkRadio("theme", "custom");
    render();
  });
  document.querySelectorAll('input[name="bubbleSize"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.bubbleSize = input.value;
      render();
    });
  });

  document.querySelectorAll('input[name="imageShape"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.imageShape = input.value;
      render();
    });
  });
  document.querySelectorAll('input[name="imageFit"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.imageFit = input.value;
      render();
    });
  });

  els.photoFileInput.addEventListener("change", () => {
    const file = els.photoFileInput.files?.[0];
    els.photoFileInput.value = "";
    if (file) uploadPhoto(file);
  });
  els.photoClearButton.addEventListener("click", () => {
    state.imageUrl = "";
    state.imageRatio = "";
    els.imageUrlInput.value = "";
    setPhotoStatus("");
    render();
  });

  els.heroImage.addEventListener("error", () => {
    if (photo.uploading) return;
    els.imageWarning.hidden = false;
    els.imageWarning.textContent = "写真を読み込めませんでした。URLを確認してください。";
  });
  els.heroImage.addEventListener("load", () => {
    rememberImageRatio();
    els.imageWarning.textContent = "写真のURLは https:// から始まる公開URLを入力してください。";
    els.imageWarning.hidden = isHttpsUrl(state.imageUrl);
  });

  const addBadge = () => {
    const text = els.badgeInput.value.trim();
    if (!text || state.badges.length >= MAX_BADGES) return;
    if (!state.badges.includes(text)) state.badges.push(text);
    els.badgeInput.value = "";
    renderBadgeList();
    render();
  };
  els.addBadgeButton.addEventListener("click", addBadge);
  els.badgeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      addBadge();
    }
  });

  els.addButtonButton.addEventListener("click", () => {
    if (state.buttons.length >= MAX_BUTTONS) return;
    state.buttons.push({ label: "", url: "" });
    renderButtonList();
    render();
    els.buttonList.querySelector(".button-row:last-child input")?.focus();
  });

  els.saveTemplateButton.addEventListener("click", saveTemplate);
  els.loadTemplateButton.addEventListener("click", loadTemplate);
  els.deleteTemplateButton.addEventListener("click", deleteTemplate);
  els.copyJsonButton.addEventListener("click", copyJson);

  const resetLabel = els.resetButton.textContent;
  let resetTimer = null;
  els.resetButton.addEventListener("click", () => {
    if (resetTimer === null) {
      els.resetButton.textContent = "もう一度タップでリセット";
      resetTimer = setTimeout(() => {
        els.resetButton.textContent = resetLabel;
        resetTimer = null;
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    els.resetButton.textContent = resetLabel;
    hasTriedShare = false;
    state = structuredClone(BLANK_STATE);
    queryUrls.clear();
    localStorageRemove(LAST_SENT_KEY);
    applyStateToEditor();
    render();
    setStatus("入力をリセットしました。");
  });

  // カード上の1行入力は Enter で次の欄へ
  const chain = ["headerInput", "dateInput", "titleInput"];
  chain.forEach((id, index) => {
    els[id].enterKeyHint = "next";
    els[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || els[id].tagName === "TEXTAREA") return;
      event.preventDefault();
      const next = chain.slice(index + 1).map((nextId) => els[nextId]).find((field) => !field.disabled);
      (next || els[id]).focus();
      if (!next) els[id].blur();
    });
  });
}

// ---- localStorage（使えない環境でも落ちないように） ----

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(error);
  }
}

function localStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(error);
  }
}

function loadJson(key) {
  try {
    return JSON.parse(localStorageGet(key) || "null");
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  localStorageSet(key, JSON.stringify(value));
}
