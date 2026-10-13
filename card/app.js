// カード送信：flex-share（カード上で直接編集）と flex-builder（写真・バッジ・複数ボタン・テンプレート）の統合版
const config = window.LINE_SHARE_CONFIG || {};

const LAST_SENT_KEY = "flexshare:lastSentState";
const SEND_WARNING_DISMISSED_KEY = "flexshare:sendWarningDismissed";
const TEMPLATE_KEY = "line-share:card-templates";

// クエリから渡されたリンクは、ここにあるドメイン以外は送信時に外す
const ALLOWED_ACTION_HOSTS = ["katsuan.github.io"];
const ACTION_PROTOCOLS = ["https:", "http:", "line:", "tel:", "mailto:"];

// LINE Flex Message の bubble.size（小さい順）。指定しないときの LINE の標準は mega
const BUBBLE_SIZES = ["nano", "micro", "deca", "hecto", "kilo", "mega", "giga"];
const MAX_BADGES = 5;
const MAX_BUTTONS = 3;
// 横スクロール（カルーセル）で送れるカードの枚数。LINE の上限（12枚）まで
const MAX_CARDS = 12;
// カードの種類。投票は候補をボタンで、チェックリストは項目を □ 付きで並べる
const KINDS = {
  notice: { label: "📣 お知らせ" },
  vote: { label: "🗳️ 投票", item: "候補", min: 2, max: 10, list: true },
  checklist: { label: "✅ チェックリスト", item: "項目", min: 1, max: 20, list: true },
  ticket: { label: "🎫 チケット" },
  coupon: { label: "🎟️ クーポン" }
};
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

function replaceTop(value) {
  if (typeof value === "string") return value.replaceAll("{top}", TOP_URL);
  if (Array.isArray(value)) return value.map(replaceTop);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceTop(v)]));
  return value;
}

async function loadPresets() {
  const { card } = await window.LineShareUI.loadTemplates();
  PRESETS = Object.fromEntries((Array.isArray(card) ? card : []).filter((preset) => preset?.state).map((preset, index) => [preset.key || `preset${index}`, replaceTop(preset)]));
  renderTemplates();
}

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
  coupon: { offer: "", code: "", expiry: "" }
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

document.addEventListener("DOMContentLoaded", init);

// 「カラー」の丸を共通の並びで作る（最後の「ほかの色」は HTML にある）
function renderThemeSwatches() {
  const placeholder = document.getElementById("themeSwatches");
  placeholder.replaceWith(
    ...window.LineShareUI.PALETTE.map((color) => {
      const label = document.createElement("label");
      label.className = "ls-swatch";
      label.style.setProperty("--swatch", `linear-gradient(135deg, ${color.start}, ${color.end})`);
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "theme";
      input.value = color.key;
      const name = document.createElement("span");
      name.className = "ls-sr-only";
      name.textContent = color.label;
      label.append(input, name);
      return label;
    })
  );
}

