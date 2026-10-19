// ほかのツール（さくせん盤・キロっく・ぽもくる・ひっくり・くろのす・ジェンダーリビール・くじ）に置く「📤 ○○を紹介する」の窓口。
// 押すとシートを出し、「LINE にカードで送る（おくるん）」か「リンクでシェア」を選べる。
// その下に「コネクト 〜ConneQt〜」（Connect＋Q。Q のツールをつなぐ仕組み：おくるんと、ほかのツールのアイコン）を並べる。タップするとおくるん HOME の「ほかのツール」と同じく、
// 紹介画像・名前・キャッチコピー・説明と「○○を開く」のシートを出す（いきなり移らない）。
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
      .oqrn-family { display: grid; justify-items: center; gap: 6px; font-family: inherit; line-height: 1.4; }
      .oqrn-family-label { margin: 0; color: #8a877e; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; }
      .oqrn-family-sub { margin: -2px 0 2px; color: #8a877e; font-size: 11px; line-height: 1.9; }
      .oqrn-family-sub rt { font-size: 8px; font-weight: 700; }
      .oqrn-family-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 0; padding: 0; list-style: none; }
      .oqrn-family-list button { display: block; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 9px; background: none; cursor: pointer; }
      .oqrn-family-list img { display: block; width: 32px; height: 32px; }
      .oqrn-tool-ogp { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 14px; background: #eeece6; }
      .oqrn-tool-copy { margin: -4px 0 0; font-size: 16px; font-weight: 800; line-height: 1.5; }
      .oqrn-tool-lead { margin: -4px 0 0; color: #6b6860; font-size: 14px; line-height: 1.6; }
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
        background: #fff; color: #23211c; font-family: inherit; font-size: 15px; line-height: 1.5; text-align: left; /* 置いた先のページの文字の大きさを受け継がない（ぽもくるは画面基準の大きな字） */
      }
      .oqrn-sheet-title { margin: 0; font-size: 17px; font-weight: 800; }
      .oqrn-sheet-option {
        display: grid; gap: 2px; padding: 12px 14px; border: 1px solid #e3e0d8; border-radius: 14px;
        background: #fff; color: inherit; font: inherit; font-size: 15px; font-weight: 800; text-align: left; cursor: pointer;
        text-decoration: none;
      }
      .oqrn-sheet-option.is-primary { border-color: ${color}; box-shadow: inset 4px 0 0 ${color}; }
      .oqrn-sheet-option small { color: #6b6860; font-size: 13px; font-weight: 500; }
      .oqrn-sheet-status { min-height: 1em; margin: 0; color: #6b6860; font-size: 13px; }
      .oqrn-sheet-close {
        min-height: 44px; border: 0; background: transparent; color: #6b6860; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
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

  // 「コネクト 〜ConneQt〜」（Q のツールをつなぐ仕組みの名前）：おくるん（トップ）と、このツール以外のツールのアイコン。押すとなかまのシートを出す
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

  function familyRow(tool, others, lead) {
    const nav = document.createElement("nav");
    nav.className = "oqrn-family";
    nav.setAttribute("aria-label", "コネクト（ConneQt）");
    const label = document.createElement("p");
    label.className = "oqrn-family-label";
    label.textContent = "コネクト 〜ConneQt〜";
    // 名前だけでは伝わらないので、補足の1行
    const sub = document.createElement("p");
    sub.className = "oqrn-family-sub";
    sub.replaceChildren(...withRuby(lead || "｜Qらし《くらし》を、ひとつなぎ"));
    const list = document.createElement("ul");
    list.className = "oqrn-family-list";
    const oqrn = Object.assign({}, OQRN_ITEM, {
      appIcon: new URL("shared/icon.svg", BASE).href,
      ogp: new URL("shared/ogp.png?v=20261019", BASE).href,
      url: window.OQRN?.top || BASE.href
    });
    const showTool = toolSheet();
    [oqrn, ...others].forEach((item) => {
      if (!item.appIcon || !item.url) return;
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.title = item.en ? `${item.name}（${item.en}）` : item.name;
      button.setAttribute("aria-haspopup", "dialog");
      const img = document.createElement("img");
      img.src = item.appIcon;
      img.alt = button.title;
      img.width = img.height = 32;
      button.appendChild(img);
      button.addEventListener("click", () => showTool(item, button));
      li.appendChild(button);
      list.appendChild(li);
    });
    nav.append(label, sub, list);
    return nav;
  }

  function build(tool, others = [], lead = "") {
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
    host.appendChild(open);
    host.appendChild(familyRow(tool, others, lead));

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
    $(".oqrn-sheet-title").textContent = `${tool.name}をシェア`;
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
        window.prompt("このリンクをコピーしてください", tool.url);
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
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => build(tool, others, data.lead));
      else build(tool, others, data.lead);
    })
    .catch((error) => console.error("紹介の中身を読み込めませんでした", error));
})();
