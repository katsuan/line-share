const STORAGE_KEY = "flex-builder-state-v4";
const TEMPLATE_KEY = "flex-builder-templates-v4";

const THEMES = {
  purple: {
    name: "パープル",
    baseColor: "#6C5CE7",
    backgroundColor: "#F6F7FB",
    textColor: "#1F2937",
    borderColor: "#DDD6FE"
  },
  pink: {
    name: "ピンク",
    baseColor: "#FF4D7D",
    backgroundColor: "#FFF1F5",
    textColor: "#3B1F2B",
    borderColor: "#FBCFE8"
  },
  blue: {
    name: "ブルー",
    baseColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
    textColor: "#172554",
    borderColor: "#BFDBFE"
  },
  green: {
    name: "グリーン",
    baseColor: "#22C55E",
    backgroundColor: "#F0FDF4",
    textColor: "#14532D",
    borderColor: "#BBF7D0"
  },
  orange: {
    name: "オレンジ",
    baseColor: "#F97316",
    backgroundColor: "#FFF7ED",
    textColor: "#431407",
    borderColor: "#FED7AA"
  },
  gray: {
    name: "グレー",
    baseColor: "#64748B",
    backgroundColor: "#F8FAFC",
    textColor: "#111827",
    borderColor: "#CBD5E1"
  }
};

const FORMAT_TEMPLATES = {
  emergency: {
    label: "緊急",
    summary: "重要なお知らせを最優先で伝える",
    description: "障害告知、営業時間変更、至急確認など",
    themeKey: "orange",
    title: "【緊急】重要なお知らせ",
    subtitle: "ご確認をお願いします",
    body: "現在、重要なご案内があります。詳細をご確認のうえ、必要な対応をお願いいたします。",
    useImage: false,
    useImageAction: false,
    useButtons: true,
    badges: [
      { enabled: true, text: "至急", color: "#DC2626" },
      { enabled: true, text: "重要", color: "#F97316" }
    ],
    buttons: [
      { enabled: true, label: "詳細を確認", uri: "https://example.com/urgent", color: "#DC2626" },
      { enabled: true, label: "担当へ連絡", uri: "tel:0000000000", color: "#B91C1C" }
    ],
    order: ["badges", "subtitle", "body"]
  },
  share: {
    label: "共有",
    summary: "社内外に案内や資料を共有する",
    description: "資料共有、周知、キャンペーン案内など",
    themeKey: "blue",
    title: "共有のお知らせ",
    subtitle: "関係者へ展開してください",
    body: "共有用の情報をまとめました。必要に応じてメンバーへ展開し、内容をご確認ください。",
    useImage: true,
    useImageAction: false,
    useButtons: true,
    badges: [
      { enabled: true, text: "共有", color: "#2563EB" },
      { enabled: true, text: "案内", color: "#0EA5E9" }
    ],
    buttons: [
      { enabled: true, label: "資料を見る", uri: "https://example.com/share", color: "#2563EB" },
      { enabled: true, label: "メンバーへ送る", uri: "https://example.com/forward", color: "#0F766E" }
    ],
    order: ["badges", "subtitle", "body"]
  },
  link: {
    label: "リンク誘導",
    summary: "WebやLP、予約先へ自然に誘導する",
    description: "キャンペーン、予約、商品詳細、記事導線など",
    themeKey: "green",
    title: "こちらからご確認ください",
    subtitle: "詳細ページへスムーズにご案内",
    body: "詳しい内容はリンク先にまとめています。気になる方は以下のボタンからご確認ください。",
    useImage: true,
    useImageAction: true,
    useButtons: true,
    badges: [
      { enabled: true, text: "LINK", color: "#16A34A" },
      { enabled: true, text: "CHECK", color: "#0F766E" }
    ],
    buttons: [
      { enabled: true, label: "詳細ページへ", uri: "https://example.com/link", color: "#16A34A" },
      { enabled: true, label: "予約する", uri: "https://example.com/reserve", color: "#15803D" }
    ],
    order: ["subtitle", "body", "badges"]
  }
};

const DEFAULT_STATE = {
  formatKey: "",
  title: "",
  subtitle: "数量限定メニュー",
  body: "こだわりの一品をぜひお試しください。",
  imageUrl: "",
  imageActionUrl: "",
  actionLabel: "詳しく見る",
  actionUrl: "",
  useBadges: true,
  useSubtitle: true,
  useBody: true,
  useImage: true,
  useImageAction: false,
  useButtons: true,
  bubbleSize: "mega",
  themeKey: "purple",
  theme: {
    baseColor: THEMES.purple.baseColor,
    backgroundColor: THEMES.purple.backgroundColor,
    textColor: THEMES.purple.textColor
  },
  badges: [
    { id: createId(), enabled: true, text: "おすすめ", color: "#FF6B35" },
    { id: createId(), enabled: true, text: "NEW", color: "#22C55E" }
  ],
  buttons: [
    { id: createId(), enabled: true, label: "詳しく見る", uri: "", color: "#6C5CE7" }
  ],
  order: ["badges", "subtitle", "body"]
};