async function init() {
  renderThemeSwatches();
  [
    "bubble", "bubbleHeader", "headerInput", "dateInput", "titleInput", "detailInput",
    "heroArea", "heroImage", "badgeRow", "buttonStack",
    "showDateToggle", "showDetailToggle", "customColorInput",
    "imageUrlInput", "imageActionUrlInput", "imageWarning",
    "photoFileInput", "photoClearButton", "photoStatus",
    "photoShapeField", "photoShapeHint", "photoFitField",
    "badgeAddButton",
    "buttonList", "addButtonButton", "buttonWarning",
    "presetGrid", "templateList", "templateNameInput", "saveTemplateButton",
    "lookMeta", "photoMeta", "linkMeta",
    "dateRow", "detailRow", "bubbleSizeRange", "bubbleSizeLabel",
    "copyJsonButton", "resetButton", "shareButton", "status",
    "cardTabs", "cardAddButton", "cardRemoveButton", "cardStage", "peekPrev", "peekNext",
    "kindChips", "itemsArea", "itemAddButton", "doneButton",
    "ticketArea", "routeFrom", "routeFromSub", "routeTo", "routeToSub", "pairsArea", "pairAddButton",
    "couponArea", "couponOffer", "couponCode", "couponExpiry",
    "sendWarningModal", "sendWarningDontShow", "sendWarningConfirm", "sendWarningCancel"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  const queryState = getQueryState();
  const saved = loadJson(LAST_SENT_KEY);
  // 前に送った内容は、複数枚（{ cards }）か、1枚だけの古い形のどちらか
  cards = queryState
    ? [hydrate(queryState)]
    : Array.isArray(saved?.cards) && saved.cards.length
      ? saved.cards.slice(0, MAX_CARDS).map(hydrate)
      : [hydrate(saved ?? BLANK_STATE)];
  // 大きさは全カードでそろえる（カルーセルのカードは同じ大きさにする）
  cards.forEach((card) => (card.bubbleSize = cards[0].bubbleSize));
  current = 0;
  state = cards[0];

  bindEvents();
  renderTemplates();
  loadPresets();
  applyStateToEditor();
  render();

  window.addEventListener("resize", () => {
    autoGrowAll();
    renderPeeks();
  });
  requestAnimationFrame(renderPeeks);
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
    theme: Object.hasOwn(THEMES, source.theme) ? source.theme : "purple",
    customColor: normalizeHexColor(source.customColor),
    bubbleSize: BUBBLE_SIZES.includes(source.bubbleSize) ? source.bubbleSize : "mega",
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
      .slice(0, MAX_BUTTONS),
    kind: Object.hasOwn(KINDS, source.kind) ? source.kind : "notice",
    items: (Array.isArray(source.items) ? source.items : []).map((item) => String(item ?? "").trim()).slice(0, 20),
    doneLabel: String(source.doneLabel ?? "").trim() || DEFAULT_DONE_LABEL,
    route: Object.fromEntries(["from", "fromSub", "to", "toSub"].map((key) => [key, String(source.route?.[key] ?? "").trim()])),
    pairs: (Array.isArray(source.pairs) ? source.pairs : [])
      .map((pair) => ({ label: String(pair?.label ?? "").trim(), value: String(pair?.value ?? "").trim() }))
      .slice(0, MAX_PAIRS),
    coupon: Object.fromEntries(["offer", "code", "expiry"].map((key) => [key, String(source.coupon?.[key] ?? "").trim()]))
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
    buttons: [],
    kind: get("kind"),
    items: params.getAll("item")
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

// ---- 複数枚（カルーセル） ----

// state を差し替えたあと（テンプレートなど）に、並びの中身も合わせる
function storeCurrent() {
  cards[current] = state;
}

// card を一時的に編集中のカードとして fn を呼ぶ（検証や送るカードの組み立てを、どのカードにも使えるように）
function withCard(card, fn) {
  const editing = state;
  state = card;
  try {
    return fn();
  } finally {
    state = editing;
  }
}

function switchCard(index) {
  storeCurrent();
  if (index < 0 || index >= cards.length || index === current) {
    renderCardTabs();
    return;
  }
  current = index;
  state = cards[current];
  applyStateToEditor();
  render();
  requestAnimationFrame(() => {
    autoGrowAll();
    renderPeeks();
  });
}

// 新しいカードは今のカードの色・大きさ・見出しを引き継いで、すぐうしろに足す
function addCard() {
  if (cards.length >= MAX_CARDS) return;
  storeCurrent();
  const next = hydrate({
    theme: state.theme,
    customColor: state.customColor,
    bubbleSize: state.bubbleSize,
    headerTitle: state.headerTitle,
    date: state.date,
    showDate: state.showDate,
    showDetail: false
  });
  cards.splice(current + 1, 0, next);
  switchCard(current + 1);
  // 隣のカードを作り直したあと（switchCard の中の次のフレーム）で入力に移る
  requestAnimationFrame(() => els.titleInput.focus());
  setStatus(`カード${current + 1}を足しました。`);
}

function removeCard() {
  if (cards.length <= 1) return;
  if (!confirm(`カード${current + 1}を消しますか？`)) return;
  cards.splice(current, 1);
  current = Math.min(current, cards.length - 1);
  state = cards[current];
  applyStateToEditor();
  render();
  renderPeeks();
  setStatus("カードを消しました。");
}

// 隣のカード（左右に端だけ見せる）の絵を作る。編集中のカードの画面を一時的にそのカードにして写し取り、元に戻す。
// 切り替え・足す・消す・大きさを変えたときだけ作り直す（入力中は作り直さない）
function snapshotCard(index) {
  const editing = state;
  state = cards[index];
  applyStateToEditor();
  render();
  const clone = els.bubble.cloneNode(true);
  // 入力欄の中身は写し取られないので、文字として入れ直す
  const sources = els.bubble.querySelectorAll("input, textarea");
  clone.querySelectorAll("input, textarea").forEach((field, i) => {
    field.setAttribute("value", sources[i]?.value ?? "");
    if (field.tagName === "TEXTAREA") field.textContent = sources[i]?.value ?? "";
    field.style.height = sources[i]?.style.height || "";
    field.tabIndex = -1;
  });
  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  clone.removeAttribute("id");
  clone.querySelectorAll("button, [tabindex]").forEach((element) => element.setAttribute("tabindex", "-1"));
  state = editing;
  return clone;
}

function renderPeeks() {
  const multiple = cards.length > 1;
  els.cardStage.classList.toggle("has-peek", multiple);
  // 入力中（キーボードが開いて画面の大きさが変わったときなど）は作り直さず、幅だけ合わせる
  const typing = document.activeElement && document.activeElement !== document.body && els.cardStage.contains(document.activeElement);
  if (typing) {
    const width = `${els.bubble.getBoundingClientRect().width}px`;
    els.peekPrev.style.width = els.peekNext.style.width = width;
    return;
  }
  const neighbors = [
    [els.peekPrev, current - 1],
    [els.peekNext, current + 1]
  ];
  const snapshots = neighbors.map(([, index]) => (multiple && index >= 0 && index < cards.length ? snapshotCard(index) : null));
  // 写し取りのあとで、編集中のカードの画面に戻す
  if (snapshots.some(Boolean)) {
    applyStateToEditor();
    render();
  }
  const width = `${els.bubble.getBoundingClientRect().width}px`;
  neighbors.forEach(([peek], i) => {
    peek.hidden = !snapshots[i];
    peek.replaceChildren(...(snapshots[i] ? [snapshots[i]] : []));
    peek.style.width = width;
  });
}

function renderCardTabs() {
  els.cardTabs.replaceChildren(
    ...cards.map((card, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "card-tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(index === current));
      tab.setAttribute("aria-label", `カード${index + 1}${card.headerTitle ? `「${card.headerTitle}」` : ""}`);
      tab.textContent = String(index + 1);
      tab.addEventListener("click", () => switchCard(index));
      return tab;
    })
  );
  els.cardAddButton.hidden = cards.length >= MAX_CARDS;
  els.cardRemoveButton.hidden = cards.length <= 1;
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
  els.bubbleSizeRange.value = String(BUBBLE_SIZES.indexOf(state.bubbleSize));
  els.bubbleSizeLabel.textContent = state.bubbleSize;
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

  renderBadgePreview(palette);
  renderItemsPreview(palette);

  els.buttonStack.replaceChildren(
    ...state.buttons.map((button) => {
      const item = document.createElement("div");
      const usable = Boolean(getSendableUrl(button.url));
      item.className = "bubble-action is-jump";
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.setAttribute("aria-label", `ボタン「${button.label.trim() || "詳しく見る"}」を編集`);
      item.classList.toggle("is-disabled", !usable);
      item.style.background = usable ? palette.start : "";
      item.textContent = button.label.trim() || "詳しく見る";
      return item;
    })
  );
  els.buttonStack.hidden = state.buttons.length === 0;
  els.buttonWarning.hidden = !state.buttons.some((button) => isBlockedQueryUrl(button.url));
  els.addButtonButton.disabled = state.buttons.length >= MAX_BUTTONS;
  updateFoldMeta();
  renderCardTabs();
  window.LineShareUI.syncOptionals();

  updateShareButtonState();
  autoGrowAll();
}

// アコーディオンの見出しの右に、今の設定を短く出す（ほかのツールとそろえる）
function updateFoldMeta() {
  const count = (n) => (n ? `${n}個` : "なし");
  els.lookMeta.textContent = `${THEMES[state.theme]?.label || "カスタム"}・${state.bubbleSize}`;
  els.photoMeta.textContent = state.imageUrl.trim() || photo.uploading ? "あり" : "なし";
  els.linkMeta.textContent = count(state.buttons.length);
}

// バッジはプレビューで直接編集する。タップで文字を直し、編集中のバッジにだけ × が出る。「＋ バッジ」で増やす（最大5つ）
function renderBadgePreview(palette) {
  const editing = els.badgeRow.contains(document.activeElement);
  const items = els.badgeRow.querySelectorAll(".bubble-badge");
  if (editing && items.length === state.badges.length) {
    // 入力中は作り直さない（文字の入力が途切れないように）。色だけ合わせる
    items.forEach((item) => (item.style.background = palette.start));
  } else {
    els.badgeRow.replaceChildren(...state.badges.map((text, index) => createBadge(text, index, palette)));
  }
  els.badgeRow.hidden = state.badges.length === 0;
  els.badgeAddButton.hidden = state.badges.length >= MAX_BADGES;
}

function createBadge(text, index, palette) {
  const badge = document.createElement("span");
  badge.className = "bubble-badge";
  badge.style.background = palette.start;

  const field = document.createElement("span");
  field.className = "bubble-badge-text";
  field.contentEditable = "true";
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-label", `バッジ${index + 1}`);
  field.dataset.placeholder = "バッジ";
  field.textContent = text;
  field.addEventListener("input", () => {
    // 1行・12文字まで（改行や貼り付けた書式は消す）
    const value = field.textContent.replace(/\s+/g, " ").slice(0, 12);
    if (field.textContent !== value) field.textContent = value;
    state.badges[index] = value.trim();
    render();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      field.blur();
    }
  });
  // 空のまま離れたら消す
  field.addEventListener("blur", () => {
    if (state.badges[index] === "") {
      state.badges.splice(index, 1);
      render();
    }
  });

  const remove = removeOnEdit(`バッジ「${text}」を消す`, () => {
    state.badges.splice(index, 1);
    render();
  });

  badge.append(field, remove);
  return badge;
}

// ---- 投票・チェックリスト ----

// 1行の頭の記号（□・-・1. など）を外す。貼り付けた一覧を項目に分けるときに使う
function cleanItem(line) {
  return line.replace(/^\s*(?:[□☐■☑✓✔✅\-−ー・*•]|\d+[.)．、])\s*/u, "").trim();
}

