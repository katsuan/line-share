// お知らせカード：送るカード（Flex Message）の組み立て・返事のリンク・写真の形

// LIFF で送るカードに付けられるボタンは URI アクション（リンク）だけ（LIFF の仕様。sendMessages・shareTargetPicker とも）。
// 投票・完了のボタンは返事のページ（reply/）へのリンクにし、そこで文を確かめて送るかコピーしてもらう。
// 投票は候補をすべて渡し、返事のページで選び直せるようにする（format の {c} が選んだ候補になる）
// ボタンのリンクは 1000 文字まで。収まらないときは候補を外し、それでも長ければ文を縮める
const MAX_URI_LENGTH = 1000;
function replyAction(label, { text, title = "", choices = [], pick = -1, format = "" }) {
  const base = config.liffId ? `https://liff.line.me/${config.liffId}/reply/` : "https://katsuan.github.io/line-share/reply/";
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

function buildFlexMessage() {
  const palette = getPalette();
  const headerContents = [
    { type: "text", text: state.headerTitle, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }
  ];
  if (state.showDate && state.date) {
    headerContents.push({ type: "text", text: state.date, color: "#FFFFFF", size: "xs", margin: "sm", wrap: true });
  }

  const bodyContents = [
    { type: "text", text: state.title, size: "xl", weight: "bold", color: "#111827", wrap: true }
  ];

  if (state.badges.some(Boolean)) {
    bodyContents.push({
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
    });
  }

  if (state.showDetail && state.detail) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      backgroundColor: palette.detailBg,
      cornerRadius: "12px",
      contents: [{ type: "text", text: state.detail, size: "sm", color: palette.detailText, wrap: true }]
    });
  }

  const items = state.items.filter(Boolean);
  if (state.kind === "vote" && items.length) {
    // 押すと返事のページが開き、「○○ に投票します」を送るかコピーしてもらう。ほかの候補にも選び直せる（集計は自動ではしない）
    bodyContents.push({
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
    });
  }
  if (state.kind === "checklist" && items.length) {
    bodyContents.push({
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
    });
  }

  // サッカーの形式：ピッチの図・スコア（card/js/soccer.js）
  if (state.kind === "lineup") bodyContents.push(...lineupFlex(palette));
  if (state.kind === "match") bodyContents.push(...matchFlex(palette));

  const bubble = {
    type: "bubble",
    size: state.bubbleSize,
    header: {
      type: "box",
      layout: "vertical",
      background: { type: "linearGradient", angle: "135deg", startColor: palette.start, endColor: palette.end },
      paddingAll: "16px",
      contents: headerContents
    },
    body: { type: "box", layout: "vertical", spacing: "md", contents: bodyContents }
  };
  if (state.kind === "ticket" || state.kind === "coupon") {
    const parts = state.kind === "ticket" ? ticketFlex(palette) : couponFlex(palette);
    bubble.body = {
      type: "box",
      layout: "vertical",
      paddingAll: "0px",
      contents: [
        { type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingBottom: "12px", contents: [...bodyContents, ...parts.top] },
        perforationFlex(),
        ...(parts.bottom.length
          ? [{ type: "box", layout: "vertical", spacing: "md", paddingAll: "20px", paddingTop: "12px", contents: parts.bottom }]
          : [{ type: "box", layout: "vertical", height: "12px", contents: [] }])
      ]
    };
  }

  if (state.imageUrl) {
    const hero = getHeroSpec(palette);
    bubble.hero = {
      type: "image",
      url: state.imageUrl,
      size: "full",
      aspectRatio: hero.ratio,
      aspectMode: hero.mode,
      ...(hero.mode === "fit" ? { backgroundColor: hero.background } : {})
    };
    const imageAction = getSendableUrl(state.imageActionUrl);
    if (imageAction) {
      bubble.hero.action = { type: "uri", uri: imageAction };
    }
  }

  const buttons = state.buttons
    .map((button) => ({ label: button.label.trim() || "詳しく見る", uri: getSendableUrl(button.url) }))
    .filter((button) => button.uri);
  const footerButtons = buttons.map((button) => ({
    type: "button",
    style: "primary",
    color: palette.start,
    action: { type: "uri", label: button.label.slice(0, 40), uri: button.uri }
  }));
  if (state.kind === "checklist" && items.length) {
    // 押すと返事のページが開き、「『タイトル』準備できた！」を送るかコピーしてもらう
    const doneLabel = state.doneLabel || DEFAULT_DONE_LABEL;
    footerButtons.unshift({
      type: "button",
      style: "primary",
      color: palette.start,
      action: replyAction(doneLabel, { text: `「${state.title}」${doneLabel.replace(/^✅\s*/u, "")}！` })
    });
  }
  if (footerButtons.length > 0) {
    bubble.footer = { type: "box", layout: "vertical", spacing: "sm", contents: footerButtons };
  }

  return {
    type: "flex",
    altText: `${state.headerTitle}: ${state.title}`.slice(0, 400),
    contents: bubble
  };
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