const BLOCK_META = {
  badges: { label: "バッジ", required: false },
  subtitle: { label: "サブタイトル", required: false },
  body: { label: "本文", required: false }
};

let state = loadState();
const els = {};
const liffState = {
  phase: "idle",
  message: "LIFF初期化前です。",
  loggedIn: false,
  canShare: false
};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  applyStateToForm();
  renderThemePresets();
  renderBubbleSizePresets();
  renderFormatTemplates();
  renderLists();
  renderTemplateOptions();
  renderAll();
  await initLiff();
});

function bindElements() {
  [
    "titleInput",
    "subtitleInput",
    "bodyInput",
    "useBadgesInput",
    "badgesDetail",
    "badgeList",
    "badgeCountLabel",
    "addBadgeButton",
    "useImageInput",
    "imageDetail",
    "imageUrlInput",
    "useImageActionInput",
    "imageActionDetail",
    "imageActionUrlInput",
    "blockList",
    "useButtonsInput",
    "buttonsDetail",
    "buttonList",
    "buttonCountLabel",
    "addButtonButton",
    "themePresetGrid",
    "bubbleSizeGrid",
    "baseColorInput",
    "baseColorText",
    "backgroundColorInput",
    "backgroundColorText",
    "textColorInput",
    "textColorText",
    "previewArea",
    "jsonPreview",
    "statusText",
    "sendButton",
    "copyJsonButton",
    "copyJsonPreviewButton",
    "mobilePreviewButton",
    "previewPanel",
    "closePreviewButton",
    "jumpTemplateButton",
    "sendReadinessPill",
    "envText",
    "validationSummary",
    "patternPresetGrid",
    "patternSummary",
    "templatePanel",
    "templateNameInput",
    "templateSelect",
    "saveTemplateButton",
    "loadTemplateButton",
    "deleteTemplateButton"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  bindText("titleInput", "title");
  bindText("subtitleInput", "subtitle");
  bindText("bodyInput", "body");
  bindText("imageUrlInput", "imageUrl");
  bindText("imageActionUrlInput", "imageActionUrl");

  bindCheck("useBadgesInput", "useBadges");
  bindCheck("useImageInput", "useImage");
  bindCheck("useImageActionInput", "useImageAction");
  bindCheck("useButtonsInput", "useButtons");

  bindColor("baseColorInput", "baseColorText", "baseColor");
  bindColor("backgroundColorInput", "backgroundColorText", "backgroundColor");
  bindColor("textColorInput", "textColorText", "textColor");

  els.addBadgeButton.addEventListener("click", addBadge);
  els.addButtonButton.addEventListener("click", addButton);
  els.sendButton.addEventListener("click", sendFlex);
  els.copyJsonButton.addEventListener("click", copyFlexJson);
  els.copyJsonPreviewButton.addEventListener("click", copyFlexJson);

  els.mobilePreviewButton.addEventListener("click", () => {
    els.previewPanel.classList.add("is-open");
  });

  els.closePreviewButton.addEventListener("click", () => {
    els.previewPanel.classList.remove("is-open");
  });

  els.jumpTemplateButton.addEventListener("click", () => {
    els.templatePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.saveTemplateButton.addEventListener("click", saveTemplate);
  els.loadTemplateButton.addEventListener("click", loadTemplate);
  els.deleteTemplateButton.addEventListener("click", deleteTemplate);
}

function bindText(id, key) {
  els[id].addEventListener("input", (event) => {
    state[key] = event.target.value;
    if (id === "titleInput" || id === "subtitleInput" || id === "bodyInput") {
      state.formatKey = "";
    }
    renderAll();
  });
}

function bindCheck(id, key) {
  els[id].addEventListener("change", (event) => {
    state[key] = event.target.checked;
    state.formatKey = "";

    if (key === "useImage" && !state.useImage) {
      state.useImageAction = false;
    }

    renderAll();
  });
}

function bindColor(colorId, textId, key) {
  els[colorId].addEventListener("input", (event) => {
    state.theme[key] = event.target.value;
    els[textId].value = event.target.value;
    state.themeKey = "custom";
    state.formatKey = "";
    renderAll();
  });

  els[textId].addEventListener("input", (event) => {
    const value = normalizeColor(event.target.value);
    if (!value) return;

    state.theme[key] = value;
    els[colorId].value = value;
    els[textId].value = value;
    state.themeKey = "custom";
    state.formatKey = "";
    renderAll();
  });
}

async function initLiff() {
  const liffId = window.APP_CONFIG?.LIFF_ID;

  if (!liffId || liffId === "YOUR_LIFF_ID") {
    updateLiffState("error", "LIFF ID未設定です。config.jsを編集してください。");
    setStatus("LIFF ID未設定です。config.jsを編集してください。");
    renderAll();
    return;
  }

  if (!window.liff) {
    updateLiffState("error", "LIFF SDKの読み込みに失敗しました。");
    setStatus("LIFF SDKの読み込みに失敗しました。");
    renderAll();
    return;
  }

  try {
    updateLiffState("loading", "LIFFを初期化しています…");
    renderAll();
    await liff.init({ liffId });
    const loggedIn = typeof liff.isLoggedIn === "function" ? liff.isLoggedIn() : false;
    const canShare = liff.isApiAvailable("shareTargetPicker");

    if (!loggedIn && !liff.isInClient()) {
      updateLiffState("login_required", "外部ブラウザです。送信時にLINEログインへ移動します。", {
        loggedIn,
        canShare
      });
      setStatus("外部ブラウザです。送信時にLINEログインへ移動します。");
    } else if (!canShare) {
      updateLiffState("error", "この環境ではshareTargetPickerを利用できません。", {
        loggedIn,
        canShare
      });
      setStatus("この環境ではshareTargetPickerを利用できません。");
    } else {
      const readyMessage = liff.isInClient()
        ? "LINEアプリ内で送信できます。"
        : "共有先選択で送信できます。";
      updateLiffState("ready", readyMessage, { loggedIn, canShare });
      setStatus("LIFF初期化完了。");
    }
  } catch (error) {
    console.error(error);
    updateLiffState("error", `LIFF初期化エラー: ${error.message}`);
    setStatus(`LIFF初期化エラー: ${error.message}`);
  } finally {
    renderAll();
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return hydrateState();

    const parsed = JSON.parse(saved);

    return hydrateState(parsed);
  } catch {
    return hydrateState();
  }
}

function hydrateState(source = {}) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...source,
    theme: {
      ...DEFAULT_STATE.theme,
      ...(source.theme || {})
    },
    badges: normalizeItems(source.badges, DEFAULT_STATE.badges, {
      enabled: true,
      text: "バッジ",
      color: "#FF6B35"
    }),
    buttons: normalizeItems(source.buttons, DEFAULT_STATE.buttons, {
      enabled: true,
      label: "ボタン",
      uri: "",
      color: DEFAULT_STATE.theme.baseColor
    }),
    order: sanitizeOrder(source.order)
  };
}

function normalizeItems(items, fallback, defaults) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback;

  return source.map((item) => ({
    id: item.id || createId(),
    ...defaults,
    ...item
  }));
}