// 複数行を貼ったら1行ずつ項目にする。1行目が記号なしで、本文タイトルが空なら、それをタイトルにする
function splitPasted(text, index) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const markers = /^\s*(?:[□☐■☑✓✔✅\-−ー・*•]|\d+[.)．、])/u;
  if (!state.title && !markers.test(lines[0]) && lines.slice(1).some((line) => markers.test(line))) {
    state.title = lines.shift();
    els.titleInput.value = state.title;
  }
  const max = KINDS[state.kind].max;
  state.items.splice(index, 1, ...lines.map(cleanItem).filter(Boolean));
  state.items = state.items.slice(0, max);
  return true;
}

function renderKindChips() {
  els.kindChips.replaceChildren(
    ...Object.entries(KINDS).map(([key, kind]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ls-chip is-small";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(state.kind === key));
      chip.classList.toggle("is-active", state.kind === key);
      chip.textContent = kind.label;
      chip.addEventListener("click", () => setKind(key));
      return chip;
    })
  );
}

function setKind(kind) {
  if (state.kind === kind) return;
  state.kind = kind;
  // 候補・項目が足りなければ空の欄を用意して、すぐ入力できるように
  if (KINDS[kind].list) {
    while (state.items.length < KINDS[kind].min) state.items.push("");
  }
  if (kind === "ticket" && state.pairs.length === 0) {
    state.pairs = [{ label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" }];
  }
  render();
  if (KINDS[kind].list) els.itemsArea.querySelector("input")?.focus();
  if (kind === "ticket") els.routeFrom.focus();
  if (kind === "coupon") els.couponOffer.focus();
}

// 投票の候補・チェックリストの項目をプレビューの中で直接編集する（入力中は作り直さない）
function renderItemsPreview(palette) {
  renderKindChips();
  renderTicketPreview(palette);
  const kind = KINDS[state.kind];
  const active = Boolean(kind.list);
  els.itemsArea.hidden = !active;
  els.itemAddButton.hidden = !active || state.items.length >= (kind.max || 0);
  els.doneButton.hidden = state.kind !== "checklist";
  if (!active) return;
  els.itemAddButton.textContent = `＋ ${kind.item}`;
  els.itemsArea.dataset.kind = state.kind;
  els.doneButton.style.background = palette.start;
  if (document.activeElement !== els.doneButton) els.doneButton.value = state.doneLabel;

  const rows = els.itemsArea.querySelectorAll(".bubble-item");
  if (els.itemsArea.contains(document.activeElement) && rows.length === state.items.length) {
    rows.forEach((row) => (row.style.borderColor = palette.start));
    return;
  }
  els.itemsArea.replaceChildren(...state.items.map((text, index) => createItemRow(text, index, palette)));
}

function createItemRow(text, index, palette) {
  const kind = KINDS[state.kind];
  const row = document.createElement("div");
  row.className = "bubble-item";
  row.style.borderColor = palette.start;
  if (state.kind === "checklist") {
    const box = document.createElement("span");
    box.className = "bubble-item-box";
    box.setAttribute("aria-hidden", "true");
    box.textContent = "□";
    row.append(box);
  }
  const input = document.createElement("input");
  input.type = "text";
  input.className = "bubble-input bubble-item-input";
  input.maxLength = 40;
  input.value = text;
  input.placeholder = state.kind === "vote" ? `候補${index + 1}（例：🏖️ 沖縄）` : `項目${index + 1}（例：財布）`;
  input.setAttribute("aria-label", `${kind.item}${index + 1}`);
  input.addEventListener("input", () => {
    state.items[index] = input.value.trim();
    render();
  });
  // 複数行を貼ったら1行ずつに分ける
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") || "";
    if (!pasted.includes("\n")) return;
    event.preventDefault();
    if (splitPasted(pasted, index)) {
      input.blur();
      render();
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (state.items.length < kind.max) {
        state.items.splice(index + 1, 0, "");
        input.blur();
        render();
        els.itemsArea.querySelectorAll("input")[index + 1]?.focus();
      }
    }
  });
  const remove = removeOnEdit(`${kind.item}${index + 1}を消す`, () => {
    state.items.splice(index, 1);
    render();
  });
  row.append(input, remove);
  return row;
}

