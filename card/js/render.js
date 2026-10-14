// お知らせカード：プレビューと入力欄の描画（バッジ・ボタン・色）

// 「カラー」の丸を共通の並びで作る（最後の「ほかの色」は HTML にある）
function renderThemeSwatches() {
  const placeholder = document.getElementById("themeSwatches");
  placeholder.replaceWith(
    ...window.LineShareUI.PALETTE.map((color) => {
      const label = document.createElement("label");
      label.className = "ls-swatch";
      label.style.setProperty("--swatch", `linear-gradient(135deg, ${color.start}, ${color.end})`);
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "theme";
      input.value = color.key;
      const name = document.createElement("span");
      name.className = "ls-sr-only";
      name.textContent = color.label;
      label.append(input, name);
      return label;
    })
  );
}

// ---- 描画 ----

function applyStateToEditor() {
  els.headerInput.value = state.headerTitle;
  els.dateInput.value = state.date;
  els.titleInput.value = state.title;
  els.detailInput.value = state.detail;
  els.showDateToggle.checked = state.showDate;
  els.showDetailToggle.checked = state.showDetail;
  els.customColorInput.value = state.customColor;
  els.imageUrlInput.value = state.imageUrl;
  els.imageActionUrlInput.value = state.imageActionUrl;
  checkRadio("theme", state.theme);
  checkRadio("imageShape", state.imageShape);
  checkRadio("imageFit", state.imageFit);
  els.bubbleSizeRange.value = String(BUBBLE_SIZES.indexOf(state.bubbleSize));
  els.bubbleSizeLabel.textContent = state.bubbleSize;
  renderButtonList();
}

function checkRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function render() {
  const palette = getPalette();
  const kindTitle = (KINDS[state.kind] || KINDS.notice).title;
  els.pageTitle.textContent = kindTitle;
  document.title = `${kindTitle}｜おくるん`;
  els.bubbleHeader.style.background = `linear-gradient(135deg, ${palette.start} 0%, ${palette.end} 100%)`;
  els.detailInput.style.background = palette.detailBg;
  els.detailInput.style.color = palette.detailText;
  els.bubble.dataset.size = state.bubbleSize;

  els.dateInput.hidden = !state.showDate;
  els.dateInput.disabled = !state.showDate;
  els.detailInput.hidden = !state.showDetail;
  els.detailInput.disabled = !state.showDetail;

  const imageUrl = photo.uploading ? photo.localUrl : state.imageUrl.trim();
  els.heroArea.hidden = !imageUrl;
  if (imageUrl && els.heroImage.getAttribute("src") !== imageUrl) {
    els.heroImage.src = imageUrl;
  }
  const hero = getHeroSpec(palette);
  els.heroImage.style.aspectRatio = hero.ratio.replace(":", " / ");
  els.heroImage.style.objectFit = hero.mode === "fit" ? "contain" : "cover";
  els.heroImage.style.background = hero.mode === "fit" ? hero.background : "";
  els.photoShapeField.hidden = !imageUrl;
  els.photoFitField.hidden = !imageUrl || state.imageShape === "auto";
  els.photoShapeHint.textContent = hero.note;
  els.photoShapeHint.hidden = !imageUrl || !hero.note;
  els.imageWarning.hidden = photo.uploading || !imageUrl || isHttpsUrl(imageUrl);
  els.photoClearButton.hidden = !imageUrl;
  els.photoExpireNote.hidden = !isUploadedPhoto(state.imageUrl);

  renderBadgePreview(palette);
  renderItemsPreview(palette);

  els.buttonStack.replaceChildren(
    ...state.buttons.map((button) => {
      const item = document.createElement("div");
      const usable = Boolean(getSendableUrl(button.url));
      item.className = "bubble-action is-jump";
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.setAttribute("aria-label", `ボタン「${button.label.trim() || "詳しく見る"}」を編集`);
      item.classList.toggle("is-disabled", !usable);
      item.style.background = usable ? palette.start : "";
      item.textContent = button.label.trim() || "詳しく見る";
      return item;
    })
  );
  els.buttonStack.hidden = state.buttons.length === 0;
  els.buttonWarning.hidden = !state.buttons.some((button) => isBlockedQueryUrl(button.url));
  els.addButtonButton.disabled = state.buttons.length >= MAX_BUTTONS;
  updateFoldMeta();
  renderCardTabs();
  window.LineShareUI.syncOptionals();

  updateShareButtonState();
  autoGrowAll();
  saveDraftSoon();
}

