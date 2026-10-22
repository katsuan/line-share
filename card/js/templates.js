// お知らせカード：テンプレート（用意済み data/templates.json と、自分で保存したもの）・JSON コピー

function replaceTop(value) {
  if (typeof value === "string") return value.replaceAll("{top}", TOP_URL);
  if (Array.isArray(value)) return value.map(replaceTop);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceTop(v)]));
  return value;
}

async function loadPresets() {
  const { card } = await window.LineShareUI.loadTemplates();
  PRESETS = Object.fromEntries((Array.isArray(card) ? card : []).filter((preset) => preset?.state).map((preset, index) => [preset.key || `preset${index}`, replaceTop(preset)]));
  renderTemplates();
  const preset = PRESETS[START_TEMPLATE];
  if (preset && !startedWithQuery) {
    applyTemplateState({ ...BLANK_STATE, bubbleSize: state.bubbleSize, ...preset.state });
    setStatus(preset.status || `「${preset.label}」を当てはめました。`);
  }
}

// ---- テンプレート ----

function getTemplates() {
  const templates = loadJson(TEMPLATE_KEY);
  return Array.isArray(templates) ? templates : [];
}

// 用意済み（PRESETS）と自分で保存したものを1つの一覧に並べる
// 当てはめる前の全カード（複数枚もまとめて）を覚え、数秒だけ「元に戻す」を出す
function offerUndo(message) {
  storeCurrent();
  const snapshot = { cards: structuredClone(cards), current };
  return () =>
    window.LineShareUI.toast(message, {
      actionLabel: "元に戻す",
      onAction: () => {
        restoreDeck(snapshot);
        setStatus("元に戻しました。");
      }
    });
}

// 覚えておいた全カードに戻す（前回送った内容を呼び戻すときにも使う）
function restoreDeck({ cards: saved, current: index = 0 }) {
  const restored = saved.map(hydrate);
  restored.forEach((card) => (card.bubbleSize = restored[0].bubbleSize));
  cards = restored;
  current = Math.min(index, cards.length - 1);
  state = cards[current];
  queryUrls.clear();
  applyStateToEditor();
  render();
  requestAnimationFrame(() => {
    autoGrowAll();
    renderPeeks();
  });
}

// 前回送った内容（送ったときに保存したもの。複数枚ならまとめて）
function getLastSent() {
  const saved = loadJson(LAST_SENT_KEY);
  if (Array.isArray(saved?.cards) && saved.cards.length) return saved.cards.slice(0, MAX_CARDS);
  return saved && typeof saved === "object" && !Array.isArray(saved) && Object.keys(saved).length ? [saved] : null;
}

function renderTemplates() {
  // 先頭は「前回送った内容」（あれば）。用意済みのテンプレートは横に並べ、保存したものはその下に一覧で出す
  const lastSent = getLastSent();
  const lastTile = lastSent ? presetTile("🕘", "前回送った内容", lastSent.length > 1 ? `${lastSent.length}枚まとめて戻します` : "最後に送ったカード", () => {
    const show = offerUndo("前回送った内容にしました");
    restoreDeck({ cards: lastSent, current: 0 });
    setStatus("前回送った内容を呼び戻しました。");
    show();
  }) : null;

  const builtIn = Object.values(PRESETS).map((preset) =>
    presetTile(preset.icon, preset.label, preset.description, () => {
      const show = offerUndo(`「${preset.label}」にしました`);
      applyTemplateState({ ...BLANK_STATE, bubbleSize: state.bubbleSize, ...preset.state });
      setStatus(preset.status || `「${preset.label}」を当てはめました。リンク先を入力してください。`);
      show();
    })
  );

  const saved = getTemplates().map((template) => {
    const row = document.createElement("div");
    row.className = "ls-list-row";
    const button = createTemplateButton(template.name, "保存したテンプレート", () => {
      const show = offerUndo(`「${template.name}」にしました`);
      applyTemplateState(template.state);
      setStatus(`「${template.name}」を読み込みました。`);
      show();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ls-icon-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `「${template.name}」を削除`);
    remove.addEventListener("click", () => deleteTemplate(template.name));
    row.append(button, remove);
    return row;
  });

  els.presetGrid.replaceChildren(...(lastTile ? [lastTile] : []), ...builtIn);
  els.templateList.replaceChildren(...saved);
}

// 用意済みテンプレートのタイル（アイコンと名前。説明は長押し・ホバーで出る）
function presetTile(iconText, label, description, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preset-tile";
  button.title = description || "";
  const icon = document.createElement("span");
  icon.className = "preset-tile-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = iconText;
  const name = document.createElement("span");
  name.textContent = label;
  button.append(icon, name);
  button.addEventListener("click", onClick);
  return button;
}

function createTemplateButton(title, description, onClick) {
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

function applyTemplateState(source) {
  // テンプレートは今のカードにだけ当てはめる。大きさは全カードでそろえたまま
  state = hydrate({ ...source, bubbleSize: state.bubbleSize });
  storeCurrent();
  queryUrls.clear();
  applyStateToEditor();
  render();
}

function saveTemplate() {
  const name = els.templateNameInput.value.trim();
  if (!name) {
    setStatus("保存する名前を入力してください。", true);
    els.templateNameInput.focus();
    return;
  }
  const templates = getTemplates().filter((template) => template.name !== name);
  templates.push({ name, state: getEditorState(), savedAt: new Date().toISOString() });
  saveJson(TEMPLATE_KEY, templates);
  renderTemplates();
  els.templateNameInput.value = "";
  setStatus(`「${name}」として保存しました。`);
}

function deleteTemplate(name) {
  // 聞かずに消して、「元に戻す」を出す
  const before = getTemplates();
  saveJson(TEMPLATE_KEY, before.filter((template) => template.name !== name));
  renderTemplates();
  window.LineShareUI?.toast(`「${name}」を消しました`, {
    actionLabel: "元に戻す",
    onAction: () => {
      saveJson(TEMPLATE_KEY, before);
      renderTemplates();
    }
  });
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildDeckMessage({ credit: false }), null, 2));
    setStatus("Flex Message の JSON をコピーしました。");
  } catch (error) {
    console.error(error);
    setStatus("コピーできませんでした。", true);
  }
}