// ---- チケット・クーポン ----

// 入力中の欄は書き換えない
function setValue(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function renderTicketPreview(palette) {
  els.ticketArea.hidden = state.kind !== "ticket";
  els.couponArea.hidden = state.kind !== "coupon";
  if (state.kind === "ticket") {
    setValue(els.routeFrom, state.route.from);
    setValue(els.routeFromSub, state.route.fromSub);
    setValue(els.routeTo, state.route.to);
    setValue(els.routeToSub, state.route.toSub);
    els.pairAddButton.hidden = state.pairs.length >= MAX_PAIRS;
    const editing = els.pairsArea.contains(document.activeElement);
    if (!editing || els.pairsArea.children.length !== state.pairs.length) {
      els.pairsArea.replaceChildren(...state.pairs.map(createPairCell));
    }
  }
  if (state.kind === "coupon") {
    setValue(els.couponOffer, state.coupon.offer);
    setValue(els.couponCode, state.coupon.code);
    setValue(els.couponExpiry, state.coupon.expiry);
    els.couponOffer.style.color = palette.start;
  }
}

function createPairCell(pair, index) {
  const cell = document.createElement("div");
  cell.className = "ticket-pair";
  const label = document.createElement("input");
  label.className = "bubble-input ticket-pair-label";
  label.maxLength = 20;
  label.value = pair.label;
  label.placeholder = ["例：便名", "例：ゲート", "例：座席", "項目名", "項目名", "項目名"][index] || "項目名";
  label.setAttribute("aria-label", `項目${index + 1}の名前`);
  label.addEventListener("input", () => {
    state.pairs[index].label = label.value.trim();
    render();
  });
  const value = document.createElement("input");
  value.className = "bubble-input ticket-pair-value";
  value.maxLength = 30;
  value.value = pair.value;
  value.placeholder = ["C1212", "43D", "31B", "値", "値", "値"][index] || "値";
  value.setAttribute("aria-label", `項目${index + 1}の値`);
  value.addEventListener("input", () => {
    state.pairs[index].value = value.value.trim();
    render();
  });
  const remove = removeOnEdit(`項目${index + 1}を消す`, () => {
    state.pairs.splice(index, 1);
    render();
  });
  cell.append(label, value, remove);
  return cell;
}

// 欠け丸付きのミシン目。幅 10px の箱に直径 20px の丸を寄せて置き、はみ出た半分が切り取られて半円に見える
function perforationFlex() {
  const notch = (side) => ({
    type: "box",
    layout: "vertical",
    width: "10px",
    height: "20px",
    contents: [
      {
        type: "box",
        layout: "vertical",
        position: "absolute",
        width: "20px",
        height: "20px",
        cornerRadius: "10px",
        backgroundColor: NOTCH_COLOR,
        offsetTop: "0px",
        ...(side === "start" ? { offsetEnd: "0px" } : { offsetStart: "0px" }),
        contents: []
      }
    ]
  });
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    contents: [
      notch("start"),
      { type: "box", layout: "vertical", flex: 1, paddingStart: "8px", paddingEnd: "8px", contents: [{ type: "separator", color: "#D7DCE3" }] },
      notch("end")
    ]
  };
}

