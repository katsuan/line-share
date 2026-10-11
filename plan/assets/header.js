// カード上部の色付きヘッダー（お知らせカードと同じ見た目）。場所・予定の両方で使う。
import { escapeHtml, jumpAttrs } from "./common.js?v=202610111213";

// 色の並びは全ツール共通（shared/ui.js の PALETTE。先頭はおくるんの紫）。最後に「ほかの色」
export const HEADER_THEMES = Object.fromEntries(window.LineShareUI.PALETTE.map((color) => [color.key, color]));

/**
 * ヘッダーの設定欄（見出し・サブタイトル・色）をつなぐ。
 * prefix は要素 id の頭（mapHeader / eventHeader）。最後に使った見出しと色は端末に残す。
 */
export function bindHeader({ prefix, defaultTitle, onChange }) {
  const el = (name) => document.getElementById(`${prefix}${name}`);
  const title = el("Title");
  const subtitle = el("Sub");
  const themes = el("Themes");
  const meta = el("Meta");
  const storageKey = `line-share:${prefix}`;
  let theme = "purple";
  let customColor = "#6c47ff";

  const saved = load_(storageKey);
  title.value = saved.title ?? defaultTitle;
  subtitle.value = saved.subtitle ?? "";
  if (/^#[0-9a-f]{6}$/i.test(saved.customColor || "")) customColor = saved.customColor;
  if (HEADER_THEMES[saved.theme] || saved.theme === "custom") theme = saved.theme;

  const buttons = Object.entries(HEADER_THEMES).map(([key, { label, start, end }]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ls-swatch";
    button.style.setProperty("--swatch", `linear-gradient(135deg, ${start}, ${end})`);
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      theme = key;
      changed();
    });
    button.dataset.theme = key;
    return button;
  });
  // ほかの色（自由に選ぶ）
  const custom = document.createElement("label");
  custom.className = "ls-swatch is-custom";
  custom.setAttribute("aria-label", "ほかの色");
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = customColor;
  picker.addEventListener("input", () => {
    customColor = picker.value;
    theme = "custom";
    changed();
  });
  custom.append(picker);
  themes.replaceChildren(...buttons, custom);

  const colors = () => (theme === "custom" ? window.LineShareUI.paletteFromColor(customColor) : HEADER_THEMES[theme]);

  function get() {
    const value = title.value.trim();
    if (!value) return null;
    const { start, end } = colors();
    return { title: value, subtitle: subtitle.value.trim(), start, end, theme };
  }

  function sync() {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
    custom.classList.toggle("is-selected", theme === "custom");
    if (theme === "custom") custom.style.setProperty("--swatch", customColor);
    const header = get();
    meta.textContent = header ? (header.title.length > 10 ? `${header.title.slice(0, 10)}…` : header.title) : "なし";
  }

  function changed() {
    save_(storageKey, { title: title.value, subtitle: subtitle.value, theme, customColor });
    sync();
    onChange();
  }

  // テンプレートから見出しだけ入れ替える（サブタイトルと色はそのまま）
  function setTitle(value) {
    title.value = value;
    changed();
  }

  title.addEventListener("input", changed);
  subtitle.addEventListener("input", changed);
  sync();
  return { get, setTitle };
}

/** プレビュー用のヘッダー（タップするとヘッダーの設定へ移る） */
export function headerPreviewHtml(header, foldId, titleInputId) {
  if (!header) return "";
  return `
    <div class="preview-header" style="background: linear-gradient(135deg, ${header.start}, ${header.end})" ${jumpAttrs(foldId, titleInputId)}>
      <p class="preview-header-title">${escapeHtml(header.title)}</p>
      ${header.subtitle ? `<p class="preview-header-sub">${escapeHtml(header.subtitle)}</p>` : ""}
    </div>`;
}

/** 送る Flex の bubble.header（お知らせカードと同じ形） */
export function headerFlex(header) {
  if (!header) return undefined;
  const contents = [{ type: "text", text: header.title, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }];
  if (header.subtitle) {
    contents.push({ type: "text", text: header.subtitle, color: "#FFFFFF", size: "xs", margin: "sm", wrap: true });
  }
  return {
    type: "box",
    layout: "vertical",
    background: { type: "linearGradient", angle: "135deg", startColor: header.start, endColor: header.end },
    paddingAll: "16px",
    contents
  };
}

function load_(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function save_(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても画面はそのまま使える
  }
}
