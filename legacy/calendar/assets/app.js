const CONFIG = {
  liffId: "2009951859-cAKdolhm"
};

const dom = {};
const state = {
  liffReady: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
  endEdited: false,
  selectedDurationMinutes: 60,
  followStartDuration: true
};

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom_();
  setDefaultDateTime_();
  dom.timezone.value = state.timezone;
  addCustomParamRow_();
  bindEvents_();
  updateUi_();
  await initializeLiff_();
});

function cacheDom_() {
  dom.form = document.getElementById("eventForm");
  dom.title = document.getElementById("title");
  dom.startDate = document.getElementById("startDate");
  dom.startTime = document.getElementById("startTime");
  dom.endDate = document.getElementById("endDate");
  dom.endTime = document.getElementById("endTime");
  dom.location = document.getElementById("location");
  dom.url = document.getElementById("url");
  dom.details = document.getElementById("details");
  dom.locationState = document.getElementById("locationState");
  dom.urlState = document.getElementById("urlState");
  dom.detailsState = document.getElementById("detailsState");
  dom.timezone = document.getElementById("timezone");
  dom.recur = document.getElementById("recur");
  dom.sourceName = document.getElementById("sourceName");
  dom.sourceUrl = document.getElementById("sourceUrl");
  dom.optionalCount = document.getElementById("optionalCount");
  dom.generatedUrl = document.getElementById("generatedUrl");
  dom.openUrlButton = document.getElementById("openUrlButton");
  dom.copyUrlButton = document.getElementById("copyUrlButton");
  dom.sendCurrentChatButton = document.getElementById("sendCurrentChatButton");
  dom.shareTargetButton = document.getElementById("shareTargetButton");
  dom.statusMessage = document.getElementById("statusMessage");
  dom.previewCard = document.getElementById("previewCard");
  dom.customParamsList = document.getElementById("customParamsList");
  dom.addParamButton = document.getElementById("addParamButton");
  dom.liffBadge = document.getElementById("liffBadge");
  dom.durationSummary = document.getElementById("durationSummary");
  dom.durationButtons = Array.from(document.querySelectorAll("[data-duration-minutes]"));
}

function bindEvents_() {
  dom.form.addEventListener("input", updateUi_);
  dom.startDate.addEventListener("change", handleStartDateTimeChange_);
  dom.startTime.addEventListener("change", handleStartDateTimeChange_);
  dom.endDate.addEventListener("change", handleEndDateTimeEdit_);
  dom.endTime.addEventListener("change", handleEndDateTimeEdit_);
  dom.addParamButton.addEventListener("click", () => {
    addCustomParamRow_();
    updateUi_();
  });
  for (const button of dom.durationButtons) {
    button.addEventListener("click", handleDurationButtonClick_);
  }
  dom.customParamsList.addEventListener("click", handleCustomParamClick_);
  dom.openUrlButton.addEventListener("click", openGeneratedUrl_);
  dom.copyUrlButton.addEventListener("click", copyGeneratedUrl_);
  dom.sendCurrentChatButton.addEventListener("click", sendToCurrentChat_);
  dom.shareTargetButton.addEventListener("click", shareToTargetPicker_);
}

async function initializeLiff_() {
  try {
    await liff.init({ liffId: CONFIG.liffId });

    if (!liff.isLoggedIn()) {
      setMessage_("利用を続けるためにログインします。", "default");
      liff.login();
      return;
    }

    state.liffReady = true;
    setLiffBadge_(liff.isInClient() ? "このトークで送れます" : "ブラウザで確認中");
    setMessage_("入力すると共有用の予定リンクを作れます。", "default");
  } catch (error) {
    state.liffReady = false;
    setLiffBadge_("接続エラー", true);
    setMessage_(`画面の準備に失敗しました。\n${getErrorMessage_(error)}`, "error");
  } finally {
    updateUi_();
  }
}

