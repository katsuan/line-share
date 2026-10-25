// おくるんのトップ（HOME）の動き：LIFF の入口の転送・ツールの一覧・最近つかったツール・紹介のシート。index.html が読む（見た目は style.css）。
// https://liff.line.me/<LIFF ID>/plan/ のようなリンクは、まずこのトップに liff.state 付きで届く。
// liff.init() が該当ツールのページへ転送する。
(function () {
  const params = new URLSearchParams(location.search);
  const liffId = window.LINE_SHARE_CONFIG && window.LINE_SHARE_CONFIG.liffId;
  if (!params.has("liff.state") || !liffId || !window.liff) return;

  document.getElementById("hub").innerHTML = '<p class="hub-redirect">開いています…</p>';
  liff.init({ liffId }).catch((error) => {
    console.error(error);
    location.replace(location.pathname);
  });
})();

// 部（group）のツール。also は兼部（キロっく＝たいいく部とけいぞく部）で、兼部の部にも、その部のツールのあとに並べる
function groupMembers(tools, key) {
  return tools
    .filter((tool) => tool.group === key || (Array.isArray(tool.also) && tool.also.includes(key)))
    .sort((a, b) => (a.group !== key) - (b.group !== key));
}

// LINE絵文字・ほかのツールの欄を JSON から作る（1行ずつのリンク）
(function () {
  // LINE STORE の絵文字のページ
  const storeUrl = (id) => `https://line.me/S/emoji/?id=${encodeURIComponent(id)}`;
  // 絵文字の見本の画像
  const imageUrl = (id) => `https://stickershop.line-scdn.net/sticonshop/v1/product/${encodeURIComponent(id)}/iPhone/main.png?v=1`;
  // 絵文字の作者のページ
  const authorUrl = (id) => `https://line.me/S/shop/emoji/author/${encodeURIComponent(id)}`;

  // JSON を読む（読めなければ reject）
  const loadJson = (path) =>
    fetch(path, { cache: "no-cache" }).then((response) => (response.ok ? response.json() : Promise.reject(response.status)));

  // row: { url, icon（絵文字）か appIcon（ツールのアイコン画像。絵文字と同じ大きさ）か image（大きめの画像の URL）, name, en, desc }
  //   en：英字の名前（おくるん＝OQRN のように名前に英字表記があるツール）。名前の右に「〜kiloQ〜」と小さく添える
  // 英字の名前の「Q」だけをツールの色で塗る（kiloQ・Qji・SAQSEN など。Q がブランドのしるし）。
  // ツールの色が濃い灰色などで目立たないときは、hub-links.json の qColor（ぽもくるはアイコンの黄色）
  function withBrandQ(text, color) {
    return String(text)
      .split(/(Q)/)
      .filter(Boolean)
      .map((part) => {
        if (part !== "Q" || !color) return document.createTextNode(part);
        const q = document.createElement("span");
        q.className = "hub-brand-q";
        q.style.color = color;
        q.textContent = "Q";
        return q;
      });
  }

  // 一覧の1行（ツール・絵文字）を作る。ツールは押すと紹介のシートを出す
  function createRow(row) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "hub-link";
    link.href = row.url;
    let mark;
    if (row.image) {
      link.classList.add("has-thumb");
      mark = document.createElement("img");
      mark.className = "hub-link-thumb";
      mark.src = row.image;
      mark.alt = "";
      mark.loading = "lazy";
      // 代表画像は ID が正しい商品にしかないので、取れないとき（ID の間違い・一時的な不調）は代わりのアイコンにする
      mark.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.className = "hub-link-icon";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = row.fallbackIcon || "😀";
        mark.replaceWith(fallback);
      });
    } else if (row.appIcon) {
      mark = document.createElement("img");
      mark.className = "hub-link-app-icon";
      mark.src = row.appIcon;
      mark.alt = "";
      mark.loading = "lazy";
      // 読めないときは絵文字にする
      mark.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.className = "hub-link-icon";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = row.icon || "🔗";
        mark.replaceWith(fallback);
      });
    } else {
      mark = document.createElement("span");
      mark.className = "hub-link-icon";
      mark.textContent = row.icon || "🔗";
    }
    mark.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    const name = document.createElement("span");
    name.className = "hub-link-name";
    name.textContent = row.name || "";
    if (row.en) {
      const en = document.createElement("span");
      en.className = "hub-link-en";
      en.append("〜", ...withBrandQ(row.en, row.qColor || row.color), "〜");
      name.append(" ", en);
    }
    // 兼部のツール（also）は、どの部でも「兼部」の印（くらぶのページと同じ）
    if (Array.isArray(row.also) && row.also.length) {
      name.append(Object.assign(document.createElement("span"), { className: "hub-link-also", textContent: "兼部" }));
    }
    text.append(name);
    if (row.desc) {
      const desc = document.createElement("span");
      desc.className = "hub-link-desc";
      desc.textContent = row.desc;
      text.append(desc);
    }
    const arrow = document.createElement("span");
    arrow.className = "hub-link-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.append(mark, text, arrow);
    // 共有画像（ogp）があるツールは、いきなり開かずに、まず画像と説明のカードを出す（そこから「開く」）
    if (row.ogp) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openToolSheet(row, link);
      });
    }
    li.append(link);
    return li;
  }

  // ほかのツールのカード：共有画像・名前（英字）・説明と「○○を開く」
  const toolSheet = document.getElementById("toolSheet");
  let toolOpener = null;
  // ほかのツールの紹介のシートを出す
  function openToolSheet(row, opener) {
    toolOpener = opener;
    const ogp = document.getElementById("toolOgp");
    ogp.src = row.ogp;
    ogp.alt = `${row.name}の紹介画像`;
    document.getElementById("toolTitle").replaceChildren(...(row.en ? [`${row.name} 〜`, ...withBrandQ(row.en, row.qColor || row.color), "〜"] : [row.name]));
    const copy = document.getElementById("toolCopy");
    copy.textContent = row.copy || "";
    copy.hidden = !row.copy;
    copy.style.color = row.color || "";
    const lead = document.getElementById("toolLead");
    // 見出しの一文（lead）と説明（intro）を「。」でつなぐ
    lead.textContent = [row.lead, row.intro].filter(Boolean).map((text) => text.replace(/[。．]$/, "")).join("。") + (row.lead || row.intro ? "。" : "") || row.desc || "";
    // LINE で開ける版（つづく・しょくじ）：LINE の中ではそちらだけ。外では「📱 LINE 版で開く」と、その良さ
    const inLine = / Line\//.test(navigator.userAgent);
    const line = /^https:\/\/liff\.line\.me\//.test(row.line || "") ? row.line : "";
    const lineLink = document.getElementById("toolLine");
    lineLink.hidden = !line || inLine;
    lineLink.href = line || "#";
    const why = document.getElementById("toolWhy");
    why.hidden = !line || !row.lineWhy;
    why.textContent = row.lineWhy ? `📱 ${row.lineWhy}` : "";
    const open = document.getElementById("toolOpen");
    open.href = inLine && line ? line : row.url;
    open.textContent = `${row.name}を開く ↗`;
    // 「開く」はツールの色（紹介カードと同じ）
    open.style.background = row.color || "";
    open.style.borderColor = row.color || "";
    toolSheet.hidden = false;
    open.focus();
  }
  // 紹介のシートを閉じて、押したところに戻る
  function closeToolSheet() {
    toolSheet.hidden = true;
    toolOpener?.focus();
  }
  document.getElementById("toolClose").addEventListener("click", closeToolSheet);
  toolSheet.addEventListener("click", (event) => {
    if (event.target === toolSheet) closeToolSheet();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !toolSheet.hidden) closeToolSheet();
  });

  // 「｜Qらし《くらし》」の形（青空文庫と同じ書き方）をルビにする。ほかはそのまま文字（HTML は入れない）
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

  // 見出しのロゴ（暗い表示では dark の絵に切りかえる）と、横に小さく読みがな。
  // anim があれば動くロゴ（アイコン → Qlove → Qラブ → Qら部 → くらぶ。tools/qlove_anim.py）。動きを減らす設定の人には止まったロゴ
  // captionNodes を渡すと、読みがなの代わりにそれを横に出す（動くロゴのときは「くらしの部室」をロゴの行に）
  function brandLogo(logo, alt, captionNodes) {
    const pic = document.createElement("picture");
    const source = (srcset, media) => {
      const el = document.createElement("source");
      el.srcset = srcset;
      el.media = media;
      pic.append(el);
    };
    if (logo.anim) {
      if (logo.dark) source(logo.dark, "(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)");
      source(logo.src, "(prefers-reduced-motion: reduce)");
      if (logo.animDark) source(logo.animDark, "(prefers-color-scheme: dark)");
    } else if (logo.dark) {
      source(logo.dark, "(prefers-color-scheme: dark)");
    }
    const img = document.createElement("img");
    img.className = "hub-more-logo";
    img.src = logo.anim || logo.src;
    img.loading = "lazy"; // 一覧はページの下のほう
    img.alt = alt;
    pic.append(img);
    const nodes = [pic];
    if (captionNodes || logo.caption) {
      const cap = document.createElement("span");
      cap.className = "hub-more-caption";
      if (captionNodes) cap.replaceChildren(...captionNodes);
      else cap.textContent = logo.caption;
      nodes.push(cap);
    }
    return nodes;
  }

  // 一覧の欄（見出し・説明・行）を、JSON の中身で埋める
  function fill({ section, title, lead, list }, data, rows) {
    if (!rows.length) return;
    // ロゴがあれば（くらぶ 〜Qlove〜）ロゴの画像＋読みがな。なければ見出しの「Q」をおくるんの紫（data.color）に
    // 動くロゴ（最後に「くらぶ」と出る）のときは、説明（くらしの部室）をロゴと同じ行に置き、下の行は使わない
    const inlineLead = Boolean(data.logo && data.logo.anim && data.lead);
    const logo = data.logo && data.logo.src ? brandLogo(data.logo, data.title || "", inlineLead ? withRuby(data.lead) : null) : null;
    document.getElementById(title).replaceChildren(...(logo || withBrandQ(data.title || "", data.color)));
    if (lead && data.lead && !inlineLead) {
      document.getElementById(lead).replaceChildren(...withRuby(data.lead));
      document.getElementById(lead).hidden = false;
    }
    document.getElementById(list).replaceChildren(...rows.map(createRow));
    document.getElementById(section).hidden = false;
  }

  loadJson("./data/line-emoji.json")
    .then((data) => {
      const rows = (Array.isArray(data.items) ? data.items : [])
        .filter((item) => item && item.id)
        .map((item) => ({ url: item.url || storeUrl(item.id), image: item.image || imageUrl(item.id), name: item.name, desc: item.desc }));
      if (rows.length && data.author && data.author.id) {
        rows.push({
          url: data.author.url || authorUrl(data.author.id),
          icon: "🛍️",
          name: `${data.author.name || "作者"} の絵文字をもっと見る`,
          desc: "LINE STORE の作者ページ"
        });
      }
      fill({ section: "hubEmoji", title: "hubEmojiTitle", lead: "hubEmojiLead", list: "hubEmojiList" }, { title: "LINE絵文字", ...data }, rows);
    })
    .catch((error) => console.error("LINE絵文字を読み込めませんでした", error));

  // 季節の絵文字（shared/season.js）。あいさつの後ろに、ときどき1つだけ
  document.addEventListener("DOMContentLoaded", () => {
    const emoji = window.QSeason?.maybe() || "";
    if (emoji) document.getElementById("hubSeason").textContent = ` ${emoji}`;
  });

  // 最近つかったツール：新しい順に3つまで。押すとすぐそのツールを開く（紹介のカードは出さない）
  function showRecent(rows) {
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem("conneqt:recent") || "[]");
    } catch {
      return;
    }
    if (!Array.isArray(recent)) return; // 壊れていたら出さない
    const items = recent.map((row) => rows.find((item) => item.key === row?.key)).filter(Boolean).slice(0, 3);
    if (!items.length) return;
    document.getElementById("hubRecentList").replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        const a = Object.assign(document.createElement("a"), { href: item.url });
        if (item.appIcon) a.append(Object.assign(document.createElement("img"), { src: item.appIcon, alt: "", width: 24, height: 24 }));
        a.append(item.name);
        li.append(a);
        return li;
      })
    );
    document.getElementById("hubRecent").hidden = false;
  }

  // groups があるときは、分け方ごとに小さな見出しを入れて並べる（見出しのない残りは最後）
  function grouped(data, rows) {
    const groups = Array.isArray(data.groups) ? data.groups : [];
    if (!groups.length) return rows.map(createRow);
    const out = [];
    const used = new Set();
    for (const group of groups) {
      const members = groupMembers(rows, group.key);
      if (!members.length) continue;
      const head = Object.assign(document.createElement("li"), { className: "hub-group-head", textContent: group.label });
      out.push(head, ...members.map(createRow));
      members.forEach((row) => used.add(row));
    }
    out.push(...rows.filter((row) => !used.has(row)).map(createRow));
    return out;
  }

  loadJson("./data/hub-links.json")
    .then((data) => {
      const rows = (Array.isArray(data.items) ? data.items : []).filter((item) => item && item.url && item.name);
      fill({ section: "hubMore", title: "hubMoreTitle", lead: "hubMoreLead", list: "hubMoreList" }, { title: "ほかのツール", ...data }, rows);
      if (rows.length) document.getElementById("hubMoreList").replaceChildren(...grouped(data, rows));
      showRecent(rows);
    })
    .catch((error) => console.error("ほかのツールを読み込めませんでした", error));
})();

