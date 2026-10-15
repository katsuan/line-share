// お知らせカード：カードの中身（state）の形をそろえる・リンクのパラメータから作る

// ---- 状態 ----

function hydrate(source = {}) {
  const legacyButton = source.showAction && (source.actionUrl || source.actionLabel)
    ? [{ label: source.actionLabel || "", url: source.actionUrl || "" }]
    : [];

  return {
    ...structuredClone(BLANK_STATE),
    ...pick(source, ["headerTitle", "date", "title", "detail", "imageUrl", "imageActionUrl"], String),
    theme: Object.hasOwn(THEMES, source.theme) ? source.theme : "purple",
    customColor: normalizeHexColor(source.customColor),
    bubbleSize: BUBBLE_SIZES.includes(source.bubbleSize) ? source.bubbleSize : "mega",
    imageShape: Object.hasOwn(IMAGE_SHAPES, source.imageShape) ? source.imageShape : "auto",
    imageFit: source.imageFit === "fit" ? "fit" : "cover",
    imageRatio: /^\d+:\d+$/.test(source.imageRatio || "") ? source.imageRatio : "",
    showDate: source.showDate !== false,
    showDetail: source.showDetail !== false,
    badges: (Array.isArray(source.badges) ? source.badges : [])
      .map((badge) => String(badge?.text ?? badge ?? "").trim())
      .filter(Boolean)
      .slice(0, MAX_BADGES),
    buttons: (Array.isArray(source.buttons) ? source.buttons : legacyButton)
      .map((button) => ({ label: String(button?.label ?? ""), url: String(button?.url ?? button?.uri ?? "") }))
      .slice(0, MAX_BUTTONS),
    kind: Object.hasOwn(KINDS, source.kind) ? source.kind : "notice",
    items: (Array.isArray(source.items) ? source.items : []).map((item) => String(item ?? "").trim()).slice(0, 20),
    doneLabel: String(source.doneLabel ?? "").trim() || DEFAULT_DONE_LABEL,
    route: Object.fromEntries(["from", "fromSub", "to", "toSub"].map((key) => [key, String(source.route?.[key] ?? "").trim()])),
    pairs: (Array.isArray(source.pairs) ? source.pairs : [])
      .map((pair) => ({ label: String(pair?.label ?? "").trim(), value: String(pair?.value ?? "").trim() }))
      .slice(0, MAX_PAIRS),
    coupon: Object.fromEntries(["offer", "code", "expiry"].map((key) => [key, String(source.coupon?.[key] ?? "").trim()])),
    // サッカーの形式の中身（card/js/soccer.js が確かめる）。保存した形（data の形）でも、整えた形でも受け取る
    lineup: source.lineup ? sanitizeLineup(source.lineup.pl?.[0]?.number !== undefined ? lineupToData(source.lineup) : source.lineup) : null,
    match: source.match ? sanitizeMatch(source.match.g?.[0]?.side !== undefined ? matchToData(source.match) : source.match) : null
  };
}

function pick(source, keys, cast) {
  const result = {};
  for (const key of keys) {
    if (source[key] != null) result[key] = cast(source[key]).trim();
  }
  return result;
}

function getQueryState() {
  const params = new URLSearchParams(location.search);
  const get = (...keys) => keys.map((key) => params.get(key)).find((value) => value != null) ?? "";
  const isOff = (key, fallback) => ["0", "false", "off"].includes(String(params.get(key) ?? fallback).toLowerCase());

  const source = {
    theme: get("theme"),
    customColor: get("customColor", "color"),
    bubbleSize: get("bubbleSize", "size"),
    headerTitle: get("headerTitle"),
    date: get("date"),
    title: get("title"),
    detail: get("detail", "content"),
    showDate: !isOff("showDate", "true"),
    showDetail: !isOff("showDetail", "true"),
    imageUrl: get("imageUrl", "image"),
    imageActionUrl: get("imageActionUrl"),
    badges: params.getAll("badge"),
    buttons: [],
    kind: get("kind"),
    // さくせん盤（サッカーのツール）から渡される中身（?kind=lineup|match&data=…）
    lineup: get("kind") === "lineup" ? decodeSoccerData(get("data")) : null,
    match: get("kind") === "match" ? decodeSoccerData(get("data")) : null,
    items: params.getAll("item")
  };

  const actionUrl = get("actionUrl", "url");
  const actionLabel = get("actionLabel", "buttonLabel");
  if (!isOff("showAction", "false") || actionUrl) {
    source.buttons.push({ label: actionLabel, url: actionUrl });
  }

  // template は形式の選択だけなので、カードの中身のパラメータには数えない
  // template（形式の選択）・from（流入口の目印）・credit（Created by の切り替え）はカードの中身ではないので数えない
  const hasAny = [...params.keys()].some((key) => !key.startsWith("liff.") && !["template", "from", "credit"].includes(key));
  if (!hasAny) return null;

  [actionUrl, source.imageActionUrl].filter(Boolean).forEach((url) => queryUrls.add(url.trim()));
  return source;
}

function getEditorState() {
  return structuredClone(state);
}