function updateUi_() {
  try {
    const data = getFormData_();
    const calendarUrl = createGoogleCalendarUrl_(data);

    dom.generatedUrl.value = calendarUrl;
    dom.openUrlButton.disabled = !calendarUrl;
    dom.copyUrlButton.disabled = !calendarUrl;
    dom.shareTargetButton.disabled = !calendarUrl || !state.liffReady;
    dom.sendCurrentChatButton.disabled = !calendarUrl || !state.liffReady || !liff.isInClient();

    renderPreview_(data, calendarUrl);
    updateOptionalCount_();
    updateOptionalFieldStates_();

    if (!state.liffReady) {
      return;
    }

    if (!liff.isInClient()) {
      setMessage_("このブラウザではリンク作成と共有先の選択まで使えます。今のトークに送るときはLINE内で開いてください。", "default");
    } else {
      setMessage_("このトークに送るか、送信先を選んで共有できます。", "default");
    }
  } catch (error) {
    dom.generatedUrl.value = "";
    dom.openUrlButton.disabled = true;
    dom.copyUrlButton.disabled = true;
    dom.shareTargetButton.disabled = true;
    dom.sendCurrentChatButton.disabled = true;
    renderPreviewEmpty_();
    updateOptionalCount_();
    updateOptionalFieldStates_();
    if (hasAnyRequiredInput_()) {
      setMessage_(getErrorMessage_(error), "error");
    } else if (state.liffReady) {
      setMessage_("件名と開始・完了日時を入力すると共有用リンクを作れます。", "default");
    }
  }
}

function getFormData_() {
  const title = dom.title.value.trim();
  const start = combineDateTime_(dom.startDate.value, dom.startTime.value);
  const end = combineDateTime_(dom.endDate.value, dom.endTime.value);
  const location = dom.location.value.trim();
  const url = dom.url.value.trim();
  const details = dom.details.value.trim();
  const timezone = dom.timezone.value.trim();
  const recur = dom.recur.value.trim();
  const sourceName = dom.sourceName.value.trim();
  const sourceUrl = dom.sourceUrl.value.trim();
  const customParams = getCustomParams_();

  if (!title) {
    throw new Error("件名を入力してください。");
  }

  if (!start) {
    throw new Error("開始日時を入力してください。");
  }

  if (!end) {
    throw new Error("完了日時を入力してください。");
  }

  if (start >= end) {
    throw new Error("完了日時は開始日時より後にしてください。");
  }

  if (url && !isHttpUrl_(url)) {
    throw new Error("関連URLは http:// または https:// から入力してください。");
  }

  if (sourceUrl && !isHttpUrl_(sourceUrl)) {
    throw new Error("参照元URLは http:// または https:// から入力してください。");
  }

  return {
    title,
    start,
    end,
    location,
    url,
    details,
    timezone,
    recur,
    sourceName,
    sourceUrl,
    customParams
  };
}