// アコーディオンの見出しの右に、今の設定を短く出す（ほかのツールとそろえる）
function updateFoldMeta() {
  const count = (n) => (n ? `${n}個` : "なし");
  els.lookMeta.textContent = `${THEMES[state.theme]?.label || "カスタム"}・${state.bubbleSize}`;
  els.photoMeta.textContent = state.imageUrl.trim() || photo.uploading ? "あり" : "なし";
  els.linkMeta.textContent = count(state.buttons.length);
}

// バッジはプレビューで直接編集する。タップで文字を直し、編集中のバッジにだけ × が出る。「＋ バッジ」で増やす（最大5つ）
function renderBadgePreview(palette) {
  const editing = els.badgeRow.contains(document.activeElement);
  const items = els.badgeRow.querySelectorAll(".bubble-badge");
  if (editing && items.length === state.badges.length) {
    // 入力中は作り直さない（文字の入力が途切れないように）。色だけ合わせる
    items.forEach((item) => (item.style.background = palette.start));
  } else {
    els.badgeRow.replaceChildren(...state.badges.map((text, index) => createBadge(text, index, palette)));
  }
  els.badgeRow.hidden = state.badges.length === 0;
  els.badgeAddButton.hidden = state.badges.length >= MAX_BADGES;
}

function createBadge(text, index, palette) {
  const badge = document.createElement("span");
  badge.className = "bubble-badge";
  badge.style.background = palette.start;

  const field = document.createElement("span");
  field.className = "bubble-badge-text";
  field.contentEditable = "true";
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-label", `バッジ${index + 1}`);
  field.dataset.placeholder = "バッジ";
  field.textContent = text;
  field.addEventListener("input", () => {
    // 1行・12文字まで（改行や貼り付けた書式は消す）
    const value = field.textContent.replace(/\s+/g, " ").slice(0, 12);
    if (field.textContent !== value) field.textContent = value;
    state.badges[index] = value.trim();
    render();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      field.blur();
    }
  });
  // 空のまま離れたら消す
  field.addEventListener("blur", () => {
    if (state.badges[index] === "") {
      state.badges.splice(index, 1);
      render();
    }
  });

  const remove = removeOnEdit(`バッジ「${text}」を消す`, () => {
    state.badges.splice(index, 1);
    render();
  });

  badge.append(field, remove);
  return badge;
}

function renderButtonList() {
  els.buttonList.replaceChildren(
    ...state.buttons.map((button, index) => {
      const row = document.createElement("div");
      row.className = "button-row";

      const label = createInput("text", button.label, "ボタン文言（例：詳しく見る）", "ボタンの文言");
      label.maxLength = 40;
      label.addEventListener("input", () => {
        state.buttons[index].label = label.value;
        render();
      });

      const url = createInput("url", button.url, "https://example.com", "ボタンのリンク先");
      url.addEventListener("input", () => {
        state.buttons[index].url = url.value;
        render();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ls-icon-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "このボタンを削除");
      remove.addEventListener("click", () => {
        state.buttons.splice(index, 1);
        renderButtonList();
        render();
      });

      row.append(label, url, remove);
      return row;
    })
  );
}

function createInput(type, value, placeholder, ariaLabel) {
  const input = document.createElement("input");
  input.type = type;
  input.className = "ls-input";
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", ariaLabel);
  if (type === "url") {
    input.inputMode = "url";
    input.autocapitalize = "off";
    input.spellcheck = false;
  }
  return input;
}

function autoGrowAll() {
  for (const element of [els.titleInput, els.detailInput]) {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }
}

// ---- 色 ----

function getPalette() {
  if (state.theme !== "custom") return THEMES[state.theme];
  const base = normalizeHexColor(state.customColor);
  return {
    start: base.toUpperCase(),
    end: lightenHex(base, 0.35).toUpperCase(),
    detailBg: lightenHex(base, 0.88).toUpperCase(),
    detailText: base.toUpperCase()
  };
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : DEFAULT_CUSTOM_COLOR;
}

function lightenHex(hex, amount) {
  const num = parseInt(normalizeHexColor(hex).slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[(num >> 16) & 255, (num >> 8) & 255, num & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