function sanitizeOrder(order) {
  const allowed = new Set(DEFAULT_STATE.order);
  const source = Array.isArray(order) ? order : DEFAULT_STATE.order;
  const filtered = source.filter((key) => allowed.has(key));

  DEFAULT_STATE.order.forEach((key) => {
    if (!filtered.includes(key)) filtered.push(key);
  });

  return filtered;
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyStateToForm() {
  els.titleInput.value = state.title;
  els.subtitleInput.value = state.subtitle;
  els.bodyInput.value = state.body;
  els.useBadgesInput.checked = state.useBadges;
  els.useImageInput.checked = state.useImage;
  els.imageUrlInput.value = state.imageUrl;
  els.useImageActionInput.checked = state.useImageAction;
  els.imageActionUrlInput.value = state.imageActionUrl;
  els.useButtonsInput.checked = state.useButtons;

  syncColorInputs();
  syncAccordions();
}

function syncColorInputs() {
  const colorMap = [
    ["baseColorInput", "baseColorText", "baseColor"],
    ["backgroundColorInput", "backgroundColorText", "backgroundColor"],
    ["textColorInput", "textColorText", "textColor"]
  ];

  colorMap.forEach(([colorId, textId, key]) => {
    els[colorId].value = state.theme[key];
    els[textId].value = state.theme[key];
  });

  document.documentElement.style.setProperty("--primary", state.theme.baseColor);
}

function syncAccordions() {
  els.useImageActionInput.disabled = !state.useImage;
  toggleHidden(els.badgesDetail, !state.useBadges);
  toggleHidden(els.imageDetail, !state.useImage);
  toggleHidden(els.imageActionDetail, !state.useImageAction);
  toggleHidden(els.buttonsDetail, !state.useButtons);
}

function updateTitleRequiredState() {
  const empty = !state.title.trim();
  els.titleInput.classList.toggle("is-required-missing", empty);
}

function renderAll() {
  updateTitleRequiredState();
  persistState();
  syncColorInputs();
  syncAccordions();
  renderThemePresets();
  renderBubbleSizePresets();
  renderFormatTemplates();
  renderPreview();
  renderJson();
  updateCountLabels();
  renderValidationSummary();
  updateSendButtonState();
}

function renderLists() {
  renderBadges();
  renderBlocks();
  renderButtons();
  updateCountLabels();
}

function renderFormatTemplates() {
  if (!els.patternPresetGrid) return;

  els.patternPresetGrid.innerHTML = Object.entries(FORMAT_TEMPLATES).map(([key, template]) => {
    const active = state.formatKey === key ? "is-active" : "";

    return `
      <button type="button" class="pattern-card ${active}" data-format-template="${key}">
        <span class="pattern-label">${escapeHtml(template.label)}</span>
        <strong>${escapeHtml(template.summary)}</strong>
        <small>${escapeHtml(template.description)}</small>
      </button>
    `;
  }).join("");

  els.patternPresetGrid.querySelectorAll("[data-format-template]").forEach((button) => {
    button.addEventListener("click", () => {
      applyFormatTemplate(button.dataset.formatTemplate);
    });
  });

  if (els.patternSummary) {
    els.patternSummary.textContent = getPatternSummaryLabel();
  }
}

function getPatternSummaryLabel() {
  if (!state.formatKey) return "用途に合わせて選択";

  const template = FORMAT_TEMPLATES[state.formatKey];
  return template ? `${template.label}を適用中` : "用途に合わせて選択";
}

function applyFormatTemplate(formatKey) {
  const template = FORMAT_TEMPLATES[formatKey];
  if (!template) return;

  const theme = THEMES[template.themeKey] || THEMES.purple;

  state = hydrateState({
    ...structuredClone(DEFAULT_STATE),
    formatKey,
    title: template.title,
    subtitle: template.subtitle,
    body: template.body,
    imageUrl: "",
    imageActionUrl: template.useImageAction ? "https://example.com" : "",
    useBadges: true,
    useSubtitle: true,
    useBody: true,
    useImage: template.useImage,
    useImageAction: template.useImageAction,
    useButtons: template.useButtons,
    themeKey: template.themeKey,
    theme: {
      baseColor: theme.baseColor,
      backgroundColor: theme.backgroundColor,
      textColor: theme.textColor
    },
    badges: template.badges,
    buttons: template.buttons,
    order: template.order
  });

  applyStateToForm();
  renderLists();
  renderAll();
  setStatus(`送信パターン「${template.label}」を適用しました。`);
}

function renderValidationSummary() {
  const items = [
    createValidationItem(getLiffStatusTone(), getLiffStatusTitle(), liffState.message),
    ...getValidationItems()
  ];

  els.sendReadinessPill.textContent = getSendReadinessLabel(items);
  els.sendReadinessPill.className = `send-pill ${getSendReadinessClass(items)}`;
  els.envText.textContent = getEnvironmentText();
  els.validationSummary.innerHTML = items.map((item) => `
    <li class="${item.className}">
      <strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.message)}
    </li>
  `).join("");
}

function getValidationItems() {
  const items = [];

  if (!state.title.trim()) {
    items.push(createValidationItem("error", "必須", "タイトルを入力してください。"));
  }

  if (state.useImage && !state.imageUrl.trim()) {
    items.push(createValidationItem("warning", "画像", "画像表示がONですが、画像URLが未入力です。"));
  }

  if (state.useImage && state.imageUrl.trim() && !isValidImageUrl(state.imageUrl)) {
    items.push(createValidationItem("error", "画像", "画像URLはHTTPSで始まる公開URLを指定してください。"));
  }

  if (state.useImageAction && !state.useImage) {
    items.push(createValidationItem("error", "画像アクション", "画像タップ遷移を使うには写真表示をONにしてください。"));
  }

  if (state.useImageAction && !state.imageActionUrl.trim()) {
    items.push(createValidationItem("error", "画像アクション", "画像タップ時のURLを入力してください。"));
  }

  if (state.useImageAction && state.imageActionUrl.trim() && !isValidActionUrl(state.imageActionUrl)) {
    items.push(createValidationItem("error", "画像アクション", "画像タップ時URLの形式が不正です。"));
  }

  const incompleteButtons = getIncompleteButtons();
  if (state.useButtons && incompleteButtons.length > 0) {
    items.push(createValidationItem("warning", "ボタン", "未完成のボタンは送信JSONに含まれません。"));
  }

  if (state.useButtons && getActiveButtons().length === 0) {
    items.push(createValidationItem("info", "ボタン", "有効なURIボタンがまだありません。"));
  }

  if (!hasBodyLikeContent()) {
    items.push(createValidationItem("info", "内容", "現在のメッセージはヘッダー中心です。"));
  }

  if (items.length === 0) {
    items.push(createValidationItem("success", "OK", "送信前の入力チェックを通過しています。"));
  }

  return items;
}

function createValidationItem(tone, label, message) {
  return {
    label,
    message,
    className: `is-${tone}`,
    tone
  };
}

function getEnvironmentText() {
  if (liffState.phase === "ready") {
    return "Flex JSONとLIFF環境の両方が送信可能な状態です。";
  }

  if (liffState.phase === "login_required") {
    return "共有ボタン押下時にLINEログインへ遷移し、その後送信を続けられます。";
  }

  if (liffState.phase === "loading" || liffState.phase === "idle") {
    return "LIFF初期化が完了するまで共有ボタンは待機します。";
  }

  return "LIFF環境に問題があるため、この端末では共有できない可能性があります。";
}

function getLiffStatusTone() {
  if (liffState.phase === "ready") return "success";
  if (liffState.phase === "login_required" || liffState.phase === "loading" || liffState.phase === "idle") return "info";
  return "error";
}

function getLiffStatusTitle() {
  if (liffState.phase === "ready") return "LIFF";
  if (liffState.phase === "login_required") return "ログイン";
  if (liffState.phase === "loading") return "初期化";
  return "LIFF";
}

function getSendReadinessLabel(items) {
  if (items.some((item) => item.tone === "error")) return "要修正";
  if (liffState.phase === "loading" || liffState.phase === "idle") return "準備中";
  if (liffState.phase === "login_required") return "ログイン待ち";
  if (items.some((item) => item.tone === "warning")) return "確認推奨";
  return "送信可能";
}

function getSendReadinessClass(items) {
  if (items.some((item) => item.tone === "error")) return "is-error";
  if (liffState.phase === "loading" || liffState.phase === "idle" || liffState.phase === "login_required") return "is-warning";
  if (items.some((item) => item.tone === "warning")) return "is-warning";
  return "is-ready";
}

function updateSendButtonState() {
  const hasBlockingError = getLiffStatusTone() === "error" || getValidationItems().some((item) => item.tone === "error");
  els.sendButton.disabled = hasBlockingError || liffState.phase === "loading" || liffState.phase === "idle";
}

function renderBadges() {
  els.badgeList.innerHTML = "";

  state.badges.forEach((badge, index) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="drag-handle">⋮⋮</div>
      <input class="item-toggle" type="checkbox" ${badge.enabled ? "checked" : ""} data-badge-toggle="${badge.id}" />
      <input type="text" value="${escapeAttr(badge.text)}" placeholder="バッジ文言" data-badge-text="${badge.id}" />
      <div class="color-line">
        <input type="color" value="${escapeAttr(badge.color)}" data-badge-color="${badge.id}" />
        <input type="text" value="${escapeAttr(badge.color)}" data-badge-color-text="${badge.id}" />
      </div>
      <div class="item-actions">
        <button type="button" data-badge-move="${index},-1" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-badge-move="${index},1" ${index === state.badges.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-badge-delete="${badge.id}" ${state.badges.length <= 1 ? "disabled" : ""}>🗑</button>
      </div>
    `;

    els.badgeList.appendChild(row);
  });

  els.badgeList.querySelectorAll("[data-badge-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const badge = findById(state.badges, input.dataset.badgeToggle);
      if (!badge) return;
      state.formatKey = "";
      badge.enabled = input.checked;
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const badge = findById(state.badges, input.dataset.badgeText);
      if (!badge) return;
      state.formatKey = "";
      badge.text = input.value;
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const badge = findById(state.badges, input.dataset.badgeColor);
      if (!badge) return;
      state.formatKey = "";
      badge.color = input.value;
      renderBadges();
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-color-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const color = normalizeColor(input.value);
      if (!color) return;

      const badge = findById(state.badges, input.dataset.badgeColorText);
      if (!badge) return;

      state.formatKey = "";
      badge.color = color;
      renderBadges();
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.badgeMove.split(",").map(Number);
      state.formatKey = "";
      moveArrayItem(state.badges, index, direction);
      renderBadges();
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.formatKey = "";
      state.badges = state.badges.filter((badge) => badge.id !== button.dataset.badgeDelete);
      renderBadges();
      renderAll();
    });
  });
}

function renderBlocks() {
  els.blockList.innerHTML = "";

  state.order.forEach((key, index) => {
    const meta = BLOCK_META[key];
    const isRequired = meta.required;
    const enabled = isBlockEnabled(key);

    const row = document.createElement("div");
    row.className = "item-row block-row";
    row.innerHTML = `
      <div class="drag-handle">⋮⋮</div>
      <div>
        <strong>${index + 1}. ${escapeHtml(meta.label)}</strong>
        <p class="hint">${isRequired ? "必須・非表示不可" : "表示/非表示と順番を調整できます"}</p>
      </div>
      <input class="item-toggle" type="checkbox" ${enabled ? "checked" : ""} ${isRequired ? "disabled" : ""} data-block-toggle="${key}" />
      <div class="item-actions">
        <button type="button" data-block-move="${index},-1" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-block-move="${index},1" ${index === state.order.length - 1 ? "disabled" : ""}>↓</button>
      </div>
    `;

    els.blockList.appendChild(row);
  });

  els.blockList.querySelectorAll("[data-block-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      state.formatKey = "";
      setBlockEnabled(input.dataset.blockToggle, input.checked);
      applyStateToForm();
      renderAll();
    });
  });

  els.blockList.querySelectorAll("[data-block-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.blockMove.split(",").map(Number);
      state.formatKey = "";
      moveArrayItem(state.order, index, direction);
      renderBlocks();
      renderAll();
    });
  });
}

function renderButtons() {
  els.buttonList.innerHTML = "";

  state.buttons.forEach((buttonItem, index) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="drag-handle">⋮⋮</div>
      <input class="item-toggle" type="checkbox" ${buttonItem.enabled ? "checked" : ""} data-button-toggle="${buttonItem.id}" />
      <div class="mini-field">
        <input type="text" value="${escapeAttr(buttonItem.label)}" placeholder="ボタン文言" data-button-label="${buttonItem.id}" />
        <input type="url" value="${escapeAttr(buttonItem.uri)}" placeholder="https://example.com" data-button-uri="${buttonItem.id}" />
      </div>
      <div class="color-line">
        <input type="color" value="${escapeAttr(buttonItem.color)}" data-button-color="${buttonItem.id}" />
        <input type="text" value="${escapeAttr(buttonItem.color)}" data-button-color-text="${buttonItem.id}" />
      </div>
      <div class="item-actions">
        <button type="button" data-button-move="${index},-1" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-button-move="${index},1" ${index === state.buttons.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-button-delete="${buttonItem.id}" ${state.buttons.length <= 1 ? "disabled" : ""}>🗑</button>
      </div>
    `;

    els.buttonList.appendChild(row);
  });

  els.buttonList.querySelectorAll("[data-button-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const item = findById(state.buttons, input.dataset.buttonToggle);
      if (!item) return;
      state.formatKey = "";
      item.enabled = input.checked;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-label]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonLabel);
      if (!item) return;
      state.formatKey = "";
      item.label = input.value;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-uri]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonUri);
      if (!item) return;
      state.formatKey = "";
      item.uri = input.value;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonColor);
      if (!item) return;
      state.formatKey = "";
      item.color = input.value;
      renderButtons();
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-color-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const color = normalizeColor(input.value);
      if (!color) return;

      const item = findById(state.buttons, input.dataset.buttonColorText);
      if (!item) return;

      state.formatKey = "";
      item.color = color;
      renderButtons();
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.buttonMove.split(",").map(Number);
      state.formatKey = "";
      moveArrayItem(state.buttons, index, direction);
      renderButtons();
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.formatKey = "";
      state.buttons = state.buttons.filter((item) => item.id !== button.dataset.buttonDelete);
      renderButtons();
      renderAll();
    });
  });
}

