import {
  app,
  assertUriLength,
  autoGrow,
  escapeHtml,
  formatPlaceLocation,
  isGoogleMapsUrl,
  isHttpUrl,
  isHttpsUrl,
  jumpAttrs,
  mapSearchUrl,
  openExternal,
  titleFromMapUrl,
  setMessage,
  shareFlex,
  toUserMessage,
  UserError
} from "./common.js?v=202610141910";
import { MAX_URI_LENGTH } from "./config.js?v=202610141910";
import { bindHeader } from "./header.js?v=202610141910";
import { createEventFlex } from "./flex.js?v=202610141910";
import { bindPlaceSearch } from "./place-search.js?v=202610141910";

const DAY_MS = 24 * 60 * 60 * 1000;
const dom = {};
const state = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
  endEdited: false,
  selectedDurationMinutes: 60,
  allDay: false,
  followStartDuration: true,
  // Google Maps から取り込んだ場所の情報
  place: { mapUrl: "", photoUrl: "" },
  header: null
};

export function initCalendarTab() {
  cacheDom_();
  setDefaultDateTime_();
  dom.timezone.value = state.timezone;
  addCustomParamRow_();
  state.header = bindHeader({ prefix: "eventHeader", defaultTitle: "予定のお知らせ", onChange: refreshCalendarTab });
  // サブタイトル・メモはプレビュー上の ＋ で足し、× で消す
  window.LineShareUI.optional(document.getElementById("eventHeaderSubRow"), { label: "サブタイトル" });
  window.LineShareUI.optional(document.getElementById("detailsRow"), { label: "メモ" });
  bindEvents_();
  refreshCalendarTab();
}

/**
 * 地図タブや URL パラメータから場所を受け取って予定に反映する。
 */
export function applyPlace({ mapUrl, title, address, photoUrl }) {
  dom.locationMapUrl.value = mapUrl;
  state.place = { mapUrl, photoUrl };
  dom.location.value = formatPlaceLocation({ title: title || titleFromMapUrl(mapUrl), address });
  dom.locationAccordion.open = true;
  refreshCalendarTab();
}

/**
 * クエリパラメータから予定のカードを作る（main.js から呼ぶ）。渡されたものだけ入れる。
 *   title                 … 件名
 *   start / end           … 開始・終了。「2026-10-18T10:00」のように日時、または「2026-10-18」で終日
 *   minutes               … 終了の代わりに長さ（分）
 *   location / mapUrl     … 場所と地図のURL、photoUrl … 写真
 *   details / url         … メモ、関連URL
 *   header / sub / color  … ヘッダーの見出し・サブタイトル・色
 */
export function applyEventQuery(params) {
  if (params.has("title")) dom.title.value = params.get("title");
  if (params.has("details")) dom.details.value = params.get("details");
  if (params.has("url")) dom.url.value = params.get("url");
  if (params.has("location") || params.has("mapUrl")) {
    const mapUrl = params.get("mapUrl") || "";
    const photoUrl = params.get("photoUrl") || "";
    dom.location.value = params.get("location") || "";
    dom.locationMapUrl.value = isGoogleMapsUrl(mapUrl) ? mapUrl : "";
    state.place = { mapUrl: dom.locationMapUrl.value, photoUrl: isHttpsUrl(photoUrl) ? photoUrl : "" };
  }

  const start = parseQueryDate_(params.get("start"));
  if (start) {
    const allDay = start.dateOnly;
    if (dom.allDayToggle.checked !== allDay) {
      dom.allDayToggle.checked = allDay;
      handleAllDayChange_();
    }
    dom.startDate.value = toDateInputValue_(start.date);
    if (!allDay) dom.startTime.value = toTimeInputValue_(start.date);
    const end = parseQueryDate_(params.get("end"));
    const minutes = Number(params.get("minutes"));
    if (end) {
      // 終日の終了日は「最終日」で受け取る（入力欄と同じ）
      dom.endDate.value = toDateInputValue_(end.date);
      if (!allDay) dom.endTime.value = toTimeInputValue_(end.date);
      state.endEdited = true;
      state.followStartDuration = false;
    } else {
      state.selectedDurationMinutes = minutes > 0 ? minutes : allDay ? 1440 : 60;
      setEndFromStart_(getStart_(), state.selectedDurationMinutes);
    }
    syncDurationButtons_();
    updateDurationSummary_();
  }

  state.header.apply({
    title: params.get("header") ?? undefined,
    subtitle: params.get("sub") ?? undefined,
    color: params.get("color") || ""
  });
  refreshCalendarTab();
}

