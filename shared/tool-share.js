// ほかのツール（さくせん盤・キロっく・ぽもくる・ひっくり・くろのす・ジェンダーリビール・くじ）に置く「📤 ○○を紹介する」の窓口。
// 押すとシートを出し、「LINE にカードで送る（おくるん）」か「リンクでシェア」を選べる。
// 上に「つぎにおすすめ」（hub-links.json の next があるツールだけ）、下に「この端末の記録をバックアップ」（/backup/）。
// 開くたびに「最近使ったツール」（localStorage の conneqt:recent）を覚え、おくるん HOME に出す。
// その下に「くらぶ 〜Qlove〜」（Q＋love。くらしの部室＝Q のツールが集まるところ）：1行目に名前と説明、2行目におくるんとほかのツールのアイコンが少しずつ横に流れつづける帯（ふえても1行のまま。触れているあいだは止まる）。タップするとおくるん HOME の「ほかのツール」と同じく、
// 紹介画像・名前・キャッチコピー・説明と「○○を開く」のシートを出す（いきなり移らない）。
// フッターの名前の後ろに、ときどき季節の絵文字（shared/season.js）。window.QSeason は各ツールの文（トーストなど）にも使える。
// カードはおくるんのお知らせカード（/card/）に中身を渡して作る。色はツールの色。
//
// 使い方（各ツールの HTML）
//   <div data-tool-share></div>   … ボタンを置く場所（なければページの最後に置く）
//   <script src="https://katsuan.github.io/line-share/shared/tool-share.js" data-tool="kiloq" defer></script>
//
// 紹介の中身（名前・英字・キャッチコピー・色・OGP 画像・説明・URL）は data/hub-links.json の items（key が data-tool と同じもの）から読む。
// HOME の「ほかのツール」と同じ1か所で直せる。どのツールも katsuan.github.io の下にあるので、そのまま読める。
(function () {
  "use strict";

  const script = document.currentScript;
  const toolKey = script && script.dataset.tool;
  if (!toolKey) return;

  const BASE = new URL("..", script.src); // https://katsuan.github.io/line-share/

  // 最近使ったツール（おくるん HOME の「最近つかった」に出す）。どのツールも katsuan.github.io の下なので、保存場所は共通
  const RECENT_KEY = "conneqt:recent";
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((row) => row && row.key !== toolKey);
    list.unshift({ key: toolKey, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    // 覚えられない環境では何もしない
  }

  // 端末の記録を、ブラウザが勝手に消さないようにお願いする（できない環境では何も起きない）
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // そのまま
  }

  // おくるんのカードの入口（shared/oqrn.js）。ツールがまだ読んでいなければ、ここで読む
  const oqrnReady = window.OQRN
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        const tag = document.createElement("script");
        tag.src = new URL("shared/oqrn.js", BASE).href;
        tag.onload = resolve;
        tag.onerror = reject;
        document.head.appendChild(tag);
      });

  // 季節の絵文字（shared/season.js → window.QSeason）。ツールの文にも使えるよう、ここで読んでおく（待たない）
  const seasonReady = window.QSeason
    ? Promise.resolve(window.QSeason)
    : new Promise((resolve) => {
        const tag = document.createElement("script");
        tag.src = new URL("shared/season.js?v=20261024", BASE).href;
        tag.onload = () => resolve(window.QSeason || null);
        tag.onerror = () => resolve(null);
        document.head.appendChild(tag);
      });

  // おくるんのお知らせカードを、ツールの紹介の中身を入れた状態で開く URL
  function cardUrl(tool) {
    // ヘッダーは名前、サブタイトル（お知らせカードの date 欄）に英字の名前
    const params = new URLSearchParams({
      headerTitle: tool.name,
      date: tool.en ? `〜${tool.en}〜` : "",
      showDate: tool.en ? "true" : "false",
      // 見出しはキャッチコピー（なければ一文の説明）。説明は本文へ
      title: tool.copy || tool.lead || tool.desc || "",
      detail: (tool.copy ? [tool.lead, tool.intro] : [tool.intro]).filter(Boolean).join("\n"),
      theme: "custom",
      customColor: tool.color || "#6C47FF",
      showAction: "true",
      actionLabel: `${tool.name}を開く`,
      actionUrl: tool.url,
      from: `${toolKey}-intro` // おくるん側で、どのツールの紹介から来たかを数える（流入口）
    });
    if (tool.ogp) params.set("imageUrl", tool.ogp);
    return window.OQRN.cardUrl(params);
  }

  function injectStyle(color) {
    const style = document.createElement("style");
    style.textContent = `
      .oqrn-share { display: flex; flex-direction: column; align-items: center; gap: 14px; margin: 20px 0 8px; }
      /* コネクト：1行目に名前と説明、2行目にツールのアイコンが横に流れつづける帯（終わりなくくり返す。ふえても1行のまま） */
      .oqrn-family { display: grid; justify-items: center; gap: 4px; width: min(100%, 440px); font-family: inherit; line-height: 1.4; }
      .oqrn-family-head { margin: 0; color: var(--ls-subtext, #8a877e); font-size: 11px; line-height: 1.9; white-space: nowrap; }
      .oqrn-family-label { font-weight: 800; letter-spacing: 0.04em; }
      .oqrn-family-sep { margin: 0 6px; opacity: 0.5; }
      .oqrn-family-head rt { font-size: 7px; font-weight: 700; }
      .oqrn-family-viewport {
        width: 100%; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; -webkit-overflow-scrolling: touch;
        -webkit-mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
        mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
      }
      .oqrn-family-viewport::-webkit-scrollbar { display: none; }
      .oqrn-family-list { display: flex; width: max-content; margin: 0; padding: 0; list-style: none; }
      /* 動きを減らす設定の端末では流さず、指で横に流すだけ（くり返しの2回目は出さない） */
      @media (prefers-reduced-motion: reduce) {
        .oqrn-family-list li[aria-hidden="true"] { display: none; }
      }
      .oqrn-family-list li { flex: 0 0 auto; }
      .oqrn-family-list button {
        display: grid; justify-items: center; gap: 3px; width: 54px; padding: 4px 0; border: 0; border-radius: 10px;
        background: none; color: var(--ls-subtext, #6b6860); font: inherit; font-size: 10px; font-weight: 700; line-height: 1.2; cursor: pointer;
      }
      .oqrn-family-list button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .oqrn-family-list img { display: block; width: 32px; height: 32px; }
      .oqrn-next {
        display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: min(100%, 400px);
        padding: 10px 14px; border: 1px solid var(--ls-line, #e3e0d8); border-radius: 16px; background: var(--ls-surface, #fff);
        color: var(--ls-text, #23211c); font: inherit; font-size: 14px; line-height: 1.45; text-align: left; cursor: pointer;
      }
      .oqrn-next img { width: 36px; height: 36px; }
      .oqrn-next small { display: block; color: var(--ls-subtext, #6b6860); font-size: 12px; font-weight: 700; }
      .oqrn-next b { display: block; font-size: 15px; }
      .oqrn-next-arrow { color: var(--ls-faint, #a3a29b); }
      .oqrn-backup { color: var(--ls-subtext, #6b6860); font-size: 12px; font-weight: 700; text-decoration: none; }
      .oqrn-backup:active { text-decoration: underline; }
      .oqrn-tool-ogp { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 14px; background: var(--ls-surface-sub, #eeece6); }
      .oqrn-tool-copy { margin: -4px 0 0; font-size: 16px; font-weight: 800; line-height: 1.5; }
      .oqrn-tool-lead { margin: -4px 0 0; color: var(--ls-subtext, #6b6860); font-size: 14px; line-height: 1.6; }
      .oqrn-tool-open {
        display: block; min-height: 48px; padding: 13px 16px; border-radius: 999px; color: #fff;
        font-size: 15px; font-weight: 800; line-height: 22px; text-align: center; text-decoration: none;
      }
      .oqrn-share-open {
        display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 18px;
        border: 1px solid ${color}55; border-radius: 999px; background: ${color}14; color: inherit;
        font: inherit; font-size: 15px; font-weight: 700; cursor: pointer;
      }
      .oqrn-sheet {
        position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center;
        padding: 16px 12px calc(12px + env(safe-area-inset-bottom, 0px)); background: rgba(20, 20, 18, 0.45);
      }
      .oqrn-sheet[hidden] { display: none; }
      .oqrn-sheet-card {
        display: grid; gap: 10px; width: min(100%, 440px); padding: 20px; border-radius: 22px;
        background: var(--ls-surface, #fff); color: var(--ls-text, #23211c); font-family: inherit; font-size: 15px; line-height: 1.5; text-align: left; /* 置いた先のページの文字の大きさを受け継がない（ぽもくるは画面基準の大きな字） */
      }
      .oqrn-sheet-title { margin: 0; font-size: 17px; font-weight: 800; }
      .oqrn-sheet-option {
        display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--ls-line-strong, #e3e0d8); border-radius: 14px;
        background: var(--ls-surface, #fff); color: inherit; font: inherit; font-size: 15px; font-weight: 800; text-align: left; cursor: pointer;
        text-decoration: none;
      }
      .oqrn-sheet-option.is-primary { border-color: ${color}; box-shadow: inset 4px 0 0 ${color}; }
      .oqrn-sheet-option small { color: var(--ls-subtext, #6b6860); font-size: 13px; font-weight: 500; }
      .oqrn-sheet-status { min-height: 1em; margin: 0; color: var(--ls-subtext, #6b6860); font-size: 13px; }
      .oqrn-sheet-close {
        min-height: 44px; border: 0; background: transparent; color: var(--ls-subtext, #6b6860); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  // おくるん自身（hub-links.json には入っていないので、ここで持つ）
  const OQRN_ITEM = {
    name: "おくるん",
    en: "OQRN",
    copy: "つくって、おくるん💬",
    color: "#6C47FF",
    lead: "写真やボタン付きのカードを、LINEで送れます",
    intro: "場所・予定・お知らせ・文字や手書きを、カードや画像にしてトークに送れます"
  };

  // なかまのシート（おくるん HOME の「ほかのツール」をタップしたときと同じ中身）
  function toolSheet() {
    const sheet = document.createElement("div");
    sheet.className = "oqrn-sheet";
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="oqrn-sheet-card" role="dialog" aria-modal="true" aria-labelledby="oqrnToolTitle">
        <img class="oqrn-tool-ogp" alt="" width="1200" height="630">
        <p id="oqrnToolTitle" class="oqrn-sheet-title"></p>
        <p class="oqrn-tool-copy"></p>
        <p class="oqrn-tool-lead"></p>
        <a class="oqrn-tool-open"></a>
        <button class="oqrn-sheet-close" type="button" data-close>閉じる</button>
      </div>`;
    document.body.appendChild(sheet);
    const $ = (selector) => sheet.querySelector(selector);
    let opener = null;
    const hide = () => {
      sheet.hidden = true;
      opener?.focus();
    };
    $("[data-close]").addEventListener("click", hide);
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !sheet.hidden) hide();
    });
    return (item, from) => {
      opener = from;
      $(".oqrn-tool-ogp").src = item.ogp || "";
      $(".oqrn-tool-ogp").hidden = !item.ogp;
      $(".oqrn-tool-ogp").alt = `${item.name}の紹介画像`;
      $(".oqrn-sheet-title").textContent = item.en ? `${item.name} 〜${item.en}〜` : item.name;
      $(".oqrn-tool-copy").textContent = item.copy || "";
      $(".oqrn-tool-copy").hidden = !item.copy;
      $(".oqrn-tool-copy").style.color = item.color || "";
      $(".oqrn-tool-lead").textContent = [item.lead, item.intro].filter(Boolean).map((text) => text.replace(/[。．]$/, "")).join("。") + "。";
      const open = $(".oqrn-tool-open");
      open.href = item.url;
      open.textContent = `${item.name}を開く ↗`;
      open.style.background = item.color || "#6C47FF";
      sheet.hidden = false;
      open.focus();
    };
  }

  // 「くらぶ 〜Qlove〜」（Q のツールが集まる、くらしの部室の名前）：おくるん（トップ）と、このツール以外のツールのアイコン。押すとなかまのシートを出す
  // 「｜Qらし《くらし》」の形をルビにする（data/hub-links.json の lead。HTML は入れない）
  function withRuby(text) {
    const parts = [];
    const pattern = /｜([^《]+)《([^》]+)》/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) parts.push(document.createTextNode(text.slice(last, match.index)));
      const ruby = document.createElement("ruby");
      const rt = document.createElement("rt");
      rt.textContent = match[2];
      ruby.append(match[1], rt);
      parts.push(ruby);
      last = pattern.lastIndex;
    }
    if (last < text.length) parts.push(document.createTextNode(text.slice(last)));
    return parts;
  }

  function familyRow(tool, others, lead, title) {
    const nav = document.createElement("nav");
    nav.className = "oqrn-family";
    nav.setAttribute("aria-label", "くらぶ（Qlove）");
    // 1行目：名前と、名前だけでは伝わらないので補足をひとこと
    const head = document.createElement("p");
    head.className = "oqrn-family-head";
    head.append(
      Object.assign(document.createElement("span"), { className: "oqrn-family-label", textContent: title || "くらぶ 〜Qlove〜" }),
      Object.assign(document.createElement("span"), { className: "oqrn-family-sep", textContent: "｜" }),
      ...withRuby(lead || "くらしの部室")
    );
    // ときどき、その時期の絵文字をひとつ（イベントの時期は出やすい）
    seasonReady.then((season) => {
      const emoji = season && season.maybe();
      if (emoji) head.append(Object.assign(document.createElement("span"), { className: "oqrn-family-season", textContent: ` ${emoji}` }));
    });
    // 2行目：アイコンの帯。同じ並びを2回つないで左へ流し、半分進んだら頭に戻す（終わりなく続いて見える）
    const viewport = document.createElement("div");
    viewport.className = "oqrn-family-viewport";
    const list = document.createElement("ul");
    list.className = "oqrn-family-list";
    const oqrn = Object.assign({}, OQRN_ITEM, {
      appIcon: new URL("shared/icon.svg", BASE).href,
      ogp: new URL("shared/ogp.png?v=20261019", BASE).href,
      url: window.OQRN?.top || BASE.href
    });
    const showTool = sharedToolSheet();
    const items = [oqrn, ...others].filter((item) => item.appIcon && item.url);
    const addItem = (item, copy) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.title = item.en ? `${item.name}（${item.en}）` : item.name;
      button.setAttribute("aria-haspopup", "dialog");
      const img = document.createElement("img");
      img.src = item.appIcon;
      img.alt = "";
      img.width = img.height = 32;
      button.setAttribute("aria-label", button.title);
      button.append(img, Object.assign(document.createElement("span"), { textContent: item.short || item.name }));
      button.addEventListener("click", () => showTool(item, button));
      if (copy) {
        // 2回目の並びは見た目だけ（読み上げ・Tab では1回だけ）
        li.setAttribute("aria-hidden", "true");
        button.tabIndex = -1;
      }
      li.appendChild(button);
      list.appendChild(li);
    };
    items.forEach((item) => addItem(item, false));
    items.forEach((item) => addItem(item, true));
    viewport.appendChild(list);
    flowBand(viewport, list, items.length);
    nav.append(head, viewport);
    return nav;
  }

  // アイコンの帯を、横にスクロールする枠として少しずつ流す（指でつかめば、そのまま前後に送れる）。
  // 同じ並びが2回あるので、半分まで進んだら（戻ったら）半分ずらして、終わりなく続いて見せる。
  // 触れている・指で送ったあとの少しのあいだ・マウスを乗せている・キーボード（Tab）で選んでいるあいだは流さない。
  // 1つのアイコンが 3 秒くらいで流れる速さ（ふえても同じ速さ）。動きを減らす設定の端末では流さない
  function flowBand(viewport, list, count) {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    // マウスを乗せたら止めるのは、マウスのある端末だけ（スマホは押したあとも :hover が残るため）
    const mouse = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    let pos = 0; // 小数まで持つ（scrollLeft は丸められることがある）
    let heldUntil = 0;
    let touching = false;
    let last = 0;
    const half = () => list.scrollWidth / 2;
    const hold = (ms) => (heldUntil = Math.max(heldUntil, performance.now() + ms));
    // 端まで来たら、半分ずらして続きに見せる。見せる位置は 1〜半分+1 のあいだ
    // （ちょうど 0 と半分の両方を端にすると、ずらした先がまた端になって、行ったり来たりが止まらない）
    const wrap = () => {
      const h = half();
      if (!h || still?.matches) return;
      if (viewport.scrollLeft >= h + 1) viewport.scrollLeft -= h;
      else if (viewport.scrollLeft < 1) viewport.scrollLeft += h;
      else return;
      pos = viewport.scrollLeft;
    };
    viewport.addEventListener("pointerdown", () => ((touching = true), hold(1500)));
    ["pointerup", "pointercancel"].forEach((type) => viewport.addEventListener(type, () => ((touching = false), hold(1500))));
    viewport.addEventListener("touchstart", () => ((touching = true), hold(1500)), { passive: true });
    viewport.addEventListener("touchend", () => ((touching = false), hold(1500)), { passive: true });
    viewport.addEventListener("wheel", () => hold(1500), { passive: true });
    viewport.addEventListener("scroll", () => {
      // 自分で流した分でなければ、指（または慣性）で送った分。そこから続けて、少し待ってから流しなおす
      if (Math.abs(viewport.scrollLeft - pos) > 2) {
        pos = viewport.scrollLeft;
        hold(1500);
      }
      if (!touching) wrap();
    }, { passive: true });
    const step = (now) => {
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      const paused = touching || now < heldUntil || still?.matches || (mouse?.matches && viewport.matches(":hover")) || Boolean(viewport.querySelector(":focus-visible")) || document.hidden;
      if (!paused && half()) {
        pos += (half() / (Math.max(count, 4) * 3000)) * dt;
        if (pos >= half() + 1) pos -= half();
        viewport.scrollLeft = pos;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // なかまのシートは1つだけ作って使い回す（「つぎにおすすめ」とアイコンの欄の両方から開く）
  let toolSheetOpen = null;
  function sharedToolSheet() {
    toolSheetOpen ||= toolSheet();
    return toolSheetOpen;
  }

  // 「つぎにおすすめ」：このツールのあとに使うと便利なツールを1つだけ（hub-links.json の next）
  function nextCard(tool, others) {
    const target = tool.next && others.find((item) => item.key === tool.next.key);
    if (!target) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oqrn-next";
    button.setAttribute("aria-haspopup", "dialog");
    const img = Object.assign(document.createElement("img"), { src: target.appIcon || "", alt: "", width: 36, height: 36 });
    const text = document.createElement("span");
    text.append(
      Object.assign(document.createElement("small"), { textContent: "つぎにおすすめ" }),
      Object.assign(document.createElement("b"), { textContent: target.name }),
      document.createTextNode(tool.next.why || target.desc || "")
    );
    const arrow = Object.assign(document.createElement("span"), { className: "oqrn-next-arrow", textContent: "›" });
    arrow.setAttribute("aria-hidden", "true");
    button.append(img, text, arrow);
    button.addEventListener("click", () => sharedToolSheet()(target, button));
    return button;
  }

  // この端末の記録のバックアップ（おくるんの /backup/。ConneQt の全ツールの記録を1つのファイルにまとめる）
  function backupLink() {
    const link = document.createElement("a");
    link.className = "oqrn-backup";
    link.href = new URL(`backup/?from=${encodeURIComponent(toolKey)}`, BASE).href;
    link.textContent = "💾 この端末の記録をバックアップ";
    return link;
  }

  function build(tool, others = [], lead = "", title = "") {
    injectStyle(tool.color || "#6C47FF");

    let host = document.querySelector("[data-tool-share]");
    if (!host) {
      host = document.createElement("div");
      (document.querySelector("main") || document.body).appendChild(host);
    }
    host.classList.add("oqrn-share");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "oqrn-share-open";
    open.setAttribute("aria-haspopup", "dialog");
    open.textContent = `📤 ${tool.name}を紹介する`;
    const next = nextCard(tool, others);
    if (next) host.appendChild(next);
    host.appendChild(open);
    host.appendChild(familyRow(tool, others, lead, title));
    host.appendChild(backupLink());

    const sheet = document.createElement("div");
    sheet.className = "oqrn-sheet";
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="oqrn-sheet-card" role="dialog" aria-modal="true" aria-labelledby="oqrnShareTitle">
        <p id="oqrnShareTitle" class="oqrn-sheet-title"></p>
        <a class="oqrn-sheet-option is-primary" data-card>🪧 LINEにカードで送る<small>おくるんで紹介カードを作って、友だち・グループに送ります</small></a>
        <button class="oqrn-sheet-option" type="button" data-link>🔗 リンクでシェア<small>リンクを共有します（共有できないときはコピー）</small></button>
        <p class="oqrn-sheet-status" role="status"></p>
        <button class="oqrn-sheet-close" type="button" data-close>閉じる</button>
      </div>`;
    document.body.appendChild(sheet);
    const $ = (selector) => sheet.querySelector(selector);
    $(".oqrn-sheet-title").textContent = `${tool.name}を紹介する`;
    $("[data-card]").href = cardUrl(tool);
    const status = $(".oqrn-sheet-status");

    const show = () => {
      status.textContent = "";
      sheet.hidden = false;
      $("[data-card]").focus();
    };
    const hide = () => {
      sheet.hidden = true;
      open.focus();
    };
    open.addEventListener("click", show);
    $("[data-close]").addEventListener("click", hide);
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !sheet.hidden) hide();
    });

    $("[data-link]").addEventListener("click", async () => {
      const data = { title: tool.en ? `${tool.name}（${tool.en}）` : tool.name, text: tool.lead || tool.desc || "", url: tool.url };
      try {
        if (navigator.share) {
          await navigator.share(data);
          status.textContent = "";
          return;
        }
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(tool.url);
        status.textContent = "リンクをコピーしました。";
      } catch {
        if (window.LineShareUI?.ask) window.LineShareUI.ask({ title: "長押ししてコピーしてください", input: tool.url, readonly: true, ok: "閉じる", cancel: null });
        else status.textContent = tool.url;
      }
    });
  }

  Promise.all([fetch(new URL("data/hub-links.json", BASE), { cache: "no-cache" }), oqrnReady])
    .then(([response]) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((data) => {
      const items = (data.items || []).filter((item) => item && item.url);
      const tool = items.find((item) => item.key === toolKey);
      if (!tool) return;
      const others = items.filter((item) => item.key !== toolKey);
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => build(tool, others, data.lead, data.title));
      else build(tool, others, data.lead, data.title);
    })
    .catch((error) => console.error("紹介の中身を読み込めませんでした", error));
})();
