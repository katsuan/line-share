// 全ツール共通の画面の振る舞い（Q キット。window.LineShareUI）：入力中は送る帯を隠す・設定へ移る・色の並び・任意の項目の＋／×・選ぶボタンつきの入力枠（pickField）・
// プレビューの見方の切りかえ・プレビューへ戻るボタン・送ったあとのシート・通知（toast）・確認の窓（ask）・はじめての案内・進み具合・ツールの色。
// おくるんの各ページと、ほかの Q のツールが <script src="…/shared/ui.js"> で読む。
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
    // 色を白に amount だけ近づける
    const mix = (amount) => {
      const num = parseInt(hex.slice(1), 16);
      // 1つの色の値を白に近づけて、2けたの16進にする
      const channel = (c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0");
      return `#${[(num >> 16) & 255, (num >> 8) & 255, num & 255].map(channel).join("")}`.toUpperCase();
    };
    const base = hex.toUpperCase();
    return { key: "custom", label: "カスタム", start: base, end: mix(0.35), solid: base, soft: mix(0.88), ink: base };
  }

  /**
   * 消すための丸い ×（.ls-remove）。onEdit を付けると、親の行を編集しているあいだだけ出す（.is-on-edit）。
   * 押した瞬間に入力欄から外れないようにして、行の × が先に消えないようにする。
   */
  function removeButton(ariaLabel, onClick, { onEdit = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = onEdit ? "ls-remove is-on-edit" : "ls-remove";
    button.textContent = "×";
    button.setAttribute("aria-label", ariaLabel);
    if (onEdit) button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", onClick);
    return button;
  }

  /**
   * スマホでは × を押した瞬間に先に入力欄から外れて × が消え、押せないことがある。
   * 外れてから少しのあいだは、行に is-editing を付けたままにして × を出しておく。
   */
  function keepRemoveVisible(container, rowSelector) {
    container.addEventListener("focusin", (event) => event.target.closest(rowSelector)?.classList.add("is-editing"));
    container.addEventListener("focusout", (event) => {
      const row = event.target.closest(rowSelector);
      if (!row) return;
      setTimeout(() => {
        if (!row.contains(document.activeElement)) row.classList.remove("is-editing");
      }, 300);
    });
  }

  /**
   * プレビュー上の任意の項目（サブタイトル・コメントなど）を「＋」で足し、「×」で消せるようにする。
   * wrapper の中の入力欄が対象。出ているかどうかは isOn で決める（既定：文字が入っているか、＋を押した直後か）。
   * 消すときの既定は「文字を空にする」。お知らせカードのように表示の切り替えで消すときは onAdd / onRemove を渡す。
   */
  const optionals = [];

  // 任意の項目に「＋ ○○」と「×」を付ける。返す関数を呼ぶと、出す・隠すを今の中身にそろえる
  function optional(wrapper, { label, isOn, onAdd, onRemove } = {}) {
    const field = wrapper.querySelector("input, textarea");
    const on = isOn || (() => wrapper.dataset.open === "1" || field.value.trim() !== "");

    const remove = removeButton(`${label}を消す`, () => {
      if (onRemove) onRemove();
      else {
        delete wrapper.dataset.open;
        field.value = "";
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      sync();
      add.focus();
    });
    wrapper.classList.add("ls-optional");
    wrapper.append(remove);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "ls-optional-add";
    add.textContent = `＋ ${label}`;
    wrapper.after(add);

    // 中身に合わせて、項目と「＋」のどちらを出すかを決める
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

    optionals.push(sync);
    sync();
    return sync;
  }

  // テンプレートなどで中身が入れ替わったあとに、＋／×の表示をそろえる
  function syncOptionals() {
    for (const sync of optionals) sync();
  }

  /**
   * 送信プレビューの右上に「プレビューモード切替：📝 編集／👀 完成イメージ」を付ける。選んでいるモードだけ名前を出し、
   * もう一方はアイコンだけにする（読み上げは両方とも名前）。
   * 完成イメージのときは .ls-preview に is-viewing を付け、点線の枠・＋／×・案内を隠して、送ったときの見た目にする。
   * 選んだモードは端末に残し、どのツールでも同じにする。
   */
  const VIEW_KEY = "line-share:preview-viewing";
  const MODES = [
    { viewing: false, icon: "📝", name: "編集" },
    { viewing: true, icon: "👀", name: "完成イメージ" }
  ];

  // 完成イメージで見るか（端末に残した選び方）
  function loadViewing() {
    try {
      return localStorage.getItem(VIEW_KEY) === "1";
    } catch {
      return false;
    }
  }

  // 送信プレビューの右上に「📝 編集／👀 完成イメージ」の切りかえを付ける
  function setupPreviewToggles() {
    const previews = [...document.querySelectorAll(".ls-preview")];
    let viewing = loadViewing();
    const groups = previews.map((preview) => {
      const group = document.createElement("div");
      group.className = "ls-preview-mode";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "プレビューの見え方（編集・完成イメージ）");
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

    // 選んだ見方を、すべてのプレビューとボタンにそろえる
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
   * 下の設定までスクロールしてプレビューが見えなくなったら、右下に「プレビュー」ボタンを出し、押すとプレビューへ戻る。
   * プレビューが複数あるページ（場所・予定のタブ）は、いま表示されているほうへ戻る
   */
  function setupPreviewReturn() {
    const previews = [...document.querySelectorAll(".ls-preview")];
    if (!previews.length) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ls-to-preview";
    button.textContent = "👀 プレビュー";
    button.setAttribute("aria-label", "プレビューに戻る");
    button.hidden = true;
    document.body.append(button);

    // いま画面に出ているプレビュー
    const shown = () => previews.find((preview) => preview.offsetParent !== null);
    let queued = false;
    // プレビューが見えなくなったら「👀 プレビュー」のボタンを出す
    const update = () => {
      queued = false;
      const preview = shown();
      // プレビューの下の端が画面の上のほうへ消えたら出す
      button.hidden = !preview || preview.getBoundingClientRect().bottom > 60;
    };
    // 次の描画のタイミングで1回だけ update を呼ぶ
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // タブの切り替えなどで表示中のプレビューが変わったとき
    document.addEventListener("click", schedule);
    button.addEventListener("click", () => {
      shown()?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupPreviewReturn);
  else setupPreviewReturn();

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

  /**
   * data/templates.json（テンプレートや候補の中身）を読む。どのページからでも同じ場所を読むよう、このファイルの位置から決める。
   * 読めないときは空のものを返す（テンプレートが出ないだけで、ツールは使える）。
   */
  const DATA_BASE = new URL("../data/", document.currentScript?.src || location.href);
  let templates = null;

  // data/templates.json を1回だけ読む（読めなければ空のもの）
  function loadTemplates() {
    templates ||= fetch(new URL("templates.json", DATA_BASE), { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .catch((error) => {
        console.error("テンプレートを読み込めませんでした", error);
        return {};
      });
    return templates;
  }

  // ---- 送ったあと ----

  /**
   * 送り終えたら下からシートを出し、次にすることを選んでもらう（すぐ閉じない）。
   *   続けて別のトークにも送る … resend() で同じものをもう一度送る（送り先を選ぶ画面が開く）
   *   閉じる                   … LINE の中ならツールを閉じてトークに戻る
   *   もう少し作る             … シートだけ閉じて、そのまま編集を続ける
   *   ○○に戻る                … back（{ label, url }）を渡したときだけ。ほかのツールから来たときに、元のツールへ戻る
   * resend は送れたら true を返す関数（LineShareLiff.share と同じ形）
   */
  function afterSent({ resend, title = "送りました", back = null } = {}) {
    document.querySelector(".ls-sheet.is-after-sent")?.remove();
    let count = 1;
    const sheet = document.createElement("div");
    sheet.className = "ls-sheet is-after-sent";
    sheet.innerHTML = `
      <div class="ls-sheet-card" role="dialog" aria-modal="true" aria-labelledby="afterSentTitle">
        <p id="afterSentTitle" class="ls-sheet-title"></p>
        <p class="ls-hint after-sent-note" aria-live="polite"></p>
        <div class="after-sent-actions">
          <button class="ls-button is-primary is-oqrn" type="button" data-act="again">続けて別のトークにも送る</button>
          <a class="ls-button" data-act="back" hidden></a>
          <button class="ls-button" type="button" data-act="close">閉じる</button>
        </div>
        <button class="ls-sheet-cancel" type="button" data-act="stay">もう少し作る</button>
      </div>`;
    const titleEl = sheet.querySelector(".ls-sheet-title");
    const note = sheet.querySelector(".after-sent-note");
    const again = sheet.querySelector('[data-act="again"]');
    // シートの見出し（何回送ったか）と案内をそろえる
    const update = () => {
      titleEl.textContent = `✅ ${title}${count > 1 ? `（${count}回）` : ""}`;
      note.textContent = "同じ内容を、ほかのトークにも送れます。";
    };
    update();
    // シートを閉じる
    const hide = () => sheet.remove();
    again.hidden = typeof resend !== "function";
    const backLink = sheet.querySelector('[data-act="back"]');
    if (back?.url) {
      backLink.href = back.url;
      backLink.textContent = `↩ ${back.label}`;
      backLink.hidden = false;
    }
    again.addEventListener("click", async () => {
      again.disabled = true;
      try {
        if (await resend()) {
          count += 1;
          update();
        }
      } catch (error) {
        console.error(error);
        note.textContent = "送れませんでした。もう一度お試しください。";
      } finally {
        again.disabled = false;
      }
    });
    sheet.querySelector('[data-act="close"]').addEventListener("click", () => {
      hide();
      try {
        if (window.liff?.isInClient?.()) liff.closeWindow();
      } catch {
        // 閉じられない環境ではシートを閉じるだけ
      }
    });
    sheet.querySelector('[data-act="stay"]').addEventListener("click", hide);
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) hide();
    });
    document.body.append(sheet);
    again.focus();
  }

  // ---- 数秒だけ出る通知 ----

  /**
   * 画面下（送信バーの上）に数秒だけ通知を出す。actionLabel を渡すとボタンが付き、押すと onAction を呼ぶ
   * （例：テンプレートを当てはめたあとの「元に戻す」）。新しい通知が来たら前のものは消える
   */
  function toast(message, { actionLabel = "", onAction, ms = 6000 } = {}) {
    document.querySelector(".ls-toast")?.remove();
    const box = document.createElement("div");
    box.className = "ls-toast";
    box.setAttribute("role", "status");
    box.append(Object.assign(document.createElement("span"), { textContent: message }));
    // 通知を消す
    const hide = () => box.remove();
    if (actionLabel && typeof onAction === "function") {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: actionLabel });
      button.addEventListener("click", () => {
        hide();
        onAction();
      });
      box.append(button);
    }
    document.body.append(box);
    setTimeout(hide, ms);
  }

  // ---- 確認の窓 ----

  /**
   * ブラウザ標準の confirm / alert の代わり。下から出るシートで聞き、押したほうを Promise で返す（OK なら true）。
   * LINE の中で標準の窓を出すと上にドメイン名が出て浮くので、どのツールもこれを使う。
   *   ask({ title: "この作戦を消しますか？", text: "消すと元に戻せません。", ok: "消す", danger: true })
   *   ask({ title: "保存できませんでした", ok: "OK", cancel: null })   … お知らせだけ（alert の代わり）
   *   ask({ title: "作戦の名前", input: "作戦 1", ok: "決める" })   … 入力欄つき（prompt の代わり）。入れた文字か null を返す
   *   ask({ title: "長押ししてコピーしてください", input: url, readonly: true, ok: "閉じる", cancel: null })   … コピーできないとき
   * 消したあとに「元に戻す」を出せるときは、聞かずに消して toast(…, { actionLabel: "元に戻す" }) のほうがよい。
   */
  function ask({ title = "", text = "", ok = "OK", cancel = "やめる", danger = false, input = null, readonly = false, maxLength = 0 } = {}) {
    return new Promise((resolve) => {
      document.querySelector(".ls-sheet.ls-ask")?.remove();
      const before = document.activeElement;
      const sheet = document.createElement("div");
      sheet.className = "ls-sheet ls-ask";
      const card = document.createElement("div");
      card.className = "ls-sheet-card";
      card.setAttribute("role", cancel === null ? "alertdialog" : "dialog");
      card.setAttribute("aria-modal", "true");
      const head = Object.assign(document.createElement("p"), { className: "ls-sheet-title", textContent: title });
      head.id = `lsAsk${Date.now()}`;
      card.setAttribute("aria-labelledby", head.id);
      card.append(head);
      if (text) card.append(Object.assign(document.createElement("p"), { className: "ls-ask-text", textContent: text }));
      let field = null;
      if (input !== null) {
        field = Object.assign(document.createElement("input"), { className: "ls-input", value: String(input), readOnly: readonly });
        field.setAttribute("aria-label", title);
        if (maxLength) field.maxLength = maxLength;
        field.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.isComposing) done(true);
        });
        card.append(field);
      }
      const actions = Object.assign(document.createElement("div"), { className: "ls-sheet-actions" });
      // 窓を閉じて、押したほう（入力欄つきなら入れた文字か null）を返す
      const done = (value) => {
        sheet.remove();
        document.removeEventListener("keydown", onKey);
        before?.focus?.({ preventScroll: true });
        if (field && !readonly) resolve(value ? field.value : null);
        else resolve(value);
      };
      if (cancel !== null) {
        const no = Object.assign(document.createElement("button"), { type: "button", className: "ls-button", textContent: cancel });
        no.addEventListener("click", () => done(false));
        actions.append(no);
      }
      const yes = Object.assign(document.createElement("button"), {
        type: "button",
        className: `ls-button ${danger ? "is-danger-fill" : "is-primary"}`,
        textContent: ok
      });
      yes.addEventListener("click", () => done(true));
      actions.append(yes);
      card.append(actions);
      sheet.append(card);
      sheet.addEventListener("click", (event) => {
        if (event.target === sheet) done(cancel === null);
      });
      // Esc で閉じる
      const onKey = (event) => {
        if (event.key === "Escape") done(cancel === null);
      };
      document.addEventListener("keydown", onKey);
      document.body.append(sheet);
      if (field) {
        field.focus();
        field.select();
      } else {
        (cancel === null || !danger ? yes : actions.firstChild).focus();
      }
    });
  }

  // ---- はじめて使う人への案内 ----

  /**
   * ツールごとに1回だけ、短い使い方を before の直前に出す。「わかった」で消え、その端末では二度と出さない。
   * steps は1行ずつの説明（3つくらいまで）
   */
  function firstTip(key, steps, before) {
    const storageKey = `line-share:tip:${key}`;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      return; // 覚えられない環境では毎回出てしまうので出さない
    }
    if (!before?.parentNode) return;
    const tip = document.createElement("section");
    tip.className = "ls-tip";
    tip.setAttribute("aria-label", "使い方");
    const list = document.createElement("ol");
    for (const step of steps) list.append(Object.assign(document.createElement("li"), { textContent: step }));
    const ok = Object.assign(document.createElement("button"), { type: "button", className: "ls-tip-ok", textContent: "わかった" });
    ok.addEventListener("click", () => {
      tip.remove();
      try {
        localStorage.setItem(storageKey, "1");
      } catch {
        // 消すだけ
      }
    });
    tip.append(Object.assign(document.createElement("p"), { className: "ls-tip-title", textContent: "💡 使い方" }), list, ok);
    before.parentNode.insertBefore(tip, before);
  }

  // ---- 時間のかかる処理の進み具合 ----

  /**
   * label（例：「画像を保存しています」）に経過秒数を付けて、1秒ごとに show(text) を呼ぶ。
   * slowAfter 秒を過ぎたら slowNote（なぜ時間がかかるか）を添える。返り値の関数を呼ぶと止まる
   */
  function progress(label, show, { slowAfter = 6, slowNote = "画像サーバーを起こしています。はじめは30秒ほどかかることがあります。" } = {}) {
    const started = Date.now();
    // 経過秒数を出す
    const tick = () => {
      const sec = Math.floor((Date.now() - started) / 1000);
      show(`${label}… ${sec}秒${sec >= slowAfter && slowNote ? `\n${slowNote}` : ""}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }

  /**
   * ツールの色を1色で変える（Q キット）。濃い色・薄い色・薄い色の上の文字色は、その色から作る。
   * CSS の :root に書いてもよい（そのほうが開いた瞬間から色が付く）。<script … data-accent="#ec8a16"> でも呼ばれる
   */
  function setAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(String(hex || ""))) return;
    const num = parseInt(hex.slice(1), 16);
    const rgb = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    // 色の値の並びを "#rrggbb" にする
    const toHex = (values) => `#${values.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
    // 色を黒に amount だけ近づける
    const shade = (amount) => toHex(rgb.map((c) => c * (1 - amount))); // 黒に寄せる
    const style = document.documentElement.style;
    style.setProperty("--ls-accent", hex);
    style.setProperty("--ls-accent-strong", shade(0.15));
    style.setProperty("--ls-accent-soft", paletteFromColor(hex).soft);
    style.setProperty("--ls-accent-ink", shade(0.35));
  }

  const accentFromScript = document.currentScript?.dataset.accent;
  if (accentFromScript) setAccent(accentFromScript);

  /**
   * 選ぶボタンつきの入力枠（.ls-pickfield）と、その下の選択肢（.ls-picker）の開け閉め（ui.css の ls-pickfield）。
   * ボタンを押すと開く・閉じる。文字を入れているあいだも開き、入れおわったら閉じる（選択肢を押しているときは閉じない）。
   * 一度に開くのは1つだけ。開くたびに onOpen（選択肢を作りなおすところ）を呼び、しっぽを押したボタンの位置に合わせる。
   * 選択肢のボタンを押しても、入力中のキーボードは出したまま（pointerdown をとめる。カスタムの入力欄はとめない）。
   * 返すもの：{ open(), close(), toggle(), isOpen(), place() }。選んだあとに閉じるかは、ツールが close() で決める
   */
  const pickFields = new Set();
  function pickField({ field, button, input = null, picker, onOpen = () => {}, onClose = () => {}, openWhileTyping = true }) {
    let opened = false;
    let pressing = false;
    // しっぽを、押したボタンのまん中に合わせる
    const place = () => {
      if (!opened) return;
      const x = button.getBoundingClientRect().left + button.offsetWidth / 2 - picker.getBoundingClientRect().left;
      picker.style.setProperty("--tail-x", `${Math.round(x)}px`);
    };
    const set = (on) => {
      if (on === opened) return place();
      if (on) pickFields.forEach((other) => other !== api && other.close());
      opened = on;
      picker.hidden = !on;
      field.classList.toggle("is-open", on);
      button.setAttribute("aria-expanded", String(on));
      if (on) onOpen();
      else onClose();
      place();
    };
    const api = {
      open: () => set(true),
      close: () => set(false),
      toggle: () => set(!opened),
      isOpen: () => opened,
      place
    };
    pickFields.add(api);
    button.setAttribute("aria-expanded", "false");
    if (picker.id) button.setAttribute("aria-controls", picker.id);
    button.addEventListener("click", () => api.toggle());
    // 選択肢を押しているあいだは、入力欄を離れても閉じない。ボタンを押してもキーボードを出したまま
    picker.addEventListener("pointerdown", (e) => {
      pressing = true;
      if (input && document.activeElement === input && e.target.closest("button")) e.preventDefault();
    });
    document.addEventListener("pointerup", () => setTimeout(() => (pressing = false), 0));
    if (input && openWhileTyping) {
      input.addEventListener("focus", () => api.open());
      input.addEventListener("blur", () => {
        // 選択肢・ボタンへ移ったときは閉じない
        setTimeout(() => {
          if (pressing || picker.contains(document.activeElement) || document.activeElement === button) return;
          api.close();
        }, 0);
      });
    }
    picker.addEventListener("keydown", (e) => e.key === "Escape" && (api.close(), button.focus()));
    window.addEventListener("resize", place);
    return api;
  }

  window.LineShareUI = {
    jumpTo, PALETTE, paletteFromColor, optional, syncOptionals, setPreviewError, loadTemplates, removeButton, keepRemoveVisible,
    afterSent, firstTip, progress, toast, setAccent, ask, pickField
  };
})();
