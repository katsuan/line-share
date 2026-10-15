// ほかのツール（さくせん盤・キロっく・ぽもくる・くろのす・ジェンダーリビール）に置く「📤 ○○を紹介する」の窓口。
// 押すとシートを出し、「LINE にカードで送る（おくるん）」か「リンクでシェア」を選べる。
// カードはおくるんのお知らせカード（/card/）に中身を渡して作る。色はツールの色。
//
// 使い方（各ツールの HTML）
//   <div data-tool-share></div>   … ボタンを置く場所（なければページの最後に置く）
//   <script src="https://katsuan.github.io/line-share/shared/tool-share.js" data-tool="kiloq" defer></script>
//
// 紹介の中身（名前・英字・色・画像・説明・URL）は data/hub-links.json の items（key が data-tool と同じもの）から読む。
// HOME の「ほかのツール」と同じ1か所で直せる。どのツールも katsuan.github.io の下にあるので、そのまま読める。
(function () {
  "use strict";

  const script = document.currentScript;
  const toolKey = script && script.dataset.tool;
  if (!toolKey) return;

  const BASE = new URL("..", script.src); // https://katsuan.github.io/line-share/
  const LIFF_ID = "2009927876-DioOJd0z"; // おくるんの LIFF（config.js の liffId と同じ）
  const CARD_URL = `https://liff.line.me/${LIFF_ID}/card/`;

  // おくるんのお知らせカードを、ツールの紹介の中身を入れた状態で開く URL
  function cardUrl(tool) {
    // ヘッダーは名前、サブタイトル（お知らせカードの date 欄）に英字の名前
    const params = new URLSearchParams({
      headerTitle: tool.name,
      date: tool.en ? `〜${tool.en}〜` : "",
      showDate: tool.en ? "true" : "false",
      title: tool.lead || tool.desc || "",
      detail: tool.intro || "",
      theme: "custom",
      customColor: tool.color || "#6C47FF",
      showAction: "true",
      actionLabel: `${tool.name}を開く`,
      actionUrl: tool.url,
      from: `${toolKey}-intro` // おくるん側で、どのツールの紹介から来たかを数える（流入口）
    });
    if (tool.image) params.set("imageUrl", tool.image);
    return `${CARD_URL}?${params}`;
  }

  function injectStyle(color) {
    const style = document.createElement("style");
    style.textContent = `
      .oqrn-share { display: flex; justify-content: center; margin: 20px 0 8px; }
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
        background: #fff; color: #23211c; font-family: inherit; text-align: left;
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
        min-height: 44px; border: 0; background: transparent; color: #6b6860; font: inherit; font-weight: 700; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function build(tool) {
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

  fetch(new URL("data/hub-links.json", BASE), { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((data) => {
      const tool = (data.items || []).find((item) => item && item.key === toolKey);
      if (!tool || !tool.url) return;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => build(tool));
      else build(tool);
    })
    .catch((error) => console.error("紹介の中身を読み込めませんでした", error));
})();
