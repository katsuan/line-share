import { assertUriLength, escapeHtml, isGoogleMapsUrl, mapSearchUrl, openExternal, setMessage, shareFlex, titleFromMapUrl, toUserMessage, UserError, app } from "./common.js?v=202610101915";
import { bindPlaceSearch, hasPlaceSearch } from "./place-search.js?v=202610101915";
import { createPlaceFlex } from "./flex.js?v=202610101915";

const DEFAULT_BADGES = ["おすすめ", "近い", "コスパ○", "行きたい", "集合場所", "駅近", "雰囲気◎", "子連れOK"];
const MAX_BADGES = 5;
const MAX_BADGE_LENGTH = 12;
const TEMPLATE_KEY = "line-share:place-templates";

// 用意済みのテンプレートはバッジとコメントだけを入れ替え、選んだ場所はそのまま残す
const PLACE_PRESETS = [
  { name: "🍽️ ランチ候補", badges: ["おすすめ", "近い", "コスパ○"], comment: "ランチここどう？" },
  { name: "📍 集合場所", badges: ["集合場所"], comment: "ここに集合で！" },
  { name: "✨ 行きたい", badges: ["行きたい", "雰囲気◎"], comment: "今度ここ行ってみたい！" },
  { name: "👶 子連れOK", badges: ["子連れOK", "駅近"], comment: "子どもと一緒でも行けそう！" }
];

const dom = {};
const state = {
  selectedBadges: [],
  address: "",
  photoUrl: "",
  lastResolvedUrl: "",
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
  dom.templateList = document.getElementById("mapTemplateList");
  dom.templateName = document.getElementById("mapTemplateName");
  dom.templateSave = document.getElementById("mapTemplateSave");

  dom.mapUrl.addEventListener("input", handleMapUrlInput_);
  dom.title.addEventListener("input", refreshMapTab);
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

  renderBadges_();
  renderTemplates_();
  refreshMapTab();
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

export function refreshMapTab() {
  const place = getPlace_();
  const hasUrl = isGoogleMapsUrl(place.mapUrl);

  dom.address.textContent = place.address;
  dom.address.hidden = !place.address;
  dom.openButton.disabled = !hasUrl;
  dom.createEventButton.disabled = !hasUrl;
  dom.shareButton.disabled = !hasUrl || !app.liffReady;

  renderPreview_(place, hasUrl);
}

function getPlace_() {
  return {
    mapUrl: dom.mapUrl.value.trim() || mapSearchUrl(dom.title.value),
    title: dom.title.value.trim(),
    address: state.address.trim(),
    photoUrl: state.photoUrl,
    comment: dom.comment.value.trim(),
    badges: [...state.selectedBadges]
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
    setMessage(
      dom.message,
      sent ? "送信しました。" : "送信先の画面を閉じました。送信されていない場合は、LINEアプリを最新版に更新して再度お試しください。",
      sent ? "success" : "default"
    );
  } catch (error) {
    setMessage(dom.message, toUserMessage(error, "送信に失敗しました。"), "error");
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

function renderPreview_(place, hasUrl) {
  if (!hasUrl) {
    dom.preview.innerHTML = `<p class="preview-empty">場所を選ぶか、Google MapsのURLを入れると<br />送る内容をここで確認できます。</p>`;
    return;
  }

  const badges = place.badges.map((label) => `<span class="preview-badge">${escapeHtml(label)}</span>`).join("");

  dom.preview.innerHTML = `
    ${place.photoUrl ? `<img class="preview-photo" src="${escapeHtml(place.photoUrl)}" alt="" />` : ""}
    <div class="talk-card-body">
      <h3 class="preview-title">📍 ${escapeHtml(place.title || "Google Maps")}</h3>
      ${place.address ? `<p class="preview-sub">${escapeHtml(place.address)}</p>` : ""}
      ${badges ? `<div class="preview-badges">${badges}</div>` : ""}
      ${
        place.comment
          ? `<div class="preview-grid"><div class="preview-item"><div class="preview-key">コメント</div><div class="preview-value">${escapeHtml(place.comment)}</div></div></div>`
          : ""
      }
    </div>
    <div class="preview-actions">
      <a class="preview-link primary" href="${escapeHtml(place.mapUrl)}" target="_blank" rel="noreferrer">地図を開く</a>
    </div>
    <p class="ls-credit">Created by おくるカード ›</p>
  `;
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
  dom.shareButton.textContent = isSending ? "送信中..." : "トークに送る";
}
