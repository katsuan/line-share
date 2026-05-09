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

const DEFAULT_STATE = {
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

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  applyStateToForm();
  renderThemePresets();
  renderLists();
  renderTemplateOptions();
  renderAll();
  await initLiff();
});

function bindElements() {
  [
    "titleInput",
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
    "mobilePreviewButton",
    "previewPanel",
    "closePreviewButton",
    "jumpTemplateButton",
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
    renderAll();
  });
}

function bindCheck(id, key) {
  els[id].addEventListener("change", (event) => {
    state[key] = event.target.checked;
    renderAll();
  });
}

function bindColor(colorId, textId, key) {
  els[colorId].addEventListener("input", (event) => {
    state.theme[key] = event.target.value;
    els[textId].value = event.target.value;
    state.themeKey = "custom";
    renderAll();
  });

  els[textId].addEventListener("input", (event) => {
    const value = normalizeColor(event.target.value);
    if (!value) return;

    state.theme[key] = value;
    els[colorId].value = value;
    els[textId].value = value;
    state.themeKey = "custom";
    renderAll();
  });
}

async function initLiff() {
  const liffId = window.APP_CONFIG?.LIFF_ID;

  if (!liffId || liffId === "YOUR_LIFF_ID") {
    setStatus("LIFF ID未設定です。config.jsを編集してください。");
    return;
  }

  try {
    await liff.init({ liffId });
    setStatus("LIFF初期化完了。");
  } catch (error) {
    console.error(error);
    setStatus(`LIFF初期化エラー: ${error.message}`);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(DEFAULT_STATE);

    const parsed = JSON.parse(saved);

    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      theme: {
        ...DEFAULT_STATE.theme,
        ...(parsed.theme || {})
      },
      badges: Array.isArray(parsed.badges) ? parsed.badges : structuredClone(DEFAULT_STATE.badges),
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons : structuredClone(DEFAULT_STATE.buttons),
      order: sanitizeOrder(parsed.order)
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
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
  renderPreview();
  renderJson();
  updateCountLabels();
}

function renderLists() {
  renderBadges();
  renderBlocks();
  renderButtons();
  updateCountLabels();
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
      badge.enabled = input.checked;
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const badge = findById(state.badges, input.dataset.badgeText);
      if (!badge) return;
      badge.text = input.value;
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const badge = findById(state.badges, input.dataset.badgeColor);
      if (!badge) return;
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

      badge.color = color;
      renderBadges();
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.badgeMove.split(",").map(Number);
      moveArrayItem(state.badges, index, direction);
      renderBadges();
      renderAll();
    });
  });

  els.badgeList.querySelectorAll("[data-badge-delete]").forEach((button) => {
    button.addEventListener("click", () => {
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
      setBlockEnabled(input.dataset.blockToggle, input.checked);
      applyStateToForm();
      renderAll();
    });
  });

  els.blockList.querySelectorAll("[data-block-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.blockMove.split(",").map(Number);
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
      item.enabled = input.checked;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-label]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonLabel);
      if (!item) return;
      item.label = input.value;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-uri]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonUri);
      if (!item) return;
      item.uri = input.value;
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = findById(state.buttons, input.dataset.buttonColor);
      if (!item) return;
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

      item.color = color;
      renderButtons();
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const [index, direction] = button.dataset.buttonMove.split(",").map(Number);
      moveArrayItem(state.buttons, index, direction);
      renderButtons();
      renderAll();
    });
  });

  els.buttonList.querySelectorAll("[data-button-delete]").forEach((button) => {
    button.addEventListener("click", () => {
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

function addBadge() {
  const colors = ["#FF6B35", "#22C55E", "#3B82F6", "#FF4D7D", "#64748B"];
  const next = state.badges.length + 1;

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
  const activeButtons = state.buttons.filter((button) => button.enabled && button.label.trim() && button.uri.trim()).length;

  els.badgeCountLabel.textContent = `バッジ ${activeBadges}/${state.badges.length}`;
  els.buttonCountLabel.textContent = `ボタン ${activeButtons}/${state.buttons.length}`;
}

function createFlexMessage() {
  if (!state.title.trim()) {
    throw new Error("タイトルは必須です。");
  }

  const bubble = {
    type: "bubble",
    size: "mega",
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
        width: "fit",
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
  return state.buttons.filter((button) => button.enabled && button.label.trim() && button.uri.trim()).slice(0, 3);
}

async function sendFlex() {
  try {
    const message = createFlexMessage();

    if (!window.liff || !liff.isInClient()) {
      setStatus("LINEアプリ内LIFFで開くと送信できます。");
      return;
    }

    if (!liff.isApiAvailable("shareTargetPicker")) {
      setStatus("この環境ではshareTargetPickerを利用できません。");
      return;
    }

    const result = await liff.shareTargetPicker([message]);
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

  state = {
    ...structuredClone(DEFAULT_STATE),
    ...template.config
  };

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