// 「2026-10-18T10:00」か「2026-10-18」を読む。読めなければ null
function parseQueryDate_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number);
  const date = hh === undefined || Number.isNaN(hh) ? new Date(y, m - 1, d) : new Date(y, m - 1, d, hh, mm);
  if (Number.isNaN(date.getTime())) return null;
  return { date, dateOnly: match[4] === undefined };
}

export function focusCalendarTitle() {
  if (!dom.title.value.trim()) {
    dom.title.focus();
  }
}

function cacheDom_() {
  dom.form = document.getElementById("eventForm");
  dom.title = document.getElementById("title");
  dom.startDate = document.getElementById("startDate");
  dom.startTime = document.getElementById("startTime");
  dom.endDate = document.getElementById("endDate");
  dom.endTime = document.getElementById("endTime");
  dom.location = document.getElementById("location");
  dom.locationAccordion = document.getElementById("locationAccordion");
  dom.locationMapUrl = document.getElementById("locationMapUrl");
  dom.locationFindButton = document.getElementById("locationFindButton");
  dom.url = document.getElementById("url");
  dom.details = document.getElementById("details");
  dom.locationState = document.getElementById("locationState");
  dom.urlState = document.getElementById("urlState");
  dom.timezone = document.getElementById("timezone");
  dom.recur = document.getElementById("recur");
  dom.sourceName = document.getElementById("sourceName");
  dom.sourceUrl = document.getElementById("sourceUrl");
  dom.optionalCount = document.getElementById("optionalCount");
  dom.generatedUrl = document.getElementById("generatedUrl");
  dom.openUrlButton = document.getElementById("openUrlButton");
  dom.copyUrlButton = document.getElementById("copyUrlButton");
  dom.shareTargetButton = document.getElementById("shareTargetButton");
  dom.statusMessage = document.getElementById("statusMessage");
  dom.previewCard = document.getElementById("previewCard");
  dom.titleInline = document.getElementById("titleInline");
  dom.previewRows = document.getElementById("eventPreviewRows");
  dom.previewActions = document.getElementById("eventPreviewActions");
  dom.previewPhoto = document.getElementById("eventPreviewPhoto");
  dom.customParamsList = document.getElementById("customParamsList");
  dom.addParamButton = document.getElementById("addParamButton");
  dom.durationSummary = document.getElementById("durationSummary");
  dom.durationButtons = Array.from(document.querySelectorAll("[data-duration-minutes]"));
  dom.durationGroups = Array.from(document.querySelectorAll("[data-duration-group]"));
  dom.allDayToggle = document.getElementById("allDayToggle");
}

