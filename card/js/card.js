// お知らせカード：送るカード（Flex Message）の組み立て・返事のリンク・写真の形。card/index.html が順に読む（同じ範囲の変数を使う）。

// LIFF で送るカードに付けられるボタンは URI アクション（リンク）だけ（LIFF の仕様。sendMessages・shareTargetPicker とも）。
// 投票・完了のボタンは返事のページ（reply/）へのリンクにし、そこで文を確かめて送るかコピーしてもらう。
// 投票は候補をすべて渡し、返事のページで選び直せるようにする（format の {c} が選んだ候補になる）
// ボタンのリンクは 1000 文字まで。収まらないときは候補を外し、それでも長ければ文を縮める
const MAX_URI_LENGTH = 1000;
// 押すと返事のページ（/reply/）を開くボタンを作る。投票は候補も渡して、そこで選びなおせるようにする
function replyAction(label, { text, title = "", choices = [], pick = -1, format = "" }) {
  const base = config.liffId ? `https://liff.line.me/${config.liffId}/reply/` : "https://katsuan.github.io/line-share/reply/";
  // 返事のページの URL を作る（候補を付けると長すぎるときは付けない）
  const build = (body, withChoices) => {
    const params = new URLSearchParams({ text: body });
    if (withChoices && choices.length) {
      if (title) params.set("title", title);
      params.set("format", format);
      params.set("pick", String(pick));
      for (const choice of choices) params.append("c", choice);
    }
    return `${base}?${params}`;
  };
  let uri = build(text, true);
  if (uri.length > MAX_URI_LENGTH) {
    let body = text;
    while (body && build(body, false).length > MAX_URI_LENGTH) body = body.slice(0, -1);
    uri = build(body, false);
  }
  return { type: "uri", label: label.slice(0, 40), uri };
}

// 今のカード1枚分の Flex Message を作る
function buildFlexMessage() {
  const palette = getPalette();
  const items = state.items.filter(Boolean);
  const bubble = {
    type: "bubble",
    size: state.bubbleSize,
    header: headerFlex(palette),
    body: cardBodyFlex(palette, items)
  };
  if (state.imageUrl) bubble.hero = heroFlex(palette);
  const footer = footerFlex(palette, items);
  if (footer) bubble.footer = footer;
  return {
    type: "flex",
    altText: `${state.headerTitle}: ${state.title}`.slice(0, 400),
    contents: bubble
  };
}

// 見出し（タイトルと、出すときはサブタイトル）。色はグラデーション
function headerFlex(palette) {
  const contents = [
    { type: "text", text: state.headerTitle, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }
  ];
  if (state.showDate && state.date) {
    contents.push({ type: "text", text: state.date, color: "#FFFFFF", size: "xs", margin: "sm", wrap: true });
  }
  return {
    type: "box",
    layout: "vertical",
    background: { type: "linearGradient", angle: "135deg", startColor: palette.start, endColor: palette.end },
    paddingAll: "16px",
    contents
  };
}

// 本文：題・バッジ・詳細と、種類ごとの中身。チケット・クーポンは切り取り線で上下に分ける
function cardBodyFlex(palette, items) {
  const contents = [
    { type: "text", text: state.title, size: "xl", weight: "bold", color: "#111827", wrap: true }
  ];
  if (state.badges.some(Boolean)) contents.push(badgesFlex(palette));
  if (state.showDetail && state.detail) contents.push(detailFlex(palette));
  if (state.kind === "vote" && items.length) contents.push(voteFlex(items));
  if (state.kind === "checklist" && items.length) contents.push(checklistFlex(palette, items));
  // サッカーの形式：ピッチの図・スコア（card/js/soccer.js）
  if (state.kind === "lineup") contents.push(...lineupFlex(palette));
  if (state.kind === "match") contents.push(...matchFlex(palette));
  if (state.kind === "ticket" || state.kind === "coupon") return ticketBodyFlex(palette, contents);
  return { type: "box", layout: "vertical", spacing: "md", contents };
}

// バッジ（丸い札）を横に並べる
function badgesFlex(palette) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: state.badges.filter(Boolean).map((text) => ({
      type: "box",
      layout: "vertical",
      backgroundColor: palette.start,
      cornerRadius: "999px",
      paddingAll: "xs",
      paddingStart: "md",
      paddingEnd: "md",
      flex: 0,
      contents: [{ type: "text", text, size: "xs", color: "#FFFFFF", weight: "bold", flex: 0 }]
    }))
  };
}

// 詳細（色の付いた角丸の枠）
function detailFlex(palette) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    backgroundColor: palette.detailBg,
    cornerRadius: "12px",
    contents: [{ type: "text", text: state.detail, size: "sm", color: palette.detailText, wrap: true }]
  };
}

