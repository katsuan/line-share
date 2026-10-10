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

export function selectTab(name) {
  for (const key of TABS) {
    const selected = key === name;
    const tab = document.getElementById(`tab-${key}`);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(`panel-${key}`).hidden = !selected;
  }
}

function setBadge_(element, label, muted = false) {
  element.textContent = label;
  element.classList.toggle("is-muted", muted);
}