function bindEvents_() {
  // プレビューの件名と「予定」の件名は同じもの（どちらで入力してもよい）。form の input より先に写す
  dom.titleInline.addEventListener("input", () => {
    dom.title.value = dom.titleInline.value;
  });
  dom.form.addEventListener("input", refreshCalendarTab);
  dom.form.addEventListener("submit", (event) => event.preventDefault());
  dom.allDayToggle.addEventListener("change", handleAllDayChange_);
  dom.startDate.addEventListener("change", handleStartDateTimeChange_);
  dom.startTime.addEventListener("change", handleStartDateTimeChange_);
  dom.endDate.addEventListener("change", handleEndDateTimeEdit_);
  dom.endTime.addEventListener("change", handleEndDateTimeEdit_);
  dom.locationMapUrl.addEventListener("input", handleLocationMapUrlInput_);
  dom.locationFindButton.addEventListener("click", () => {
    const name = dom.location.value.trim();
    if (!name) {
      setMessage(dom.statusMessage, "先に場所名を入力してください。", "error");
      dom.location.focus();
      return;
    }
    openExternal(mapSearchUrl(name));
    setMessage(dom.statusMessage, "見つけたら「共有」→「リンクをコピー」して、URL欄に貼り付けてください。");
  });
  bindPlaceSearch({
    input: document.getElementById("locationSearchInput"),
    button: document.getElementById("locationSearchButton"),
    results: document.getElementById("locationSearchResults"),
    message: dom.statusMessage,
    onSelect: applyPlace
  });
  dom.addParamButton.addEventListener("click", () => {
    addCustomParamRow_();
    refreshCalendarTab();
  });
  for (const button of dom.durationButtons) {
    button.addEventListener("click", handleDurationButtonClick_);
  }
  dom.customParamsList.addEventListener("click", handleCustomParamClick_);
  dom.openUrlButton.addEventListener("click", openGeneratedUrl_);
  dom.copyUrlButton.addEventListener("click", copyGeneratedUrl_);
  dom.shareTargetButton.addEventListener("click", shareToTargetPicker_);
}

export function refreshCalendarTab() {
  window.LineShareUI.syncOptionals();
  updateOptionalCount_();
  updateOptionalFieldStates_();

  try {
    const data = getFormData_();
    const calendarUrl = createGoogleCalendarUrl_(data);

    dom.generatedUrl.value = calendarUrl;
    dom.openUrlButton.disabled = false;
    dom.copyUrlButton.disabled = false;
    dom.shareTargetButton.disabled = !app.liffReady;

    renderPreview_(data);
    window.LineShareUI.setPreviewError(
      dom.previewCard,
      calendarUrl.length > MAX_URI_LENGTH ? "リンクが長すぎるためLINEでは送れません。メモなどを短くしてください。" : ""
    );

    if (calendarUrl.length > MAX_URI_LENGTH) {
      setMessage(dom.statusMessage, "リンクが長すぎるためLINEでは送れません。詳細などを短くしてください。", "error");
    } else if (app.liffReady) {
      setMessage(dom.statusMessage, "共有先を選んで送れます。");
    } else {
      setMessage(dom.statusMessage, "リンクの作成とコピーができます。LINEで送るときはLINEアプリ内で開いてください。");
    }
  } catch (error) {
    dom.generatedUrl.value = "";
    dom.openUrlButton.disabled = true;
    dom.copyUrlButton.disabled = true;
    dom.shareTargetButton.disabled = true;
    renderPreviewEmpty_();
    window.LineShareUI.setPreviewError(dom.previewCard, toUserMessage(error));
    if (hasAnyRequiredInput_()) {
      setMessage(dom.statusMessage, toUserMessage(error), "error");
    } else {
      setMessage(dom.statusMessage, "件名と開始・終了日時を入れると共有用リンクを作れます。");
    }
  }
}