// トップのシェア：紹介カードを LINE で送るか、リンクを共有する
(function () {
  const config = window.LINE_SHARE_CONFIG || {};
  const PAGE_URL = "https://katsuan.github.io/line-share/";
  const TOP_URL = config.liffId ? `https://liff.line.me/${config.liffId}` : PAGE_URL;
  const $ = (id) => document.getElementById(id);
  const sheet = $("shareSheet");
  const status = $("shareStatus");
  if (!sheet || !$("shareOpen")) return;

  // 紹介のシートの案内に文を出す
  const setStatus = (text) => (status.textContent = text);
  // 紹介のシートを出す
  const open = () => {
    setStatus("");
    sheet.hidden = false;
    $("shareCard").focus();
    revealOwner();
  };

  // LINE とつないで（ログインはさせない）、作成者なら「全ツールのカードを送る」を出す
  async function revealOwner() {
    if (!$("shareAll").hidden) return;
    const { ready } = await window.LineShareLiff.init({ login: "none" });
    if (ready && (await window.LineShareLiff.isOwner())) $("shareAll").hidden = false;
  }

  // 送れる状態にする。LINE の外でログインしていないときは、ログインしてこのページに戻る（戻ったらもう一度押す）
  async function readyToSend() {
    setStatus(window.LineShareLiff.MESSAGES.connecting);
    const { ready, reason } = await window.LineShareLiff.init({ login: "none" });
    if (!ready) {
      setStatus(window.LineShareLiff.MESSAGES[reason] || window.LineShareLiff.MESSAGES.failed);
      return false;
    }
    if (window.LineShareLiff.canShare()) return true;
    const env = window.LineShareLiff.environment();
    if (!env.inClient && !env.loggedIn && window.LineShareLiff.login()) {
      setStatus("LINE のログインに移ります…");
      return false;
    }
    setStatus(window.LineShareLiff.MESSAGES.notInLine);
    return false;
  }
  // 紹介のシートを閉じる
  const close = () => {
    sheet.hidden = true;
    $("shareOpen").focus();
  };

  // 紹介カード（お知らせカードの「紹介」テンプレートと同じ中身）
  function introCard() {
    const message = {
      type: "flex",
      altText: "おくるん｜つくって、おくるん💬",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          background: { type: "linearGradient", angle: "135deg", startColor: "#6C47FF", endColor: "#A48BFF" },
          paddingAll: "16px",
          contents: [
            { type: "text", text: "おくるん", color: "#FFFFFF", weight: "bold", size: "lg" },
            { type: "text", text: "つくって、おくるん💬", color: "#FFFFFF", size: "xs", margin: "sm" }
          ]
        },
        hero: {
          type: "image",
          url: `${PAGE_URL}shared/ogp.png?v=20261019`,
          size: "full",
          aspectRatio: "40:21",
          aspectMode: "cover",
          action: { type: "uri", uri: TOP_URL }
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: "写真やボタン付きのカードを、LINEで送れます。", weight: "bold", size: "md", wrap: true },
            { type: "text", text: "場所・予定・お知らせ・文字や手書きを、カードや画像にしてトークに送れます。", size: "sm", color: "#6B6860", wrap: true }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "button", style: "primary", color: "#6C47FF", action: { type: "uri", label: "おくるんを開く", uri: TOP_URL } }]
        }
      }
    };
    return window.LineShareCredit?.withCredit(message) ?? message;
  }

  // ---- 全ツールのカード（作成者だけ）。おくるん＋ほかのツール（hub-links.json の紹介の中身があるもの）をカルーセル1通に ----
  const MAX_BUBBLES = 12; // カルーセルに入るカードの数の上限（LINE の決まり）

  // ツールの色を白に寄せた色（見出しのグラデーションの終わり）
  function lighten(hex, amount = 0.38) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    // 1つの色の値を白に近づける
    const mix = (c) => Math.round(c + (255 - c) * amount);
    return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  // お知らせカードの紹介（tool-share.js）と同じ中身を、1枚のバブルに
  function toolBubble(tool) {
    const color = tool.color || "#6C47FF";
    return {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        background: { type: "linearGradient", angle: "135deg", startColor: color, endColor: lighten(color) },
        paddingAll: "16px",
        contents: [
          { type: "text", text: tool.name, color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: tool.en ? `〜${tool.en}〜` : " ", color: "#FFFFFF", size: "xs", margin: "sm" }
        ]
      },
      hero: { type: "image", url: tool.ogp, size: "full", aspectRatio: "40:21", aspectMode: "cover", action: { type: "uri", uri: tool.url } },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: tool.copy || tool.lead || tool.name, weight: "bold", size: "md", wrap: true, color },
          { type: "text", text: [tool.lead, tool.intro].filter(Boolean).join("\n") || tool.desc || " ", size: "sm", color: "#6B6860", wrap: true }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "button", style: "primary", color, action: { type: "uri", label: `${tool.name}を開く`.slice(0, 40), uri: tool.url } }]
      }
    };
  }

  const MAX_MESSAGES = 5; // 1回の共有で送れるメッセージの数の上限（LINE の決まり）

  // グループの説明のカード：グループの名前と、入っているツールの一覧（アイコン・名前・ひとこと）
  function groupBubble(group, tools, data) {
    const color = data.color || "#6C47FF";
    return {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        background: { type: "linearGradient", angle: "135deg", startColor: color, endColor: lighten(color) },
        paddingAll: "16px",
        contents: [
          { type: "text", text: group.label, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
          { type: "text", text: data.title || "くらぶ 〜Qlove〜", color: "#FFFFFF", size: "xs", margin: "sm" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: group.desc || `${tools.length}つのツール`, weight: "bold", size: "md", wrap: true, color },
          ...tools.map((tool) => ({
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: tool.icon || "・", size: "sm", flex: 0 },
              { type: "text", text: tool.name, size: "sm", weight: "bold", flex: 0, color: tool.color || color },
              { type: "text", text: tool.desc || tool.copy || " ", size: "xs", color: "#6B6860", wrap: true }
            ]
          })),
          { type: "text", text: "横にめくると、ひとつずつ紹介しています →", size: "xxs", color: "#A3A29B", wrap: true }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "button", style: "secondary", action: { type: "uri", label: "Qlove の一覧を見る", uri: TOP_URL } }]
      }
    };
  }

  // 全ツールのカード：ツールが12個までは全ツールを横に並べて1通（上を見る）。12個をこえたら、おくるんの紹介（1通目）と、グループ（hub-links.json の groups）ごとに1通（横に並べたカルーセル）。
  // グループのツールが12より少ないうちは、先頭にグループの説明のカードをつける。12以上になったら説明はやめて、12枚ずつに分ける。
  // 1回で送れるのは5通まで。こえるときは、おくるんの紹介をやめてグループを優先する（それでもこえる分は送らない）
  async function allToolsMessages() {
    const response = await fetch("./data/hub-links.json", { cache: "no-cache" });
    const data = response.ok ? await response.json() : {};
    const tools = (Array.isArray(data.items) ? data.items : []).filter((item) => item && item.url && item.name && item.ogp);
    // ツールが12個までは、グループに分けずに全ツールを横に並べて1通に。おくるんの紹介も入るなら先頭に入れる（入らなければ1通目に別で）
    if (tools.length <= MAX_BUBBLES) {
      const all = tools.map(toolBubble);
      // カードを横に並べた1通
      const carousel = (bubbles) => ({ type: "flex", altText: "Qlove｜Q のツールたち", contents: { type: "carousel", contents: bubbles } });
      return all.length < MAX_BUBBLES ? [carousel([introCard().contents, ...all])] : [introCard(), carousel(all)];
    }
    // 12個をこえたら、グループごとに分ける
    const groups = (Array.isArray(data.groups) ? data.groups : []).map((g) => ({ ...g, tools: groupMembers(tools, g.key) }));
    const rest = tools.filter((t) => !groups.some((g) => g.key === t.group)); // グループのないツール
    if (rest.length) groups.push({ key: "other", label: "🧩 そのほか", tools: rest });
    const carousels = [];
    for (const group of groups.filter((g) => g.tools.length)) {
      const bubbles = group.tools.length < MAX_BUBBLES ? [groupBubble(group, group.tools, data), ...group.tools.map(toolBubble)] : group.tools.map(toolBubble);
      for (let i = 0; i < bubbles.length; i += MAX_BUBBLES) {
        carousels.push({ type: "flex", altText: `Qlove｜${group.label.replace(/^\S+\s/, "")}のツール`, contents: { type: "carousel", contents: bubbles.slice(i, i + MAX_BUBBLES) } });
      }
    }
    const messages = carousels.length < MAX_MESSAGES ? [introCard(), ...carousels] : carousels;
    return messages.slice(0, MAX_MESSAGES);
  }
  // メッセージの中のカードの数
  const bubbleCount = (messages) => messages.reduce((n, m) => n + (m.contents.type === "carousel" ? m.contents.contents.length : 1), 0);

  // 全ツールの紹介カードを送る（作成者だけ）
  async function shareAll() {
    if (!(await window.LineShareLiff.isOwner())) return;
    if (!(await readyToSend())) return;
    try {
      const messages = await allToolsMessages();
      const result = await liff.shareTargetPicker(messages, { isMultiple: true });
      setStatus(result ? `${messages.length}通（${bubbleCount(messages)}枚）のカードを送りました。` : "送るのをやめました。");
      if (result) window.LineShareLog?.track("send", { kind: "intro-all", count: bubbleCount(messages) });
    } catch (error) {
      console.error(error);
      setStatus("送れませんでした。時間をおいてもう一度お試しください。");
    }
  }

  // おくるんの紹介カードを、送り先を選んで送る
  async function shareCard() {
    if (!(await readyToSend())) return;
    try {
      const result = await liff.shareTargetPicker([introCard()], { isMultiple: true });
      setStatus(result ? "送りました。" : "送るのをやめました。");
      if (result) window.LineShareLog?.track("send", { kind: "intro" });
    } catch (error) {
      console.error(error);
      setStatus("送れませんでした。時間をおいてもう一度お試しください。");
    }
  }

  // おくるんのリンクを共有する（共有できないときはコピー）
  async function shareLink() {
    const data = { title: "おくるん", text: "つくって、おくるん💬 写真やボタン付きのカードを、LINEで送れます。", url: PAGE_URL };
    if (navigator.share) {
      try {
        await navigator.share(data);
        close();
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(PAGE_URL);
      setStatus("リンクをコピーしました。");
    } catch {
      // コピーできないときは、長押しで選べる文字で出す
      if (window.LineShareUI?.ask) window.LineShareUI.ask({ title: "長押ししてコピーしてください", input: PAGE_URL, readonly: true, ok: "閉じる", cancel: null });
      else setStatus(`リンク：${PAGE_URL}`);
    }
  }

  $("shareOpen").addEventListener("click", open);
  $("shareClose").addEventListener("click", close);
  $("shareCard").addEventListener("click", shareCard);
  $("shareLink").addEventListener("click", shareLink);
  $("shareAll").addEventListener("click", shareAll);
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sheet.hidden) close();
  });
})();
