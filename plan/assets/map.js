import { assertUriLength, autoGrow, escapeHtml, isGoogleMapsUrl, isHttpsUrl, mapSearchUrl, openExternal, setMessage, shareFlex, titleFromMapUrl, toUserMessage, UserError, app } from "./common.js?v=202610202312";
import { bindPlaceSearch, hasPlaceSearch } from "./place-search.js?v=202610202312";
import { bindHeader } from "./header.js?v=202610202312";
import { createPlaceFlex } from "./flex.js?v=202610202312";

// バッジの候補とテンプレートは data/templates.json の place（開いたあとに読み込む）
let DEFAULT_BADGES = [];
const MAX_BADGES = 5;
const MAX_BADGE_LENGTH = 12;
const TEMPLATE_KEY = "line-share:place-templates";

// 用意済みのテンプレートはヘッダーの見出し・バッジ・コメントだけを入れ替え、選んだ場所はそのまま残す
let PLACE_PRESETS = [];

const dom = {};
const state = {
  selectedBadges: [],
  address: "",
  photoUrl: "",
  lastResolvedUrl: "",
  header: null,
  onCreateEvent: () => {}
};

export function initMapTab({ onCreateEvent }) {
  state.onCreateEvent = onCreateEvent;

  dom.mapUrl = document.getElementById("mapUrl");
  dom.title = document.getElementById("mapTitle");
  dom.address = document.getElementById("mapAddress");
  dom.comment = document.getElementById("mapComment");
  dom.badgeList = document.getElementById("badgeList");
  dom.customBadge = document.getElementById("customBadge");
  dom.addBadgeButton = document.getElementById("addBadgeButton");
  dom.openButton = document.getElementById("mapOpenButton");
  dom.findButton = document.getElementById("mapFindButton");
  dom.pasteButton = document.getElementById("mapPasteButton");
  dom.createEventButton = document.getElementById("mapCreateEventButton");
  dom.shareButton = document.getElementById("mapShareButton");
  dom.message = document.getElementById("mapMessage");
  dom.preview = document.getElementById("mapPreview");
  dom.titleInline = document.getElementById("mapTitleInline");
  dom.previewPhoto = document.getElementById("mapPreviewPhoto");
  dom.previewAddress = document.getElementById("mapPreviewAddress");
  dom.previewBadges = document.getElementById("mapPreviewBadges");
  dom.badgeAdd = document.getElementById("mapBadgeAdd");
  dom.templateList = document.getElementById("mapTemplateList");
  dom.templateName = document.getElementById("mapTemplateName");
  dom.templateSave = document.getElementById("mapTemplateSave");

  dom.mapUrl.addEventListener("input", handleMapUrlInput_);
  dom.title.addEventListener("input", refreshMapTab);
  // プレビューの場所名と「場所」の場所名は同じもの（どちらで入力してもよい）
  dom.titleInline.addEventListener("input", () => {
    dom.title.value = dom.titleInline.value;
    refreshMapTab();
  });
  dom.comment.addEventListener("input", refreshMapTab);
  if (!hasPlaceSearch()) {
    document.getElementById("mapIntro").textContent =
      "場所名を入れて、Google Mapsで探せます。";
  }
  bindPlaceSearch({
    input: document.getElementById("mapSearchInput"),
    button: document.getElementById("mapSearchButton"),
    results: document.getElementById("mapSearchResults"),
    message: dom.message,
    onSelect: selectPlace_
  });
  dom.addBadgeButton.addEventListener("click", addCustomBadge_);
  dom.customBadge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      addCustomBadge_();
    }
  });
  dom.openButton.addEventListener("click", openMap_);
  dom.findButton.addEventListener("click", findOnMap_);
  dom.pasteButton.addEventListener("click", pasteMapUrl_);
  dom.createEventButton.addEventListener("click", createEvent_);
  dom.shareButton.addEventListener("click", share_);
  dom.templateSave.addEventListener("click", saveTemplate_);
  dom.templateName.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      saveTemplate_();
    }
  });

  state.header = bindHeader({ prefix: "mapHeader", defaultTitle: "場所のお知らせ", onChange: refreshMapTab });
  // サブタイトル・コメントはプレビュー上の ＋ で足し、× で消す
  window.LineShareUI.optional(document.getElementById("mapHeaderSubRow"), { label: "サブタイトル" });
  window.LineShareUI.optional(document.getElementById("mapCommentRow"), { label: "コメント" });
  renderBadges_();
  renderTemplates_();
  refreshMapTab();
  loadPlaceTemplates_();
}