function renderThemePresets() {
  if (!els.themePresetGrid) return;

  els.themePresetGrid.innerHTML = Object.entries(THEMES).map(([key, theme]) => {
    const active = state.themeKey === key ? "is-active" : "";

    return `
      <button
        type="button"
        class="theme-card ${active}"
        data-theme="${key}"
        style="
          --theme-base:${theme.baseColor};
          --theme-bg:${theme.backgroundColor};
          --theme-text:${theme.textColor};
          --theme-border:${theme.borderColor};
        "
      >
        <div class="theme-swatch">
          <span style="background:${theme.baseColor}"></span>
          <span style="background:${theme.backgroundColor}"></span>
          <span style="background:${theme.textColor}"></span>
        </div>
        <div class="theme-name">${theme.name}</div>
      </button>
    `;
  }).join("");

  els.themePresetGrid.querySelectorAll("[data-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.theme;
      const theme = THEMES[key];

      state.formatKey = "";
      state.themeKey = key;
      state.theme = {
        baseColor: theme.baseColor,
        backgroundColor: theme.backgroundColor,
        textColor: theme.textColor
      };

      applyStateToForm();
      renderAll();
    });
  });
}

const BUBBLE_SIZES = ["nano", "micro", "kilo", "mega", "giga"];

function renderBubbleSizePresets() {
  if (!els.bubbleSizeGrid) return;

  els.bubbleSizeGrid.innerHTML = BUBBLE_SIZES.map((size) => {
    const active = state.bubbleSize === size ? "is-active" : "";
    return `<button type="button" class="size-pill ${active}" data-bubble-size="${size}">${size}</button>`;
  }).join("");

  els.bubbleSizeGrid.querySelectorAll("[data-bubble-size]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bubbleSize = button.dataset.bubbleSize;
      state.formatKey = "";
      renderBubbleSizePresets();
      renderAll();
    });
  });
}