function createGoogleCalendarUrl_(data) {
  const params = new URLSearchParams();
  const detailLines = [];

  params.set("action", "TEMPLATE");
  params.set("text", data.title);
  params.set("dates", `${toGoogleCalendarDate_(data.start)}/${toGoogleCalendarDate_(data.end)}`);

  if (data.location) {
    params.set("location", data.location);
  }

  if (data.details) {
    detailLines.push(data.details);
  }

  if (data.url) {
    if (data.details) {
      detailLines.push("");
    }
    detailLines.push("関連URL:");
    detailLines.push(data.url);
  }

  if (detailLines.length > 0) {
    params.set("details", detailLines.join("\n"));
  }

  if (data.timezone) {
    params.set("ctz", data.timezone);
  }

  if (data.recur) {
    params.set("recur", data.recur);
  }

  if (data.sourceName) {
    params.append("sprop", `name:${data.sourceName}`);
  }

  if (data.sourceUrl) {
    params.append("sprop", `website:${data.sourceUrl}`);
  }

  for (const param of data.customParams) {
    params.append(param.key, param.value);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function createFlexMessage_(data, calendarUrl) {
  const durationLabel = formatDurationLabel_(data.start, data.end).replace("所要時間 ", "");
  const bodyContents = [
    {
      type: "text",
      text: data.title,
      wrap: true,
      size: "xl",
      weight: "bold",
      color: "#1F1F1C"
    },
    createInfoRow_("開始", formatDateTimeLabel_(data.start)),
    createInfoRow_("所要時間", durationLabel)
  ];

  if (data.location) {
    bodyContents.push(createInfoRow_("場所", data.location));
  }

  if (data.details) {
    bodyContents.push(createInfoRow_("詳細", data.details));
  }

  return {
    type: "flex",
    altText: `予定を共有: ${data.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "18px",
        contents: bodyContents
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2F2F2B",
            action: {
              type: "uri",
              label: "Googleカレンダーに予定を追加",
              uri: calendarUrl
            }
          },
          ...(data.url
            ? [
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "uri",
                    label: "関連URLを開く",
                    uri: data.url
                  }
                }
              ]
            : [])
        ]
      }
    }
  };
}

function createInfoRow_(label, value) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "md",
    paddingAll: "12px",
    backgroundColor: "#F4F4F1",
    cornerRadius: "12px",
    contents: [
      {
        type: "text",
        text: label,
        size: "xs",
        color: "#6B6860",
        weight: "bold",
        flex: 2
      },
      {
        type: "text",
        text: value,
        size: "sm",
        color: "#1F1F1C",
        wrap: true,
        flex: 5
      }
    ]
  };
}

function renderPreview_(data, calendarUrl) {
  const relatedUrlLink =
    data.url && isHttpUrl_(data.url)
      ? `<a class="preview-link secondary" href="${escapeHtml_(data.url)}" target="_blank" rel="noreferrer">関連URL</a>`
      : "";
  const durationLabel = formatDurationLabel_(data.start, data.end);
  const spansMultipleDays = !isSameCalendarDate_(data.start, data.end);

  dom.previewCard.innerHTML = `
    <span class="preview-pill">送信プレビュー</span>
    <h3 class="preview-title">${escapeHtml_(data.title)}</h3>
    <div class="preview-grid">
      <div class="preview-item">
        <div class="preview-key">開始日時</div>
        <div class="preview-value">${escapeHtml_(formatDateTimeLabel_(data.start))}</div>
      </div>
      <div class="preview-item">
        <div class="preview-key">所要時間</div>
        <div class="preview-value">${escapeHtml_(spansMultipleDays ? `${durationLabel} / 複数日にまたがる予定` : durationLabel)}</div>
      </div>
      ${
        data.location
          ? `<div class="preview-item"><div class="preview-key">場所</div><div class="preview-value">${escapeHtml_(data.location)}</div></div>`
          : ""
      }
      ${
        data.details
          ? `<div class="preview-item"><div class="preview-key">詳細</div><div class="preview-value">${escapeHtml_(data.details)}</div></div>`
          : ""
      }
      ${
        data.customParams.length
          ? `<div class="preview-item"><div class="preview-key">追加設定</div><div class="preview-value">${escapeHtml_(data.customParams.map((param) => `${param.key}=${param.value}`).join("\n"))}</div></div>`
          : ""
      }
    </div>
    <div class="preview-actions">
      <a class="preview-link primary" href="${escapeHtml_(calendarUrl)}" target="_blank" rel="noreferrer">Googleカレンダーに予定を追加</a>
      ${relatedUrlLink}
    </div>
  `;
}

function renderPreviewEmpty_() {
  dom.previewCard.innerHTML = `
    <span class="preview-pill">送信プレビュー</span>
    <h3 class="preview-title">入力待ち</h3>
    <div class="preview-grid">
      <div class="preview-item">
        <div class="preview-key">状態</div>
        <div class="preview-value">件名と開始・完了日時を入力すると、送る内容をここで確認できます。</div>
      </div>
    </div>
  `;
}

function updateOptionalCount_() {
  let count = 0;

  if (dom.timezone.value.trim() && dom.timezone.value.trim() !== state.timezone) count += 1;
  if (dom.recur.value.trim()) count += 1;
  if (dom.sourceName.value.trim()) count += 1;
  if (dom.sourceUrl.value.trim()) count += 1;
  count += getCustomParams_().length;

  dom.optionalCount.textContent = `${count}件入力中`;
}

function updateOptionalFieldStates_() {
  updateFieldStateChip_(dom.locationState, dom.location.value.trim());
  updateFieldStateChip_(dom.urlState, dom.url.value.trim());
  updateFieldStateChip_(dom.detailsState, dom.details.value.trim());
}

function updateFieldStateChip_(element, value) {
  element.textContent = value ? "入力済み" : "未入力";
}

function updateDurationSummary_() {
  const start = combineDateTime_(dom.startDate.value, dom.startTime.value);
  const end = combineDateTime_(dom.endDate.value, dom.endTime.value);

  if (!start || !end) {
    dom.durationSummary.textContent = "開始日時を入力すると所要時間を表示します。";
    return;
  }

  if (end <= start) {
    dom.durationSummary.textContent = "完了日時は開始日時より後にしてください。";
    return;
  }

  const durationLabel = formatDurationLabel_(start, end);
  const dateRangeLabel = isSameCalendarDate_(start, end)
    ? "同日内の予定です。"
    : "複数日にまたがる予定です。";
  dom.durationSummary.textContent = `${durationLabel} / ${dateRangeLabel}`;
}

function addCustomParamRow_(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "param-row";
  row.innerHTML = `
    <div class="field field-compact">
      <input type="text" data-param-key aria-label="追加パラメータのキー" placeholder="キー 例：trp" value="${escapeHtml_(key)}" />
    </div>
    <div class="field field-compact">
      <input type="text" data-param-value aria-label="追加パラメータの値" placeholder="値 例：false" value="${escapeHtml_(value)}" />
    </div>
    <button class="button button-soft button-remove" type="button" data-remove-param>×</button>
  `;
  dom.customParamsList.appendChild(row);
}

function handleCustomParamClick_(event) {
  const removeButton = event.target.closest("[data-remove-param]");
  if (!removeButton) {
    return;
  }

  removeButton.closest(".param-row").remove();

  if (!dom.customParamsList.children.length) {
    addCustomParamRow_();
  }

  updateUi_();
}

function getCustomParams_() {
  return Array.from(dom.customParamsList.querySelectorAll(".param-row"))
    .map((row) => {
      const key = row.querySelector("[data-param-key]").value.trim();
      const value = row.querySelector("[data-param-value]").value.trim();
      return { key, value };
    })
    .filter((param) => param.key && param.value);
}

async function sendToCurrentChat_() {
  try {
    const data = getFormData_();
    const message = createFlexMessage_(data, createGoogleCalendarUrl_(data));
    await liff.sendMessages([message]);
    setMessage_("このトークに送信しました。", "success");
  } catch (error) {
    setMessage_(getErrorMessage_(error), "error");
  }
}

async function shareToTargetPicker_() {
  try {
    const data = getFormData_();
    const message = createFlexMessage_(data, createGoogleCalendarUrl_(data));
    const result = await liff.shareTargetPicker([message]);
    if (result) {
      setMessage_("送信先を選んで共有しました。", "success");
      return;
    }
    setMessage_("共有はキャンセルされました。", "default");
  } catch (error) {
    setMessage_(getErrorMessage_(error), "error");
  }
}

function openGeneratedUrl_() {
  if (!dom.generatedUrl.value) {
    return;
  }
  window.open(dom.generatedUrl.value, "_blank", "noopener,noreferrer");
}

function copyGeneratedUrl_() {
  if (!dom.generatedUrl.value) {
    return;
  }

  navigator.clipboard
    .writeText(dom.generatedUrl.value)
    .then(() => setMessage_("共有リンクをコピーしました。", "success"))
    .catch((error) => setMessage_(getErrorMessage_(error), "error"));
}

function setDefaultDateTime_() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);

  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  dom.startDate.value = toDateInputValue_(start);
  dom.startTime.value = toTimeInputValue_(start);
  dom.endDate.value = toDateInputValue_(end);
  dom.endTime.value = toTimeInputValue_(end);
  syncDurationButtons_();
  updateDurationSummary_();
}

function handleStartDateTimeChange_() {
  const start = combineDateTime_(dom.startDate.value, dom.startTime.value);
  const end = combineDateTime_(dom.endDate.value, dom.endTime.value);

  if (!start) {
    updateDurationSummary_();
    updateUi_();
    return;
  }

  if (state.followStartDuration || !state.endEdited || !end || end <= start) {
    setEndFromStart_(start, state.selectedDurationMinutes);
  }

  updateDurationSummary_();
  updateUi_();
}

function handleEndDateTimeEdit_() {
  state.endEdited = true;
  state.followStartDuration = false;
  syncDurationButtons_();
  updateDurationSummary_();
  updateUi_();
}

function handleDurationButtonClick_(event) {
  const minutes = Number(event.currentTarget.dataset.durationMinutes);
  if (!minutes) {
    return;
  }

  state.selectedDurationMinutes = minutes;
  state.endEdited = true;
  state.followStartDuration = true;

  const start = combineDateTime_(dom.startDate.value, dom.startTime.value);
  if (start) {
    setEndFromStart_(start, minutes);
  }

  syncDurationButtons_();
  updateDurationSummary_();
  updateUi_();
}

function setEndFromStart_(start, minutes) {
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  dom.endDate.value = toDateInputValue_(end);
  dom.endTime.value = toTimeInputValue_(end);
}

function combineDateTime_(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const date = new Date(`${dateValue}T${timeValue}`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function hasAnyRequiredInput_() {
  return Boolean(
    dom.title.value.trim() ||
      dom.startDate.value ||
      dom.startTime.value ||
      dom.endDate.value ||
      dom.endTime.value
  );
}

function syncDurationButtons_() {
  const start = combineDateTime_(dom.startDate.value, dom.startTime.value);
  const end = combineDateTime_(dom.endDate.value, dom.endTime.value);

  if (start && end && end > start) {
    state.selectedDurationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  for (const button of dom.durationButtons) {
    const isActive = Number(button.dataset.durationMinutes) === state.selectedDurationMinutes;
    button.classList.toggle("is-active", isActive);
  }
}

function toGoogleCalendarDate_(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toDateInputValue_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue_(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatDateLabel_(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatTimeLabel_(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDateTimeLabel_(date) {
  return `${formatDateLabel_(date)} ${formatTimeLabel_(date)}`;
}

function formatDurationLabel_(start, end) {
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days}日`);
  }
  if (hours > 0) {
    parts.push(`${hours}時間`);
  }
  if (minutes > 0 || !parts.length) {
    parts.push(`${minutes}分`);
  }

  return `所要時間 ${parts.join("")}`;
}

function isSameCalendarDate_(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function setLiffBadge_(label, muted = false) {
  dom.liffBadge.textContent = label;
  dom.liffBadge.classList.toggle("is-muted", muted);
}

function setMessage_(message, tone) {
  dom.statusMessage.textContent = message;
  dom.statusMessage.classList.remove("is-error", "is-success");
  if (tone === "error") {
    dom.statusMessage.classList.add("is-error");
  }
  if (tone === "success") {
    dom.statusMessage.classList.add("is-success");
  }
}

function isHttpUrl_(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getErrorMessage_(error) {
  console.error(error);
  return "時間をおいてもう一度お試しください。";
}

function escapeHtml_(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