async function loadPlaceTemplates_() {
  const { place } = await window.LineShareUI.loadTemplates();
  DEFAULT_BADGES = Array.isArray(place?.badges) ? place.badges.filter((label) => typeof label === "string") : [];
  PLACE_PRESETS = Array.isArray(place?.presets) ? place.presets.filter((preset) => preset?.name) : [];
  renderBadges_();
  renderTemplates_();
}

/**
 * URL パラメータ（GAS の Bot 返信から開かれた場合など）で場所を読み込む。
 */
export function loadPlace({ mapUrl, title, address, photoUrl }) {
  dom.mapUrl.value = mapUrl;
  dom.title.value = title || titleFromMapUrl(mapUrl);
  state.address = address;
  state.photoUrl = photoUrl;
  state.lastResolvedUrl = mapUrl;
  refreshMapTab();
}

/**
 * クエリパラメータから場所のカードを作る（main.js から呼ぶ）。渡されたものだけ入れる。
 *   mapUrl / title / address / photoUrl … 場所
 *   header / sub / color               … ヘッダーの見出し・サブタイトル・色（purple・sky・leaf・sunset・berry か 16進）
 *   comment / badges                   … コメント、バッジ（カンマ区切り）
 */
export function applyMapQuery(params) {
  const mapUrl = params.get("mapUrl") || "";
  const photoUrl = params.get("photoUrl") || "";
  if (mapUrl || params.has("title")) {
    loadPlace({
      mapUrl: isGoogleMapsUrl(mapUrl) ? mapUrl : "",
      title: params.get("title") || "",
      address: params.get("address") || "",
      photoUrl: isHttpsUrl(photoUrl) ? photoUrl : ""
    });
  }
  state.header.apply({
    title: params.get("header") ?? undefined,
    subtitle: params.get("sub") ?? undefined,
    color: params.get("color") || ""
  });
  if (params.has("comment")) dom.comment.value = params.get("comment");
  if (params.has("badges")) {
    state.selectedBadges = params
      .get("badges")
      .split(",")
      .map((label) => label.trim().slice(0, MAX_BADGE_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_BADGES);
    renderBadges_();
  }
  refreshMapTab();
}

export function refreshMapTab() {
  const place = getPlace_();
  const hasUrl = isGoogleMapsUrl(place.mapUrl);

  // 任意項目のアコーディオンの見出しに、今の状態を出す
  document.getElementById("badgeMeta").textContent = place.badges.length ? `${place.badges.length}個` : "なし";

  dom.address.textContent = place.address;
  dom.address.hidden = !place.address;
  dom.openButton.disabled = !hasUrl;
  dom.createEventButton.disabled = !hasUrl;
  dom.shareButton.disabled = !hasUrl || !app.liffReady;

  renderPreview_(place);
  window.LineShareUI.syncOptionals();
  // テンプレートなどでコメントが入ると行が表示されるので、表示してから高さを合わせる
  autoGrow(dom.comment);
  window.LineShareUI.setPreviewError(dom.preview, hasUrl ? "" : "場所を検索して選ぶか、場所名を入れてください。");
}

function getPlace_() {
  return {
    mapUrl: dom.mapUrl.value.trim() || mapSearchUrl(dom.title.value),
    title: dom.title.value.trim(),
    address: state.address.trim(),
    photoUrl: state.photoUrl,
    comment: dom.comment.value.trim(),
    badges: [...state.selectedBadges],
    header: state.header?.get() ?? null
  };
}

function handleMapUrlInput_() {
  const url = dom.mapUrl.value.trim();
  if (url !== state.lastResolvedUrl) {
    state.address = "";
    state.photoUrl = "";
    if (!dom.title.value.trim()) {
      dom.title.value = titleFromMapUrl(url);
    }
  }
  refreshMapTab();
}

function selectPlace_(place) {
  dom.mapUrl.value = place.mapUrl;
  dom.title.value = place.title;
  state.address = place.address;
  state.photoUrl = place.photoUrl;
  state.lastResolvedUrl = place.mapUrl;
  setMessage(dom.message, "");
  refreshMapTab();
}

function openMap_() {
  const { mapUrl } = getPlace_();
  if (isGoogleMapsUrl(mapUrl)) {
    openExternal(mapUrl);
  }
}

function findOnMap_() {
  const name = dom.title.value.trim();
  if (!name) {
    setMessage(dom.message, "先に場所名を入力してください。", "error");
    dom.title.focus();
    return;
  }
  openExternal(mapSearchUrl(name));
  setMessage(dom.message, "見つけたら「共有」→「リンクをコピー」して、URL欄に貼り付けてください。");
}

async function pasteMapUrl_() {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    const url = text.match(/https?:\/\/\S+/)?.[0] || "";
    if (!isGoogleMapsUrl(url)) {
      setMessage(dom.message, "コピーした内容にGoogle MapsのURLが見つかりませんでした。", "error");
      return;
    }
    dom.mapUrl.value = url;
    handleMapUrlInput_();
    setMessage(dom.message, "");
  } catch (error) {
    console.error(error);
    setMessage(dom.message, "貼り付けできませんでした。URL欄を長押しして貼り付けてください。", "error");
    dom.mapUrl.focus();
  }
}