function addBadge() {
  const colors = ["#FF6B35", "#22C55E", "#3B82F6", "#FF4D7D", "#64748B"];
  const next = state.badges.length + 1;

  state.formatKey = "";
  state.badges.push({
    id: createId(),
    enabled: true,
    text: `バッジ${next}`,
    color: colors[state.badges.length % colors.length]
  });

  renderBadges();
  renderAll();
}

function addButton() {
  const colors = [state.theme.baseColor, "#FF4D6D", "#22C55E", "#3B82F6"];
  const next = state.buttons.length + 1;

  state.formatKey = "";
  state.buttons.push({
    id: createId(),
    enabled: true,
    label: `ボタン${next}`,
    uri: "",
    color: colors[state.buttons.length % colors.length]
  });

  renderButtons();
  renderAll();
}

function isBlockEnabled(key) {
  if (key === "badges") return state.useBadges;
  if (key === "subtitle") return state.useSubtitle;
  if (key === "body") return state.useBody;
  return true;
}

function setBlockEnabled(key, enabled) {
  if (key === "badges") state.useBadges = enabled;
  if (key === "subtitle") state.useSubtitle = enabled;
  if (key === "body") state.useBody = enabled;
}

function updateCountLabels() {
  const activeBadges = state.badges.filter((badge) => badge.enabled && badge.text.trim()).length;
  const activeButtons = getActiveButtons().length;

  els.badgeCountLabel.textContent = `バッジ ${activeBadges}/${state.badges.length}`;
  els.buttonCountLabel.textContent = `ボタン ${activeButtons}/${state.buttons.length}`;
}

