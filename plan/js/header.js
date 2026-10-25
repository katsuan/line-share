// 場所・予定：カードの上の色の帯（見出し・サブタイトル・色）。map.js と calendar.js が bindHeader で入力をつなぎ、card.js が headerFlex で帯を作る。

// 色の並びは全ツール共通（shared/ui.js の PALETTE。先頭はおくるんの紫）。最後に「ほかの色」
export const HEADER_THEMES = Object.fromEntries(window.LineShareUI.PALETTE.map((color) => [color.key, color]));

/**
 * ヘッダーをつなぐ。見出し・サブタイトルはプレビューの帯（${prefix}Band）の中で直接入力し、色は設定欄で選ぶ。
 * prefix は要素 id の頭（mapHeader / eventHeader）。最後に使った見出しと色は端末に残す。
 */
export function bindHeader({ prefix, defaultTitle, onChange }) {
  // 要素 id の頭を付けて要素を探す
  const el = (name) => document.getElementById(`${prefix}${name}`);
  const title = el("Title");
  const subtitle = el("Sub");
  const themes = el("Themes");
  const meta = el("Meta");
  const band = el("Band");
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

  // 選んでいる色（グラデーションの始まりと終わり）
  const colors = () => (theme === "custom" ? window.LineShareUI.paletteFromColor(customColor) : HEADER_THEMES[theme]);

  // カードに使う見出し・サブタイトル・色。見出しが空なら null
  function get() {
    const value = title.value.trim();
    if (!value) return null;
    const { start, end } = colors();
    return { title: value, subtitle: subtitle.value.trim(), start, end, theme };
  }

  // 色のボタンの押した見た目と、プレビューの帯の色をそろえる
  function sync() {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
    custom.classList.toggle("is-selected", theme === "custom");
    if (theme === "custom") custom.style.setProperty("--swatch", customColor);
    const { start, end, label } = colors();
    meta.textContent = theme === "custom" ? "ほかの色" : label;
    // 見出しが空のときは送らないので、帯を薄く点線にして「ヘッダーなし」とわかるようにする
    const on = Boolean(title.value.trim());
    band.classList.toggle("is-off", !on);
    band.style.background = on ? `linear-gradient(135deg, ${start}, ${end})` : "";
  }

  // 変わったら端末に残し、見た目をそろえて onChange を呼ぶ
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

  // クエリパラメータから入れる（渡されたものだけ変える）
  function apply({ title: newTitle, subtitle: newSubtitle, color }) {
    if (typeof newTitle === "string") title.value = newTitle;
    if (typeof newSubtitle === "string") subtitle.value = newSubtitle;
    if (HEADER_THEMES[color]) theme = color;
    else if (/^#?[0-9a-f]{6}$/i.test(color || "")) {
      customColor = `#${color.replace("#", "")}`.toLowerCase();
      picker.value = customColor;
      theme = "custom";
    }
    changed();
  }

  title.addEventListener("input", changed);
  subtitle.addEventListener("input", changed);
  sync();
  return { get, setTitle, apply };
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

// 端末に残した見出しと色を読む（読めなければ空）
function load_(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// 見出しと色を端末に残す（残せない端末ではそのまま）
function save_(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても画面はそのまま使える
  }
}