function ticketFlex(palette) {
  const big = (text) => ({ type: "text", text: text || " ", size: "xxl", weight: "bold", color: "#111827", wrap: true });
  const small = (text) => ({ type: "text", text: text || " ", size: "xs", color: "#6B7280", wrap: true });
  const route = {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "md",
    contents: [
      { type: "box", layout: "vertical", flex: 1, contents: [big(state.route.from), small(state.route.fromSub)] },
      { type: "text", text: "→", size: "xl", color: palette.start, flex: 0, weight: "bold" },
      { type: "box", layout: "vertical", flex: 1, contents: [{ ...big(state.route.to), align: "end" }, { ...small(state.route.toSub), align: "end" }] }
    ]
  };
  const pairs = state.pairs.filter((pair) => pair.label || pair.value);
  const rows = [];
  for (let i = 0; i < pairs.length; i += 3) {
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      contents: [0, 1, 2].map((j) => {
        const pair = pairs[i + j];
        return pair
          ? {
              type: "box",
              layout: "vertical",
              flex: 1,
              contents: [
                { type: "text", text: pair.label || " ", size: "xxs", color: "#9CA3AF", weight: "bold" },
                { type: "text", text: pair.value || " ", size: "md", color: "#111827", weight: "bold", wrap: true }
              ]
            }
          : { type: "box", layout: "vertical", flex: 1, contents: [] };
      })
    });
  }
  return { top: [route], bottom: rows };
}

function couponFlex(palette) {
  const top = [{ type: "text", text: state.coupon.offer || " ", size: "3xl", weight: "bold", color: palette.start, align: "center", wrap: true }];
  const bottom = [];
  if (state.coupon.code) {
    bottom.push({
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      cornerRadius: "10px",
      borderWidth: "1px",
      borderColor: palette.start,
      contents: [
        { type: "text", text: "コード", size: "xxs", color: "#9CA3AF", align: "center" },
        { type: "text", text: state.coupon.code, size: "xl", weight: "bold", color: "#111827", align: "center", wrap: true }
      ]
    });
  }
  if (state.coupon.expiry) {
    bottom.push({ type: "text", text: `有効期限：${state.coupon.expiry}`, size: "sm", color: "#6B7280", align: "center", wrap: true });
  }
  return { top, bottom };
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
    return { message: "サブタイトルを入力するか、× で消してください。", fieldId: "dateInput" };
  }
  if (state.showDetail && !state.detail) {
    return { message: "詳細を入力するか、× で消してください。", fieldId: "detailInput" };
  }
  const filled = state.items.filter(Boolean);
  if (state.kind === "vote" && filled.length < 2) {
    return { message: "投票の候補を2つ以上入れてください。", focus: () => els.itemsArea.querySelector("input")?.focus() };
  }
  if (state.kind === "ticket" && (!state.route.from || !state.route.to)) {
    return { message: "チケットの出発と到着を入れてください。", fieldId: state.route.from ? "routeTo" : "routeFrom" };
  }
  if (state.kind === "coupon" && !state.coupon.offer) {
    return { message: "クーポンの特典（例：20% OFF）を入れてください。", fieldId: "couponOffer" };
  }
  if (state.kind === "checklist" && filled.length < 1) {
    return { message: "チェックリストの項目を1つ以上入れてください。", focus: () => els.itemsArea.querySelector("input")?.focus() };
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
      section: "linkSettings",
      focus: () => els.buttonList.querySelectorAll("input[type=url]")[brokenIndex]?.focus()
    };
  }
  return { message: "" };
}