function createEvent_() {
  const place = getPlace_();
  state.onCreateEvent({
    mapUrl: place.mapUrl,
    title: place.title,
    address: place.address,
    photoUrl: place.photoUrl
  });
}

async function share_() {
  setSending_(true);
  try {
    const place = getPlace_();
    if (!isGoogleMapsUrl(place.mapUrl)) {
      throw new UserError("Google MapsのURLを入力してください。");
    }
    assertUriLength(place.mapUrl, "地図のURL");

    const sent = await shareFlex(createPlaceFlex(place));
    if (sent) window.LineShareLog?.track("send", { kind: "place" });
    setMessage(
      dom.message,
      sent ? window.LineShareLiff.MESSAGES.sent : window.LineShareLiff.MESSAGES.canceled,
      sent ? "success" : "default"
    );
  } catch (error) {
    setMessage(dom.message, toUserMessage(error, window.LineShareLiff.MESSAGES.sendFailed), "error");
  } finally {
    setSending_(false);
    refreshMapTab();
  }
}

function renderBadges_() {
  const labels = [
    ...DEFAULT_BADGES,
    ...state.selectedBadges.filter((label) => !DEFAULT_BADGES.includes(label))
  ];

  dom.badgeList.replaceChildren(
    ...labels.map((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ls-chip";
      button.setAttribute("aria-pressed", String(state.selectedBadges.includes(label)));
      button.textContent = label;
      button.addEventListener("click", () => toggleBadge_(label));
      return button;
    })
  );
}

function toggleBadge_(label) {
  const index = state.selectedBadges.indexOf(label);
  if (index >= 0) {
    state.selectedBadges.splice(index, 1);
  } else if (state.selectedBadges.length >= MAX_BADGES) {
    setMessage(dom.message, `バッジは最大${MAX_BADGES}つまでです。`, "error");
    return;
  } else {
    state.selectedBadges.push(label);
  }

  setMessage(dom.message, "");
  renderBadges_();
  refreshMapTab();
}

function addCustomBadge_() {
  const label = dom.customBadge.value.trim();
  if (!label) return;

  if (label.length > MAX_BADGE_LENGTH) {
    setMessage(dom.message, `バッジは${MAX_BADGE_LENGTH}文字以内にしてください。`, "error");
    return;
  }

  if (!state.selectedBadges.includes(label)) {
    if (state.selectedBadges.length >= MAX_BADGES) {
      setMessage(dom.message, `バッジは最大${MAX_BADGES}つまでです。`, "error");
      return;
    }
    state.selectedBadges.push(label);
  }

  dom.customBadge.value = "";
  setMessage(dom.message, "");
  renderBadges_();
  refreshMapTab();
}

