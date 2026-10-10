import { assertUriLength, escapeHtml, isGoogleMapsUrl, resolveMapInfo, setMessage, shareFlex, toUserMessage, UserError, app } from "./common.js";
import { createPlaceFlex } from "./flex.js";

const DEFAULT_BADGES = ["おすすめ", "近い", "コスパ○", "行きたい", "集合場所", "駅近", "雰囲気◎", "子連れOK"];
const MAX_BADGES = 5;
const MAX_BADGE_LENGTH = 12;

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
  dom.resolveButton = document.getElementById("mapResolveButton");
  dom.openButton = document.getElementById("mapOpenButton");
  dom.createEventButton = document.getElementById("mapCreateEventButton");
  dom.shareButton = document.getElementById("mapShareButton");
  dom.message = document.getElementById("mapMessage");
  dom.preview = document.getElementById("mapPreview");

  dom.mapUrl.addEventListener("input", handleMapUrlInput_);
  dom.title.addEventListener("input", refreshMapTab);
  dom.comment.addEventListener("input", refreshMapTab);
  dom.resolveButton.addEventListener("click", () => resolve_());
  dom.addBadgeButton.addEventListener("click", addCustomBadge_);
  dom.customBadge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      addCustomBadge_();
    }
  });
  dom.openButton.addEventListener("click", openMap_);
  dom.createEventButton.addEventListener("click", createEvent_);
  dom.shareButton.addEventListener("click", share_);

  renderBadges_();
  refreshMapTab();
}

/**
 * URL パラメータ（GAS の Bot 返信から開かれた場合など）で場所を読み込む。
 */
export async function loadPlace({ mapUrl, title, address, photoUrl }) {
  dom.mapUrl.value = mapUrl;
  dom.title.value = title;
  state.address = address;
  state.photoUrl = photoUrl;
  state.lastResolvedUrl = mapUrl;
  refreshMapTab();

  if (mapUrl && (!title || !address || !photoUrl)) {
    await resolve_({ keepTitle: Boolean(title) });
  }
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
    mapUrl: dom.mapUrl.value.trim(),
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
  }
  refreshMapTab();
}

async function resolve_({ keepTitle = false } = {}) {
  setResolving_(true);
  setMessage(dom.message, "");
  try {
    const info = await resolveMapInfo(dom.mapUrl.value.trim());
    state.lastResolvedUrl = info.mapUrl;
    state.address = info.address;
    state.photoUrl = info.photoUrl;
    if (!keepTitle || !dom.title.value.trim()) {
      dom.title.value = info.title || "Google Maps";
    }
  } catch (error) {
    setMessage(dom.message, toUserMessage(error), "error");
  } finally {
    setResolving_(false);
    refreshMapTab();
  }
}

function openMap_() {
  const url = dom.mapUrl.value.trim();
  if (isGoogleMapsUrl(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
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
      button.className = "button button-chip";
      button.classList.toggle("is-active", state.selectedBadges.includes(label));
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
    dom.preview.innerHTML = `
      <span class="preview-pill">送信プレビュー</span>
      <h3 class="preview-title">入力待ち</h3>
      <div class="preview-grid">
        <div class="preview-item">
          <div class="preview-key">状態</div>
          <div class="preview-value">Google MapsのURLを入れると、送る内容をここで確認できます。</div>
        </div>
      </div>
    `;
    return;
  }

  const badges = place.badges.map((label) => `<span class="preview-badge">${escapeHtml(label)}</span>`).join("");

  dom.preview.innerHTML = `
    ${place.photoUrl ? `<img class="preview-photo" src="${escapeHtml(place.photoUrl)}" alt="" />` : ""}
    <span class="preview-pill">送信プレビュー</span>
    <h3 class="preview-title">📍 ${escapeHtml(place.title || "Google Maps")}</h3>
    ${place.address ? `<p class="preview-sub">${escapeHtml(place.address)}</p>` : ""}
    ${badges ? `<div class="preview-badges">${badges}</div>` : ""}
    ${
      place.comment
        ? `<div class="preview-grid"><div class="preview-item"><div class="preview-key">コメント</div><div class="preview-value">${escapeHtml(place.comment)}</div></div></div>`
        : ""
    }
    <div class="preview-actions">
      <a class="preview-link primary" href="${escapeHtml(place.mapUrl)}" target="_blank" rel="noreferrer">地図を開く</a>
    </div>
  `;
}

function setResolving_(isResolving) {
  dom.resolveButton.disabled = isResolving;
  dom.resolveButton.textContent = isResolving ? "取得中..." : "情報を取得";
}

function setSending_(isSending) {
  dom.shareButton.disabled = isSending;
  dom.shareButton.textContent = isSending ? "送信中..." : "ほかのトークに送る";
}