function createFlexMessage() {
  const blockingIssue = getValidationItems().find((item) => item.tone === "error");
  if (blockingIssue) {
    throw new Error(`${blockingIssue.label}: ${blockingIssue.message}`);
  }

  const bubble = {
    type: "bubble",
    size: state.bubbleSize || "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: state.theme.baseColor,
      paddingAll: "lg",
      contents: [
        {
          type: "text",
          text: state.title.trim(),
          weight: "bold",
          size: "lg",
          color: "#ffffff",
          wrap: true
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      backgroundColor: state.theme.backgroundColor,
      contents: createBodyContents()
    }
  };

  if (state.useImage && state.imageUrl.trim()) {
    bubble.hero = {
      type: "image",
      url: state.imageUrl.trim(),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover"
    };

    if (state.useImageAction && state.imageActionUrl.trim()) {
      bubble.hero.action = {
        type: "uri",
        uri: state.imageActionUrl.trim()
      };
    }
  }

  const buttons = getActiveButtons();

  if (state.useButtons && buttons.length > 0) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons.map((item) => ({
        type: "button",
        style: "primary",
        color: item.color,
        action: {
          type: "uri",
          label: item.label.trim(),
          uri: item.uri.trim()
        }
      }))
    };
  }

  return {
    type: "flex",
    altText: state.title.trim().slice(0, 400),
    contents: bubble
  };
}