function getFormData_() {
  const title = dom.title.value.trim();
  const start = getStart_();
  const end = getEnd_();
  const location = dom.location.value.trim();
  const mapUrl = dom.locationMapUrl.value.trim() || mapSearchUrl(location);
  const url = dom.url.value.trim();
  const details = dom.details.value.trim();
  const timezone = dom.timezone.value.trim();
  const recur = dom.recur.value.trim();
  const sourceName = dom.sourceName.value.trim();
  const sourceUrl = dom.sourceUrl.value.trim();
  const customParams = getCustomParams_();

  if (!title) {
    throw new UserError("件名を入力してください。");
  }

  if (!start) {
    throw new UserError(state.allDay ? "開始日を入力してください。" : "開始日時を入力してください。");
  }

  if (!end) {
    throw new UserError(state.allDay ? "終了日を入力してください。" : "終了日時を入力してください。");
  }

  if (start >= end) {
    throw new UserError(state.allDay ? "終了日は開始日以降にしてください。" : "終了日時は開始日時より後にしてください。");
  }

  if (mapUrl && !isGoogleMapsUrl(mapUrl)) {
    throw new UserError("場所の地図URLはGoogle MapsのURLを入力してください。");
  }

  if (url && !isHttpUrl(url)) {
    throw new UserError("関連URLは http:// または https:// から入力してください。");
  }

  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    throw new UserError("参照元URLは http:// または https:// から入力してください。");
  }

  return {
    title,
    allDay: state.allDay,
    start,
    end,
    location,
    mapUrl,
    photoUrl: mapUrl && mapUrl === state.place.mapUrl ? state.place.photoUrl : "",
    url,
    details,
    timezone,
    recur,
    sourceName,
    sourceUrl,
    customParams,
    header: state.header?.get() ?? null
  };
}

