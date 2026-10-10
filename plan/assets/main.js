import { CONFIG } from "./config.js";
import { app, isGoogleMapsUrl, isHttpsUrl } from "./common.js";
import { initMapTab, loadPlace, refreshMapTab } from "./map.js";
import { applyPlace, focusCalendarTitle, initCalendarTab, refreshCalendarTab } from "./calendar.js";

const TABS = ["map", "calendar"];

document.addEventListener("DOMContentLoaded", async () => {
  initMapTab({
    onCreateEvent: async (place) => {
      selectTab("calendar");
      await applyPlace(place);
      focusCalendarTitle();
    }
  });
  initCalendarTab();
  bindTabs_();
  bindSendBar_();

  await initializeLiff_();

  // LIFF の初期化後に読む（liff.state からの転送後に正しいクエリになるため）
  await applyQuery_(new URLSearchParams(location.search));
});

async function initializeLiff_() {
  const badge = document.getElementById("liffBadge");
  try {
    await liff.init({ liffId: CONFIG.liffId });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    app.liffReady = true;
    setBadge_(badge, liff.isInClient() ? "LINEで送れます" : "ブラウザで確認中");
  } catch (error) {
    console.error(error);
    setBadge_(badge, "LINE未接続", true);
  } finally {
    refreshMapTab();
    refreshCalendarTab();
  }
}

async function applyQuery_(params) {
  const mapUrl = params.get("mapUrl") || "";
  const photoUrl = params.get("photoUrl") || "";
  const place = {
    mapUrl: isGoogleMapsUrl(mapUrl) ? mapUrl : "",
    title: params.get("title") || "",
    address: params.get("address") || "",
    photoUrl: isHttpsUrl(photoUrl) ? photoUrl : ""
  };
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : place.mapUrl ? "map" : null;

  if (tab) {
    selectTab(tab);
  }

  if (!place.mapUrl) {
    return;
  }

  if (tab === "calendar") {
    await applyPlace(place);
  } else {
    await loadPlace(place);
  }
}

function bindTabs_() {
  const tabs = document.querySelectorAll("[role=tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const index = TABS.indexOf(tab.dataset.tab);
      const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      selectTab(next);
      document.getElementById(`tab-${next}`).focus();
    });
  }
}

// スマホでは送信ボタンを画面下に固定し、表示中タブの送信ボタンと状態を連動させる
const SEND_TARGETS = {
  map: { button: "mapShareButton", message: "mapMessage" },
  calendar: { button: "shareTargetButton", message: "statusMessage" }
};

function bindSendBar_() {
  const barButton = document.getElementById("sendBarButton");
  const barMessage = document.getElementById("sendBarMessage");
  const observer = new MutationObserver(syncSendBar_);

  for (const { button, message } of Object.values(SEND_TARGETS)) {
    observer.observe(document.getElementById(button), { attributes: true, childList: true, characterData: true, subtree: true });
    observer.observe(document.getElementById(message), { attributes: true, childList: true, characterData: true, subtree: true });
  }

  barButton.addEventListener("click", () => {
    document.getElementById(SEND_TARGETS[activeTab_()].button).click();
  });

  // 入力中はキーボードと重ならないよう隠す
  document.addEventListener("focusin", (event) => {
    if (event.target.matches("input:not([type=checkbox]), textarea")) {
      document.body.classList.add("is-typing");
    }
  });
  document.addEventListener("focusout", () => document.body.classList.remove("is-typing"));

  function syncSendBar_() {
    const target = SEND_TARGETS[activeTab_()];
    const source = document.getElementById(target.button);
    const message = document.getElementById(target.message);
    barButton.disabled = source.disabled;
    barButton.textContent = source.textContent;
    barMessage.textContent = message.textContent;
    barMessage.className = `send-bar-message ${message.className.replace("message", "")}`;
  }

  window.syncSendBar = syncSendBar_;
}

function activeTab_() {
  return document.getElementById("tab-map").getAttribute("aria-selected") === "true" ? "map" : "calendar";
}

export function selectTab(name) {
  for (const key of TABS) {
    const selected = key === name;
    const tab = document.getElementById(`tab-${key}`);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(`panel-${key}`).hidden = !selected;
  }
  window.syncSendBar?.();
}

function setBadge_(element, label, muted = false) {
  element.textContent = label;
  element.classList.toggle("is-muted", muted);
}
