import { app } from "./common.js?v=202610202312";
import { applyMapQuery, initMapTab, refreshMapTab } from "./map.js?v=202610202312";
import { applyEventQuery, applyPlace, focusCalendarTitle, initCalendarTab, refreshCalendarTab } from "./calendar.js?v=202610202312";

const TABS = ["map", "calendar"];

document.addEventListener("DOMContentLoaded", async () => {
  // はじめて開いた人にだけ、短い使い方を出す（shared/ui.js）
  window.LineShareUI.firstTip("plan", [
    "📍 場所：場所を探すと、地図を開けるカードになります。",
    "🗓️ 予定：件名と日時を入れると、カレンダーに入れられるカードになります。",
    "下の「カードで送る」で、送り先を選んで送れます。"
  ], document.querySelector(".ls-tabs"));
  initMapTab({
    onCreateEvent: (place) => {
      selectTab("calendar");
      applyPlace(place);
      focusCalendarTitle();
    }
  });
  initCalendarTab();
  bindTabs_();
  bindSendBar_();

  await initializeLiff_();

  // LIFF の初期化後に読む（liff.state からの転送後に正しいクエリになるため）
  applyQuery_(new URLSearchParams(location.search));
});

// LIFF の準備は shared/liff.js。LINE の外ではログイン画面へ移る
async function initializeLiff_() {
  try {
    const { ready } = await window.LineShareLiff.init({ login: "redirect" });
    app.liffReady = ready;
  } finally {
    refreshMapTab();
    refreshCalendarTab();
  }
}

// クエリパラメータからカードを作る。tab=calendar か start があれば予定、mapUrl・title などがあれば場所
// （使えるパラメータは map.js の applyMapQuery・calendar.js の applyEventQuery と README）
function applyQuery_(params) {
  const keys = [...params.keys()].filter((key) => !["tab", "from", "credit"].includes(key) && !key.startsWith("liff"));
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : params.has("start") ? "calendar" : keys.length ? "map" : null;
  if (!tab) return;
  selectTab(tab);
  if (tab === "calendar") applyEventQuery(params);
  else applyMapQuery(params);
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

// 送信は画面下の共通バーから行い、表示中タブの送信ボタンと状態を連動させる
const SEND_TARGETS = {
  map: { button: "mapShareButton", message: "mapMessage" },
  calendar: { button: "shareTargetButton", message: "statusMessage" }
};

// 送れないのに理由が出ていないときに送信バーに出す一言
const EMPTY_HINTS = {
  map: "場所を検索して選ぶか、場所名を入れると送れます。",
  calendar: "件名と日時を入れると送れます。"
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

  function syncSendBar_() {
    const target = SEND_TARGETS[activeTab_()];
    const source = document.getElementById(target.button);
    const message = document.getElementById(target.message);
    barButton.disabled = source.disabled;
    barButton.textContent = source.textContent;
    // 送れないのに理由が空のときは、何を入れれば送れるかを出す
    const hint = source.disabled && !message.textContent.trim() ? EMPTY_HINTS[activeTab_()] : "";
    barMessage.textContent = hint || message.textContent;
    // 送れない間は「次に何を入れるか」の案内なので赤くしない（送ろうとして失敗したときだけ赤）
    barMessage.className = source.disabled ? "ls-status" : `ls-status ${message.className.replace("message", "")}`;
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

