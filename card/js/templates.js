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
function renderTemplates() {
  // 用意済みのテンプレートは横に並べ、保存したものはその下に一覧で出す
  const builtIn = Object.values(PRESETS).map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-tile";
    button.title = preset.description;
    const icon = document.createElement("span");
    icon.className = "preset-tile-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = preset.icon;
    const name = document.createElement("span");
    name.textContent = preset.label;
    button.append(icon, name);
    button.addEventListener("click", () => {
      applyTemplateState({ ...BLANK_STATE, bubbleSize: state.bubbleSize, ...preset.state });
      setStatus(preset.status || `「${preset.label}」を当てはめました。リンク先を入力してください。`);
    });
    return button;
  });

  const saved = getTemplates().map((template) => {
    const row = document.createElement("div");
    row.className = "ls-list-row";
    const button = createTemplateButton(template.name, "保存したテンプレート", () => {
      applyTemplateState(template.state);
      setStatus(`「${template.name}」を読み込みました。`);
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

  els.presetGrid.replaceChildren(...builtIn);
  els.templateList.replaceChildren(...saved);
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
  if (!confirm(`「${name}」を削除しますか？`)) return;
  saveJson(TEMPLATE_KEY, getTemplates().filter((template) => template.name !== name));
  renderTemplates();
  setStatus(`「${name}」を削除しました。`);
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