function createBodyContents() {
  return state.order.map(createBlockContent).filter(Boolean);
}

function createBlockContent(key) {
  if (key === "badges") {
    const badges = getActiveBadges();

    if (!state.useBadges || badges.length === 0) return null;

    return {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: badges.map((badge) => ({
        type: "box",
        layout: "vertical",
        backgroundColor: badge.color,
        cornerRadius: "999px",
        paddingAll: "xs",
        flex: 0,
        contents: [
          {
            type: "text",
            text: badge.text.trim(),
            size: "xs",
            color: "#ffffff",
            align: "center",
            weight: "bold",
            flex: 0
          }
        ]
      }))
    };
  }


  if (key === "subtitle") {
    if (!state.useSubtitle || !state.subtitle.trim()) return null;

    return {
      type: "text",
      text: state.subtitle.trim(),
      size: "sm",
      color: "#64748B",
      wrap: true
    };
  }

  if (key === "body") {
    if (!state.useBody || !state.body.trim()) return null;

    return {
      type: "text",
      text: state.body.trim(),
      size: "sm",
      color: "#334155",
      wrap: true
    };
  }

  return null;
}

function renderPreview() {
  if (!state.title.trim()) {
    els.previewArea.innerHTML = `
      <div class="empty-preview">
        タイトルを入力すると<br>プレビューが表示されます。
      </div>
    `;
    return;
  }

  const hero = state.useImage && state.imageUrl.trim()
    ? `
      <div class="flex-hero">
        <img src="${escapeAttr(state.imageUrl.trim())}" alt="">
      </div>
    `
    : "";

  const bodyHtml = state.order
    .map(renderPreviewBlock)
    .filter(Boolean)
    .join("");

  const buttons = getActiveButtons();

  const footer = state.useButtons && buttons.length > 0
    ? `
      <div class="flex-button-stack">
        ${buttons.map((button) => `
          <a
            class="flex-button"
            href="${escapeAttr(button.uri)}"
            target="_blank"
            rel="noreferrer"
            style="background:${escapeAttr(button.color)}"
          >
            ${escapeHtml(button.label)}
          </a>
        `).join("")}
      </div>
    `
    : "";

  els.previewArea.innerHTML = `
    <div class="flex-bubble" style="background:${escapeAttr(state.theme.backgroundColor)}">
      <div class="flex-header" style="background:${escapeAttr(state.theme.baseColor)}">
        ${escapeHtml(state.title)}
      </div>
      ${hero}
      <div class="flex-body" style="background:${escapeAttr(state.theme.backgroundColor)}">
        ${bodyHtml || `<div class="flex-empty-body">bodyに表示する要素がありません。</div>`}
      </div>
      ${footer}
    </div>
  `;
}

function renderPreviewBlock(key) {
  if (key === "badges") {
    const badges = getActiveBadges();

    if (!state.useBadges || badges.length === 0) return "";

    return `
      <div class="preview-badge-row">
        ${badges.map((badge) => `
          <div class="flex-badge" style="background:${escapeAttr(badge.color)}">
            ${escapeHtml(badge.text)}
          </div>
        `).join("")}
      </div>
    `;
  }


  if (key === "subtitle") {
    if (!state.useSubtitle || !state.subtitle.trim()) return "";
    return `<div class="flex-subtitle">${escapeHtml(state.subtitle)}</div>`;
  }

  if (key === "body") {
    if (!state.useBody || !state.body.trim()) return "";
    return `<div class="flex-text">${escapeHtml(state.body)}</div>`;
  }

  return "";
}

function renderJson() {
  try {
    els.jsonPreview.textContent = JSON.stringify(createFlexMessage(), null, 2);
  } catch (error) {
    els.jsonPreview.textContent = error.message;
  }
}

