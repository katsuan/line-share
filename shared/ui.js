// 全ツール共通の画面の振る舞い
(function () {
  // 文字入力中は下部の送信バーを隠し、スマホのキーボードと重ならないようにする
  const TEXT_FIELD =
    "input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=button]), textarea, [contenteditable=true]";

  document.addEventListener("focusin", (event) => {
    if (event.target.matches?.(TEXT_FIELD)) {
      document.body.classList.add("is-typing");
    }
  });
  document.addEventListener("focusout", () => {
    document.body.classList.remove("is-typing");
  });

  /**
   * 設定の場所を開いてそこへ移動し、入力欄に移る。
   * focusTargets は候補を順に並べ、画面に出ている最初のものに移る（検索欄がないときは場所名へ、など）。
   */
  function jumpTo(target, ...focusTargets) {
    const section = typeof target === "string" ? document.getElementById(target) : target;
    if (!section) return;
    if (section.tagName === "DETAILS") section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusTarget = focusTargets
      .map((item) => (typeof item === "string" ? document.getElementById(item) : item))
      .find((element) => element && element.getClientRects().length > 0);
    // スクロールが終わってから入力欄に移る（先にフォーカスするとスマホでは位置がずれる）
    setTimeout(() => {
      // なめらかなスクロールが効かない環境では、すぐにその位置へ移す
      const top = section.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) section.scrollIntoView({ block: "start" });
      focusTarget?.focus({ preventScroll: true });
    }, 400);
  }

  // プレビューの中で data-jump を付けた部分をタップすると、その設定へ移る
  // data-jump="<設定の id>" data-jump-focus="<入力欄の id（空白区切りで候補）>"
  function handleJump(event) {
    const item = event.target.closest?.("[data-jump]");
    if (!item) return false;
    event.preventDefault();
    jumpTo(item.dataset.jump, ...(item.dataset.jumpFocus || "").split(/\s+/).filter(Boolean));
    return true;
  }
  document.addEventListener("click", handleJump);
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-jump]")) handleJump(event);
  });

  /**
   * 全ツールで使う色の並び（紫・青・緑・橙・赤）。先頭はおくるんの紫で、どの画面でもこの順に並べ、最後に「ほかの色」（自由に選ぶ）を置く。
   *   start / end … グラデーション（カードのヘッダーなど）
   *   solid       … 1色で使うとき（文字・ペン・縁取り）
   *   soft        … 薄い色（背景・詳細の箱）
   *   ink         … soft の上に置く文字の色
   */
  const PALETTE = [
    { key: "purple", label: "おくるん", start: "#6C47FF", end: "#A48BFF", solid: "#6C47FF", soft: "#EFEBFF", ink: "#4A2BC4" },
    { key: "sky", label: "スカイ", start: "#2563EB", end: "#06B6D4", solid: "#3E7BFA", soft: "#DFF1FF", ink: "#1D4ED8" },
    { key: "leaf", label: "リーフ", start: "#16A34A", end: "#10B981", solid: "#30A46C", soft: "#E0F5E9", ink: "#047857" },
    { key: "sunset", label: "サンセット", start: "#F59E0B", end: "#FB7185", solid: "#F5A524", soft: "#FFF4D6", ink: "#9A3412" },
    { key: "berry", label: "ベリー", start: "#E11D48", end: "#FB7185", solid: "#E5484D", soft: "#FFE1EA", ink: "#BE123C" }
  ];

  // 1色から グラデーション・薄い色・文字色 を作る（「ほかの色」用）
  function paletteFromColor(hex) {
    const mix = (amount) => {
      const num = parseInt(hex.slice(1), 16);
      const channel = (c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0");
      return `#${[(num >> 16) & 255, (num >> 8) & 255, num & 255].map(channel).join("")}`.toUpperCase();
    };
    const base = hex.toUpperCase();
    return { key: "custom", label: "カスタム", start: base, end: mix(0.35), solid: base, soft: mix(0.88), ink: base };
  }

  /**
   * プレビュー上の任意の項目（サブタイトル・コメントなど）を「＋」で足し、「−」で消せるようにする。
   * wrapper の中の入力欄が対象。出ているかどうかは isOn で決める（既定：文字が入っているか、＋を押した直後か）。
   * 消すときの既定は「文字を空にする」。お知らせカードのように表示の切り替えで消すときは onAdd / onRemove を渡す。
   */
  const optionals = [];

  function optional(wrapper, { label, isOn, onAdd, onRemove } = {}) {
    const field = wrapper.querySelector("input, textarea");
    const on = isOn || (() => wrapper.dataset.open === "1" || field.value.trim() !== "");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ls-optional-remove";
    remove.textContent = "−";
    remove.setAttribute("aria-label", `${label}を消す`);
    wrapper.classList.add("ls-optional");
    wrapper.append(remove);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "ls-optional-add";
    add.textContent = `＋ ${label}`;
    wrapper.after(add);

    function sync() {
      const shown = on();
      wrapper.hidden = !shown;
      add.hidden = shown;
    }

    add.addEventListener("click", () => {
      if (onAdd) onAdd();
      else wrapper.dataset.open = "1";
      sync();
      field.focus();
    });
    remove.addEventListener("click", () => {
      if (onRemove) onRemove();
      else {
        delete wrapper.dataset.open;
        field.value = "";
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      sync();
      add.focus();
    });

    optionals.push(sync);
    sync();
    return sync;
  }

  // テンプレートなどで中身が入れ替わったあとに、＋／−の表示をそろえる
  function syncOptionals() {
    for (const sync of optionals) sync();
  }

  /**
   * 送信プレビューの右上に「プレビューモード切替：📝 編集／👀 完成イメージ」を付ける。選んでいるモードだけ名前を出し、
   * もう一方はアイコンだけにする（読み上げは両方とも名前）。
   * 完成イメージのときは .ls-preview に is-viewing を付け、点線の枠・＋／−・案内を隠して、送ったときの見た目にする。
   * 選んだモードは端末に残し、どのツールでも同じにする。
   */
  const VIEW_KEY = "line-share:preview-viewing";
  const MODES = [
    { viewing: false, icon: "📝", name: "編集" },
    { viewing: true, icon: "👀", name: "完成イメージ" }
  ];

  function loadViewing() {
    try {
      return localStorage.getItem(VIEW_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setupPreviewToggles() {
    const previews = [...document.querySelectorAll(".ls-preview")];
    let viewing = loadViewing();
    const groups = previews.map((preview) => {
      const group = document.createElement("div");
      group.className = "ls-preview-mode";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "プレビューモード切替");
      const buttons = MODES.map((mode) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", mode.name);
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = mode.icon;
        const name = document.createElement("span");
        name.className = "ls-preview-mode-name";
        name.setAttribute("aria-hidden", "true");
        name.textContent = mode.name;
        button.append(icon, name);
        button.addEventListener("click", () => {
          viewing = mode.viewing;
          try {
            localStorage.setItem(VIEW_KEY, viewing ? "1" : "0");
          } catch {
            // 残せなくても切り替えはできる
          }
          apply();
        });
        return button;
      });
      group.append(...buttons);
      preview.prepend(group);
      return buttons;
    });

    function apply() {
      previews.forEach((preview, index) => {
        preview.classList.toggle("is-viewing", viewing);
        groups[index].forEach((button, i) => button.setAttribute("aria-pressed", String(MODES[i].viewing === viewing)));
        // 完成イメージのときは、カードの中の入力やタップを止める（📝 で編集に戻る）
        if (viewing && preview.contains(document.activeElement)) document.activeElement.blur();
      });
    }
    apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupPreviewToggles);
  else setupPreviewToggles();

  /**
   * 今の内容では送れない理由を、「送信プレビュー」とカードのあいだに出す（空の文字で消す）。
   * target はプレビューの中の要素か id。表示は完成イメージのときだけ（編集中は送信バーの案内で足りる）。
   */
  function setPreviewError(target, message) {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    const preview = element?.closest(".ls-preview");
    if (!preview) return;
    let slot = preview.querySelector(":scope > .ls-preview-error");
    if (!slot) {
      slot = document.createElement("p");
      slot.className = "ls-preview-error";
      slot.setAttribute("role", "status");
      const label = preview.querySelector(":scope > .ls-preview-label");
      if (label) label.after(slot);
      else preview.prepend(slot);
    }
    slot.textContent = message ? `⚠️ ${message}` : "";
    slot.hidden = !message;
  }

  window.LineShareUI = { jumpTo, PALETTE, paletteFromColor, optional, syncOptionals, setPreviewError };
})();