// 投票の候補のボタン。押すと返事のページが開き、「○○ に投票します」を送るかコピーしてもらう。ほかの候補にも選び直せる（集計は自動ではしない）
function voteFlex(items) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "md",
    contents: items.map((item, index) => ({
      type: "button",
      style: "secondary",
      height: "sm",
      action: replyAction(item, {
        text: `${item} に投票します`,
        title: state.title,
        choices: items,
        pick: index,
        format: "{c} に投票します"
      })
    }))
  };
}

// チェックリストの項目（□ と文）
function checklistFlex(palette, items) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "md",
    contents: items.map((item) => ({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "text", text: "□", size: "sm", color: palette.start, flex: 0 },
        { type: "text", text: item, size: "sm", color: "#111827", wrap: true }
      ]
    }))
  };
}

// チケット・クーポンの本文：上（題など）・切り取り線・下（ないときは余白だけ）
function ticketBodyFlex(palette, contents) {
  const parts = state.kind === "ticket" ? ticketFlex(palette) : couponFlex(palette);
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "0px",
    contents: [
      { type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingBottom: "12px", contents: [...contents, ...parts.top] },
      perforationFlex(),
      ...(parts.bottom.length
        ? [{ type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingTop: "12px", contents: parts.bottom }]
        : [{ type: "box", layout: "vertical", height: "12px", contents: [] }])
    ]
  };
}

// 写真（形と収め方。押したときのリンクは送ってよい行き先だけ）
function heroFlex(palette) {
  const spec = getHeroSpec(palette);
  const hero = {
    type: "image",
    url: state.imageUrl,
    size: "full",
    aspectRatio: spec.ratio,
    aspectMode: spec.mode,
    ...(spec.mode === "fit" ? { backgroundColor: spec.background } : {})
  };
  const imageAction = getSendableUrl(state.imageActionUrl);
  if (imageAction) hero.action = { type: "uri", uri: imageAction };
  return hero;
}

// 下のボタン（リンク）。チェックリストは先頭に完了のボタン。ボタンがなければ null
function footerFlex(palette, items) {
  const buttons = state.buttons
    .map((button) => ({ label: button.label.trim() || "詳しく見る", uri: getSendableUrl(button.url) }))
    .filter((button) => button.uri)
    .map((button) => ({
      type: "button",
      style: "primary",
      color: palette.start,
      action: { type: "uri", label: button.label.slice(0, 40), uri: button.uri }
    }));
  if (state.kind === "checklist" && items.length) {
    // 押すと返事のページが開き、「『タイトル』準備できた！」を送るかコピーしてもらう
    const doneLabel = state.doneLabel || DEFAULT_DONE_LABEL;
    buttons.unshift({
      type: "button",
      style: "primary",
      color: palette.start,
      action: replyAction(doneLabel, { text: `「${state.title}」${doneLabel.replace(/^✅\s*/u, "")}！` })
    });
  }
  return buttons.length ? { type: "box", layout: "vertical", spacing: "sm", contents: buttons } : null;
}

// 送るメッセージ。1枚ならそのカード、2枚以上なら横スクロール（カルーセル）。Created by は各カードに付ける
function buildDeckMessage({ credit = true } = {}) {
  storeCurrent();
  const messages = cards.map((card) =>
    withCard(card, () => (credit ? window.LineShareCredit.withCredit(buildFlexMessage()) : buildFlexMessage()))
  );
  if (messages.length === 1) return messages[0];
  return {
    type: "flex",
    altText: `${messages[0].altText} ほか${messages.length - 1}枚`.slice(0, 400),
    contents: { type: "carousel", contents: messages.map((message) => message.contents) }
  };
}

// ---- 写真の形 ----

/**
 * カードの写真の縦横比と収め方を決める。
 * 「元のまま」は写真の比率をそのまま使うので切れない（縦が横の3倍を超える分だけ上下を切る）。
 */
function getHeroSpec(palette) {
  const background = palette.detailBg;
  if (state.imageShape !== "auto") {
    const mode = state.imageFit === "fit" ? "fit" : "cover";
    const note =
      mode === "cover"
        ? "はみ出した部分は切り取られます（中央が残ります）。"
        : "写真全体が入り、余白はカードの色で埋まります。";
    return { ratio: IMAGE_SHAPES[state.imageShape], mode, background, note };
  }

  const [width, height] = (state.imageRatio || "20:13").split(":").map(Number);
  if (height > width * MAX_TALL_RATIO) {
    return {
      ratio: `${width}:${width * MAX_TALL_RATIO}`,
      mode: "cover",
      background,
      note: "縦にとても長い写真のため、LINEの上限に合わせて上下を少し切り取ります。"
    };
  }
  return { ratio: `${width}:${height}`, mode: "cover", background, note: "" };
}

// 写真を読み込んだら縦横比を覚えておく（URL の写真でも使える）
function rememberImageRatio() {
  const { naturalWidth: width, naturalHeight: height } = els.heroImage;
  if (!width || !height) return;
  const ratio = `${width}:${height}`;
  if (state.imageRatio !== ratio) {
    state.imageRatio = ratio;
    render();
  }
}