function getActiveBadges() {
  return state.badges.filter((badge) => badge.enabled && badge.text.trim()).slice(0, 5);
}

function getActiveButtons() {
  return state.buttons
    .filter((button) => button.enabled && button.label.trim() && button.uri.trim() && isValidActionUrl(button.uri))
    .slice(0, 3);
}

function getIncompleteButtons() {
  return state.buttons.filter((button) => {
    if (!button.enabled) return false;

    const hasLabel = Boolean(button.label.trim());
    const hasUri = Boolean(button.uri.trim());
    const validUri = !hasUri || isValidActionUrl(button.uri);

    return !hasLabel || !hasUri || !validUri;
  });
}

function hasBodyLikeContent() {
  return Boolean(
    (state.useBadges && getActiveBadges().length > 0)
    || (state.useSubtitle && state.subtitle.trim())
    || (state.useBody && state.body.trim())
    || (state.useImage && state.imageUrl.trim())
    || (state.useButtons && getActiveButtons().length > 0)
  );
}

function isValidImageUrl(value) {
  return isValidUrl(value, ["https:"]);
}

function isValidActionUrl(value) {
  return isValidUrl(value, ["https:", "http:", "line:", "tel:", "mailto:"]);
}

function isValidUrl(value, protocols) {
  try {
    const parsed = new URL(value.trim());
    return protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function updateLiffState(phase, message, options = {}) {
  liffState.phase = phase;
  liffState.message = message;
  liffState.loggedIn = options.loggedIn ?? liffState.loggedIn;
  liffState.canShare = options.canShare ?? liffState.canShare;
}

async function sendFlex() {
  try {
    if (els.sendButton.disabled) {
      setStatus("送信チェックのエラーを解消してください。");
      return;
    }

    if (!window.liff || liffState.phase === "idle" || liffState.phase === "loading") {
      setStatus("LIFF初期化完了まで少し待ってから再度お試しください。");
      return;
    }

    if (typeof liff.isLoggedIn === "function" && !liff.isLoggedIn()) {
      setStatus("LINEログインへ移動します。ログイン後にもう一度共有してください。");
      liff.login();
      return;
    }

    if (!liff.isApiAvailable("shareTargetPicker")) {
      updateLiffState("error", "この環境ではshareTargetPickerを利用できません。", {
        loggedIn: true,
        canShare: false
      });
      renderAll();
      setStatus("この環境ではshareTargetPickerを利用できません。");
      return;
    }

    const message = createFlexMessage();
    const result = await liff.shareTargetPicker([message]);
    updateLiffState("ready", liff.isInClient() ? "LINEアプリ内で送信できます。" : "共有先選択で送信できます。", {
      loggedIn: true,
      canShare: true
    });
    renderAll();
    setStatus(result ? "送信しました。" : "送信がキャンセルされました。");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

async function copyFlexJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(createFlexMessage(), null, 2));
    setStatus("JSONをコピーしました。");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

function getTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setTemplates(templates) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function saveTemplate() {
  const name = els.templateNameInput.value.trim();

  if (!name) {
    setStatus("テンプレート名を入力してください。");
    return;
  }

  const templates = getTemplates();
  const payload = {
    name,
    config: structuredClone(state),
    savedAt: new Date().toISOString()
  };

  const index = templates.findIndex((item) => item.name === name);

  if (index >= 0) {
    templates[index] = payload;
  } else {
    templates.push(payload);
  }

  setTemplates(templates);
  renderTemplateOptions();
  els.templateSelect.value = name;
  setStatus(`テンプレート「${name}」を保存しました。`);
}

function loadTemplate() {
  const name = els.templateSelect.value;

  if (!name) {
    setStatus("テンプレートを選択してください。");
    return;
  }

  const template = getTemplates().find((item) => item.name === name);

  if (!template) {
    setStatus("テンプレートが見つかりません。");
    return;
  }

  state = hydrateState(template.config);

  applyStateToForm();
  renderLists();
  renderAll();
  setStatus(`テンプレート「${name}」を読み込みました。`);
}

function deleteTemplate() {
  const name = els.templateSelect.value;

  if (!name) {
    setStatus("テンプレートを選択してください。");
    return;
  }

  if (!confirm(`テンプレート「${name}」を削除しますか？`)) return;

  setTemplates(getTemplates().filter((item) => item.name !== name));
  renderTemplateOptions();
  setStatus(`テンプレート「${name}」を削除しました。`);
}

function renderTemplateOptions() {
  const templates = getTemplates();

  els.templateSelect.innerHTML = `<option value="">保存済みテンプレート</option>`;

  templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.name;
    option.textContent = template.name;
    els.templateSelect.appendChild(option);
  });
}

function moveArrayItem(array, index, direction) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= array.length) return;

  const [target] = array.splice(index, 1);
  array.splice(nextIndex, 0, target);
}

function findById(array, id) {
  return array.find((item) => item.id === id);
}

function normalizeColor(value) {
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;

  return "";
}

function toggleHidden(el, hidden) {
  el.classList.toggle("is-hidden", hidden);
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