// プレビューは最初に組み立てたものを使い回し、入力中の欄は書き換えない（文字の入力が途切れないように）
function renderPreview_(place) {
  if (document.activeElement !== dom.titleInline) dom.titleInline.value = dom.title.value;
  dom.previewPhoto.hidden = !place.photoUrl;
  if (place.photoUrl && dom.previewPhoto.getAttribute("src") !== place.photoUrl) dom.previewPhoto.src = place.photoUrl;
  dom.previewAddress.hidden = !place.address;
  dom.previewAddress.textContent = place.address;
  dom.previewBadges.hidden = place.badges.length === 0;
  dom.previewBadges.innerHTML = place.badges.map((label) => `<span class="preview-badge">${escapeHtml(label)}</span>`).join("");
  dom.badgeAdd.hidden = place.badges.length >= MAX_BADGES;
  autoGrow(dom.comment);
}

// ---- テンプレート ----

function renderTemplates_() {
  const builtIn = PLACE_PRESETS.map((preset) =>
    createTemplateButton_(preset.name, describeTemplate_(preset), () => applyTemplate_(preset))
  );

  const saved = loadTemplates_().map((template) => {
    const row = document.createElement("div");
    row.className = "ls-list-row";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ls-icon-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `「${template.name}」を削除`);
    remove.addEventListener("click", () => deleteTemplate_(template.name));
    row.append(createTemplateButton_(template.name, describeTemplate_(template), () => applyTemplate_(template)), remove);
    return row;
  });

  dom.templateList.replaceChildren(...builtIn, ...saved);
}

function describeTemplate_(template) {
  const parts = [];
  if (template.headerTitle) parts.push(`🪧${template.headerTitle}`);
  if (template.place?.title) parts.push(`📍${template.place.title}`);
  if (template.badges?.length) parts.push(template.badges.join("・"));
  if (template.comment) parts.push(`「${template.comment}」`);
  return parts.join("　") || "バッジ・コメントなし";
}

function createTemplateButton_(title, description, onClick) {
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

function applyTemplate_(template) {
  if (template.place?.mapUrl || template.place?.title) {
    loadPlace({
      mapUrl: template.place.mapUrl || "",
      title: template.place.title || "",
      address: template.place.address || "",
      photoUrl: template.place.photoUrl || ""
    });
  }
  if (typeof template.headerTitle === "string") state.header.setTitle(template.headerTitle);
  state.selectedBadges = (template.badges || []).slice(0, MAX_BADGES);
  dom.comment.value = template.comment || "";
  renderBadges_();
  refreshMapTab();
  setMessage(dom.message, `「${template.name}」を当てはめました。`);
}

function saveTemplate_() {
  const name = dom.templateName.value.trim();
  if (!name) {
    setMessage(dom.message, "保存する名前を入力してください。", "error");
    dom.templateName.focus();
    return;
  }
  const place = getPlace_();
  const template = {
    name,
    place: {
      mapUrl: dom.mapUrl.value.trim(),
      title: place.title,
      address: place.address,
      photoUrl: place.photoUrl
    },
    headerTitle: place.header?.title || "",
    badges: place.badges,
    comment: place.comment
  };
  saveTemplates_([...loadTemplates_().filter((item) => item.name !== name), template]);
  dom.templateName.value = "";
  renderTemplates_();
  setMessage(dom.message, `「${name}」として保存しました。`, "success");
}

function deleteTemplate_(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  saveTemplates_(loadTemplates_().filter((item) => item.name !== name));
  renderTemplates_();
  setMessage(dom.message, `「${name}」を削除しました。`);
}

function loadTemplates_() {
  try {
    const templates = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]");
    return Array.isArray(templates) ? templates : [];
  } catch {
    return [];
  }
}

function saveTemplates_(templates) {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error(error);
  }
}

function setSending_(isSending) {
  dom.shareButton.disabled = isSending;
  dom.shareButton.textContent = isSending ? "送信中..." : "🪧 カードで送る";
}