function createGoogleCalendarUrl_(data) {
  const params = new URLSearchParams();
  const detailBlocks = [];

  params.set("action", "TEMPLATE");
  params.set("text", data.title);
  params.set(
    "dates",
    data.allDay
      ? `${toGoogleCalendarDay_(data.start)}/${toGoogleCalendarDay_(data.end)}`
      : `${toGoogleCalendarDate_(data.start)}/${toGoogleCalendarDate_(data.end)}`
  );

  if (data.location) {
    params.set("location", data.location);
  }

  if (data.details) {
    detailBlocks.push(data.details);
  }

  if (data.mapUrl) {
    detailBlocks.push(`地図:\n${data.mapUrl}`);
  }

  if (data.url) {
    detailBlocks.push(`関連URL:\n${data.url}`);
  }

  if (detailBlocks.length > 0) {
    params.set("details", detailBlocks.join("\n\n"));
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

function getFlexLabels_(data) {
  const duration = formatDurationLabel_(data.start, data.end).replace("所要時間 ", "");
  // 開始〜終了を1行目に、長さを2行目に（例：2026年10月18日(日) 10:00〜11:30 ⏎（1時間30分））
  return { when: formatWhenLabel_(data, duration) };
}

function formatWhenLabel_(data, duration) {
  if (data.allDay) {
    const lastDay = new Date(data.end.getTime() - DAY_MS);
    return isSameCalendarDate_(data.start, lastDay)
      ? `${formatDateLabel_(data.start)}\n（終日）`
      : `${formatDateLabel_(data.start)} 〜 ${formatDateLabel_(lastDay)}\n（${duration}）`;
  }
  const end = isSameCalendarDate_(data.start, data.end) ? formatTimeLabel_(data.end) : ` ${formatDateTimeLabel_(data.end)}`;
  return `${formatDateTimeLabel_(data.start)}〜${end}\n（${duration}）`;
}

// プレビューは最初に組み立てたものを使い回し、件名・メモなど入力中の欄は書き換えない
function renderPreview_(data) {
  const labels = getFlexLabels_(data);
  renderPreviewParts_({
    rows: [
      ["日時", labels.when, "date", true],
      data.location ? ["場所", data.location, "location"] : null,
      data.customParams.length
        ? ["追加設定", data.customParams.map((param) => `${param.key}=${param.value}`).join("\n"), "optional"]
        : null
    ],
    photoUrl: data.photoUrl,
    mapUrl: data.mapUrl,
    url: data.url
  });
}

// 日時がまだ正しくないとき（件名・メモの入力欄はそのまま使える）
function renderPreviewEmpty_() {
  renderPreviewParts_({
    rows: [["日時", "日時を選んでください", "date", true]],
    photoUrl: "",
    mapUrl: dom.location.value.trim() ? "pending" : "",
    url: dom.url.value.trim()
  });
}

function renderPreviewParts_({ rows, photoUrl, mapUrl, url }) {
  if (document.activeElement !== dom.titleInline) dom.titleInline.value = dom.title.value;
  // 各行・各ボタンをタップしたときに移る設定
  const jumps = {
    date: jumpAttrs("eventPanel", "startDate"),
    location: jumpAttrs("locationAccordion", "location"),
    optional: jumpAttrs("optionalAccordion")
  };
  dom.previewRows.innerHTML = rows
    .filter(Boolean)
    .map(
      // block は見出しの下に全幅で書く1列（日時）
      ([key, value, jump = "date", block = false]) =>
        `<div class="preview-item${block ? " preview-block" : ""}" ${jumps[jump]}><div class="preview-key">${key}</div><div class="preview-value">${escapeHtml(value)}</div></div>`
    )
    .join("");
  dom.previewPhoto.hidden = !photoUrl;
  if (photoUrl && dom.previewPhoto.getAttribute("src") !== photoUrl) dom.previewPhoto.src = photoUrl;
  const secondary = [
    mapUrl ? ["地図を開く", jumpAttrs("locationAccordion", "locationMapUrl")] : null,
    url ? ["関連URLを開く", jumpAttrs("urlFold", "url")] : null
  ]
    .filter(Boolean)
    .map(([label, attrs]) => `<span class="preview-link secondary" ${attrs}>${label}</span>`)
    .join("");
  dom.previewActions.innerHTML = `<span class="preview-link primary" ${jumpAttrs("calendarLinkFold")}>Googleカレンダーに予定を追加</span>${secondary}`;
  autoGrow(dom.details);
}

function updateOptionalCount_() {
  let count = 0;

  if (dom.timezone.value.trim() && dom.timezone.value.trim() !== state.timezone) count += 1;
  if (dom.recur.value.trim()) count += 1;
  if (dom.sourceName.value.trim()) count += 1;
  if (dom.sourceUrl.value.trim()) count += 1;
  count += getCustomParams_().length;

  dom.optionalCount.textContent = count ? `${count}件` : "なし";
}

// 設定欄の見出しの右には、空なら「なし」、入っていれば中身の要約を出す（全ツール共通の決まり。README）
function updateOptionalFieldStates_() {
  const location = dom.location.value.trim();
  dom.locationState.textContent = location ? shorten_(location) : dom.locationMapUrl.value.trim() ? "地図のURL" : "なし";
  dom.urlState.textContent = dom.url.value.trim() ? hostOf_(dom.url.value.trim()) : "なし";
}

function shorten_(text, max = 10) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function hostOf_(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return shorten_(url);
  }
}

function handleLocationMapUrlInput_() {
  if (dom.locationMapUrl.value.trim() !== state.place.mapUrl) {
    state.place = { mapUrl: "", photoUrl: "" };
  }
}

function updateDurationSummary_() {
  const start = getStart_();
  const end = getEnd_();

  if (!start || !end) {
    dom.durationSummary.textContent = state.allDay
      ? "開始日を入力すると日数を表示します。"
      : "開始日時を入力すると所要時間を表示します。";
    return;
  }

  if (end <= start) {
    dom.durationSummary.textContent = state.allDay
      ? "終了日は開始日以降にしてください。"
      : "終了日時は開始日時より後にしてください。";
    return;
  }

  if (state.allDay) {
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    dom.durationSummary.textContent = days === 1 ? "1日の終日予定です。" : `${days}日間の終日予定です。`;
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
    <input class="ls-input" type="text" data-param-key aria-label="追加パラメータのキー" placeholder="キー 例：trp" value="${escapeHtml(key)}" />
    <input class="ls-input" type="text" data-param-value aria-label="追加パラメータの値" placeholder="値 例：false" value="${escapeHtml(value)}" />
    <button class="ls-icon-button" type="button" data-remove-param aria-label="この項目を削除">×</button>
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

  refreshCalendarTab();
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

async function shareToTargetPicker_() {
  try {
    const data = getFormData_();
    const calendarUrl = createGoogleCalendarUrl_(data);
    assertUriLength(calendarUrl, "カレンダー登録用のリンク");
    const sent = await shareFlex(createEventFlex(data, calendarUrl, getFlexLabels_(data)));
    if (sent) window.LineShareLog?.track("send", { kind: "event" });
    setMessage(
      dom.statusMessage,
      sent ? window.LineShareLiff.MESSAGES.sent : window.LineShareLiff.MESSAGES.canceled,
      sent ? "success" : "default"
    );
  } catch (error) {
    setMessage(dom.statusMessage, toUserMessage(error, window.LineShareLiff.MESSAGES.sendFailed), "error");
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
    .then(() => setMessage(dom.statusMessage, "共有リンクをコピーしました。", "success"))
    .catch((error) => setMessage(dom.statusMessage, toUserMessage(error), "error"));
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
  const start = getStart_();
  const end = getEnd_();

  if (!start) {
    updateDurationSummary_();
    refreshCalendarTab();
    return;
  }

  if (state.followStartDuration || !state.endEdited || !end || end <= start) {
    setEndFromStart_(start, state.selectedDurationMinutes);
  }

  updateDurationSummary_();
  refreshCalendarTab();
}

function handleEndDateTimeEdit_() {
  state.endEdited = true;
  state.followStartDuration = false;
  syncDurationButtons_();
  updateDurationSummary_();
  refreshCalendarTab();
}

function handleDurationButtonClick_(event) {
  const minutes = Number(event.currentTarget.dataset.durationMinutes);
  if (!minutes) {
    return;
  }

  state.selectedDurationMinutes = minutes;
  state.endEdited = true;
  state.followStartDuration = true;

  const start = getStart_();
  if (start) {
    setEndFromStart_(start, minutes);
  }

  syncDurationButtons_();
  updateDurationSummary_();
  refreshCalendarTab();
}

function setEndFromStart_(start, minutes) {
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  if (state.allDay) {
    // 終日は終了日を「最終日」で表示する（内部では翌日 0:00 まで）
    dom.endDate.value = toDateInputValue_(new Date(end.getTime() - DAY_MS));
    return;
  }
  dom.endDate.value = toDateInputValue_(end);
  dom.endTime.value = toTimeInputValue_(end);
}

function getStart_() {
  return combineDateTime_(dom.startDate.value, state.allDay ? "00:00" : dom.startTime.value);
}

function getEnd_() {
  if (!state.allDay) {
    return combineDateTime_(dom.endDate.value, dom.endTime.value);
  }
  const lastDay = combineDateTime_(dom.endDate.value, "00:00");
  return lastDay ? new Date(lastDay.getTime() + DAY_MS) : null;
}

function handleAllDayChange_() {
  state.allDay = dom.allDayToggle.checked;
  dom.startTime.hidden = state.allDay;
  dom.endTime.hidden = state.allDay;
  for (const group of dom.durationGroups) {
    group.hidden = (group.dataset.durationGroup === "allDay") !== state.allDay;
  }

  state.selectedDurationMinutes = state.allDay ? 1440 : 60;
  state.followStartDuration = true;
  const start = getStart_();
  if (start) {
    setEndFromStart_(start, state.selectedDurationMinutes);
  }

  syncDurationButtons_();
  updateDurationSummary_();
  refreshCalendarTab();
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
  const start = getStart_();
  const end = getEnd_();

  if (start && end && end > start) {
    state.selectedDurationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  for (const button of dom.durationButtons) {
    const isActive = Number(button.dataset.durationMinutes) === state.selectedDurationMinutes;
    button.classList.toggle("is-active", isActive);
  }
}

// 終日予定は YYYYMMDD（ローカル日付）で渡す
function toGoogleCalendarDay_(date) {
  return toDateInputValue_(date).replaceAll("-", "");
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