// 全カードを確かめ、最初に足りないところがあるカードと理由を返す（2枚以上なら「カード2：」を付ける）
function getDeckValidation() {
  storeCurrent();
  const order = [current, ...cards.keys()].filter((index, i, list) => list.indexOf(index) === i);
  for (const index of order) {
    const validation = withCard(cards[index], getValidation);
    if (validation.message) {
      return {
        ...validation,
        index,
        message: cards.length > 1 ? `カード${index + 1}：${validation.message}` : validation.message
      };
    }
  }
  return { message: "" };
}

function updateShareButtonState() {
  const { message } = getDeckValidation();
  window.LineShareUI.setPreviewError(els.bubble, message);
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

  if (state.badges.some(Boolean)) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: state.badges.filter(Boolean).map((text) => ({
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

  const items = state.items.filter(Boolean);
  if (state.kind === "vote" && items.length) {
    // 押した人の名前で「○○ に投票します」がトークに送られる（集計は自動ではしない）
    bodyContents.push({
      type: "box",
      layout: "vertical",
      spacing: "sm",
      margin: "md",
      contents: items.map((item) => ({
        type: "button",
        style: "secondary",
        height: "sm",
        action: { type: "message", label: item.slice(0, 40), text: `${item} に投票します`.slice(0, 300) }
      }))
    });
  }
  if (state.kind === "checklist" && items.length) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      spacing: "sm",
      margin: "md",
      contents: items.map((item) => ({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          { type: "text", text: "□", size: "sm", color: palette.start, flex: 0 },
          { type: "text", text: item, size: "sm", color: "#111827", wrap: true }
        ]
      }))
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
  if (state.kind === "ticket" || state.kind === "coupon") {
    const parts = state.kind === "ticket" ? ticketFlex(palette) : couponFlex(palette);
    bubble.body = {
      type: "box",
      layout: "vertical",
      paddingAll: "0px",
      contents: [
        { type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingBottom: "12px", contents: [...bodyContents, ...parts.top] },
        perforationFlex(),
        ...(parts.bottom.length
          ? [{ type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingTop: "12px", contents: parts.bottom }]
          : [{ type: "box", layout: "vertical", height: "12px", contents: [] }])
      ]
    };
  }

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
  const footerButtons = buttons.map((button) => ({
    type: "button",
    style: "primary",
    color: palette.start,
    action: { type: "uri", label: button.label.slice(0, 40), uri: button.uri }
  }));
  if (state.kind === "checklist" && items.length) {
    // 押すと「『タイトル』準備できました！」がトークに送られる
    footerButtons.unshift({
      type: "button",
      style: "primary",
      color: palette.start,
      action: {
        type: "message",
        label: (state.doneLabel || DEFAULT_DONE_LABEL).slice(0, 40),
        text: `「${state.title}」${(state.doneLabel || DEFAULT_DONE_LABEL).replace(/^✅\s*/u, "")}！`.slice(0, 300)
      }
    });
  }
  if (footerButtons.length > 0) {
    bubble.footer = { type: "box", layout: "vertical", spacing: "sm", contents: footerButtons };
  }

  return {
    type: "flex",
    altText: `${state.headerTitle}: ${state.title}`.slice(0, 400),
    contents: bubble
  };
}

// 送るメッセージ。1枚ならそのカード、2枚以上なら横スクロール（カルーセル）。Created by は各カードに付ける
function buildDeckMessage({ credit = true } = {}) {
  storeCurrent();
  const messages = cards.map((card) =>
    withCard(card, () => (credit ? window.LineShareCredit.withCredit(buildFlexMessage()) : buildFlexMessage()))
  );
  if (messages.length === 1) return messages[0];
  return {
    type: "flex",
    altText: `${messages[0].altText} ほか${messages.length - 1}枚`.slice(0, 400),
    contents: { type: "carousel", contents: messages.map((message) => message.contents) }
  };
}

async function share() {
  if (!window.LineShareLiff.canShare()) {
    setStatus(window.LineShareLiff.MESSAGES.notInLine, true);
    return;
  }

  const validation = getDeckValidation();
  if (validation.message) {
    hasTriedShare = true;
    if (validation.index !== current) switchCard(validation.index);
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
    const message = buildDeckMessage();
    const result = await liff.shareTargetPicker([message], { isMultiple: true });

    if (!result) {
      setStatus("共有はキャンセルされました。");
      return;
    }

    storeCurrent();
    saveJson(LAST_SENT_KEY, { cards: structuredClone(cards) });
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
  if (validation.section) document.getElementById(validation.section).open = true;
  if (validation.focus) {
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
  // LIFF の準備は shared/liff.js。ログインはさせず、送るときに LINE アプリ内か確かめる
  const { MESSAGES } = window.LineShareLiff;
  setStatus(MESSAGES.connecting);
  const { ready } = await window.LineShareLiff.init({ login: "none" });
  if (ready) {
    shareReady = true;
    els.shareButton.addEventListener("click", share);
  } else {
    setStatus(MESSAGES.failed, true);
  }
  updateShareButtonState();
}

function jumpToSection(id, focusTarget) {
  window.LineShareUI.jumpTo(id, focusTarget);
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

// 用意済み（PRESETS）と自分で保存したものを1つの一覧に並べる
function renderTemplates() {
  // 用意済みのテンプレートは横に並べ、保存したものはその下に一覧で出す
  const builtIn = Object.values(PRESETS).map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-tile";
    button.title = preset.description;
    const icon = document.createElement("span");
    icon.className = "preset-tile-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = preset.icon;
    const name = document.createElement("span");
    name.textContent = preset.label;
    button.append(icon, name);
    button.addEventListener("click", () => {
      applyTemplateState({ ...BLANK_STATE, bubbleSize: state.bubbleSize, ...preset.state });
      setStatus(preset.status || `「${preset.label}」を当てはめました。リンク先を入力してください。`);
    });
    return button;
  });

  const saved = getTemplates().map((template) => {
    const row = document.createElement("div");
    row.className = "ls-list-row";
    const button = createTemplateButton(template.name, "保存したテンプレート", () => {
      applyTemplateState(template.state);
      setStatus(`「${template.name}」を読み込みました。`);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ls-icon-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `「${template.name}」を削除`);
    remove.addEventListener("click", () => deleteTemplate(template.name));
    row.append(button, remove);
    return row;
  });

  els.presetGrid.replaceChildren(...builtIn);
  els.templateList.replaceChildren(...saved);
}

function createTemplateButton(title, description, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ls-list-item";
  const name = document.createElement("span");
  name.textContent = title;
  const note = document.createElement("small");
  note.textContent = description;
  button.append(name, note);
  button.addEventListener("click", onClick);
  return button;
}

function applyTemplateState(source) {
  // テンプレートは今のカードにだけ当てはめる。大きさは全カードでそろえたまま
  state = hydrate({ ...source, bubbleSize: state.bubbleSize });
  storeCurrent();
  queryUrls.clear();
  applyStateToEditor();
  render();
}

function saveTemplate() {
  const name = els.templateNameInput.value.trim();
  if (!name) {
    setStatus("保存する名前を入力してください。", true);
    els.templateNameInput.focus();
    return;
  }
  const templates = getTemplates().filter((template) => template.name !== name);
  templates.push({ name, state: getEditorState(), savedAt: new Date().toISOString() });
  saveJson(TEMPLATE_KEY, templates);
  renderTemplates();
  els.templateNameInput.value = "";
  setStatus(`「${name}」として保存しました。`);
}

function deleteTemplate(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  saveJson(TEMPLATE_KEY, getTemplates().filter((template) => template.name !== name));
  renderTemplates();
  setStatus(`「${name}」を削除しました。`);
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildDeckMessage({ credit: false }), null, 2));
    setStatus("Flex Message の JSON をコピーしました。");
  } catch (error) {
    console.error(error);
    setStatus("コピーできませんでした。", true);
  }
}

// ---- イベント ----

// 行を編集しているあいだだけ出す × （バッジ・候補・項目・チケットの項目で共通。shared/ui.js）
function removeOnEdit(ariaLabel, onClick) {
  return window.LineShareUI.removeButton(ariaLabel, onClick, { onEdit: true });
}

function bindEvents() {
  for (const [container, row] of [[els.itemsArea, ".bubble-item"], [els.pairsArea, ".ticket-pair"], [els.badgeRow, ".bubble-badge"]]) {
    window.LineShareUI.keepRemoveVisible(container, row);
  }
  els.itemAddButton.addEventListener("click", () => {
    const kind = KINDS[state.kind];
    if (!kind.list || state.items.length >= kind.max) return;
    state.items.push("");
    render();
    const inputs = els.itemsArea.querySelectorAll("input");
    inputs[inputs.length - 1]?.focus();
  });
  els.doneButton.addEventListener("input", () => {
    state.doneLabel = els.doneButton.value.trim() || DEFAULT_DONE_LABEL;
    render();
  });
  for (const [id, key] of [["routeFrom", "from"], ["routeFromSub", "fromSub"], ["routeTo", "to"], ["routeToSub", "toSub"]]) {
    els[id].addEventListener("input", () => {
      state.route[key] = els[id].value.trim();
      render();
    });
  }
  for (const [id, key] of [["couponOffer", "offer"], ["couponCode", "code"], ["couponExpiry", "expiry"]]) {
    els[id].addEventListener("input", () => {
      state.coupon[key] = els[id].value.trim();
      render();
    });
  }
  els.pairAddButton.addEventListener("click", () => {
    if (state.pairs.length >= MAX_PAIRS) return;
    state.pairs.push({ label: "", value: "" });
    render();
    els.pairsArea.querySelector(".ticket-pair:last-child input")?.focus();
  });
  els.cardAddButton.addEventListener("click", addCard);
  els.cardRemoveButton.addEventListener("click", removeCard);
  // 隣のカードの端をタップすると、そのカードへ
  els.peekPrev.addEventListener("click", () => switchCard(current - 1));
  els.peekNext.addEventListener("click", () => switchCard(current + 1));
  // PC のトラックパッドなどの横スクロールでも前後へ（続けて動かないよう少し間を空ける）
  let wheelLock = 0;
  els.cardStage.addEventListener("wheel", (event) => {
    if (cards.length <= 1 || Math.abs(event.deltaX) < 25 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelLock = now + 500;
    switchCard(current + (event.deltaX > 0 ? 1 : -1));
  }, { passive: false });
  // カードを左右にスワイプすると前後のカードへ（LINE の横スクロールと同じ向き）
  let swipe = null;
  els.bubble.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    swipe = { x: touch.clientX, y: touch.clientY, horizontal: null };
  }, { passive: true });
  els.bubble.addEventListener("touchmove", (event) => {
    if (!swipe || cards.length <= 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (swipe.horizontal === null && Math.hypot(dx, dy) > 8) swipe.horizontal = Math.abs(dx) > Math.abs(dy);
    if (swipe.horizontal) els.cardStage.style.setProperty("--drag", `${dx * 0.6}px`);
  }, { passive: true });
  els.bubble.addEventListener("touchend", (event) => {
    els.cardStage.style.removeProperty("--drag");
    if (!swipe || cards.length <= 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const horizontal = swipe.horizontal;
    swipe = null;
    if (!horizontal || Math.abs(dx) < 50) return;
    switchCard(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

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
  els.bubbleSizeRange.addEventListener("input", () => {
    state.bubbleSize = BUBBLE_SIZES[Number(els.bubbleSizeRange.value)] || "mega";
    // 横スクロールのカードは同じ大きさにそろえる
    cards.forEach((card) => (card.bubbleSize = state.bubbleSize));
    requestAnimationFrame(renderPeeks);
    els.bubbleSizeLabel.textContent = state.bubbleSize;
    render();
  });

  // サブタイトル・詳細はプレビュー上の ＋ で出し、× で隠す（中身は残るので ＋ で戻せる）
  const toggle = (checkbox, on) => {
    checkbox.checked = on;
    checkbox.dispatchEvent(new Event("change"));
  };
  window.LineShareUI.optional(els.dateRow, {
    label: "サブタイトル",
    isOn: () => state.showDate,
    onAdd: () => toggle(els.showDateToggle, true),
    onRemove: () => toggle(els.showDateToggle, false)
  });
  window.LineShareUI.optional(els.detailRow, {
    label: "詳細",
    isOn: () => state.showDetail,
    onAdd: () => toggle(els.showDetailToggle, true),
    onRemove: () => toggle(els.showDetailToggle, false)
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

  // プレビューの写真・バッジ・ボタンをタップしたら、その設定を開いてそこへ移動する
  els.heroArea.addEventListener("click", () => jumpToSection("photoSettings", els.imageUrlInput));
  els.badgeAddButton.addEventListener("click", () => {
    if (state.badges.length >= MAX_BADGES) return;
    state.badges.push("");
    render();
    els.badgeRow.querySelector(".bubble-badge:last-child .bubble-badge-text")?.focus();
  });
  const jumpToButton = (event) => {
    const item = event.target.closest(".bubble-action");
    if (!item) return;
    const index = [...els.buttonStack.children].indexOf(item);
    const row = els.buttonList.querySelectorAll(".button-row")[index];
    jumpToSection("linkSettings", row?.querySelector("input"));
  };
  els.buttonStack.addEventListener("click", jumpToButton);
  els.buttonStack.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      jumpToButton(event);
    }
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


  els.addButtonButton.addEventListener("click", () => {
    if (state.buttons.length >= MAX_BUTTONS) return;
    state.buttons.push({ label: "", url: "" });
    renderButtonList();
    render();
    els.buttonList.querySelector(".button-row:last-child input")?.focus();
  });

  els.saveTemplateButton.addEventListener("click", saveTemplate);
  els.templateNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      saveTemplate();
    }
  });
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
    cards = [state];
    current = 0;
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
