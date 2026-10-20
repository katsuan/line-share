// お知らせカード：サッカー・フットサルの形式（スタメン・試合結果）。
// 作るのは別のツール（さくせん盤。SOCCER_EDITOR_URL）で、ここへは ?kind=lineup|match&data=<JSON を base64url> で渡される。
// ここでは中身を確かめて（数・長さ・位置の範囲）、ピッチの図・スコアをプレビューと送るカード（Flex）にする。
// 選手の配置などを直すときは「さくせん盤で直す」で同じ中身のままさくせん盤に戻る。
//
// data の形（キーは短くしてリンクを短くする）
//   lineup: { m: "futsal"|"soccer", f: "1-2-1", t: チーム, o: 相手, s: 控え, c: チームの色（#rrggbb。なければカードの色）, pl: [[背番号, 名前, x, y], ...] }   x・y は 0〜100（ピッチの左上から。上が攻める向き）
//   match:  { t: チーム, o: 相手, us, th（最終スコア。延長を含む）, hu・ht（前半）, su・st（後半）, eu・et（延長）, pu・pt（PK）, g: [[ "u"|"t", 分, 名前 ], ...], mvp,
//             as: [[名前, 数], ...]（アシスト）, cd: [[ "y"|"r", 名前, 数 ], ...]（カード）, sb: [[分, 出た選手, 入った選手], ...]（交代） }
//           as・cd・sb はさくせん盤の選手の印・交代から（なければ省く）
//           内訳と PK は、入っているものだけ出す（なければ空）。同点で PK があれば PK で勝ち負けを決める

const SOCCER_EDITOR_URL = "https://katsuan.github.io/soccer/";
const PITCH_COLOR = "#2E8B4A";
const LINE_COLOR = "#FFFFFFAA";

function decodeSoccerData(text) {
  try {
    const binary = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

function encodeSoccerData(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const cutText = (value, max) => String(value ?? "").trim().slice(0, max);
const clampNum = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

/** スタメンの中身を確かめる。おかしなものは null */
function sanitizeLineup(source) {
  if (!source || typeof source !== "object" || !Array.isArray(source.pl)) return null;
  const mode = source.m === "futsal" ? "futsal" : "soccer";
  // 人数は変則（8人制・退場で10人・練習試合で12人以上など）もあるので、どちらのピッチも 16 人まで（さくせん盤と同じ）
  const players = source.pl.slice(0, 16).map((p) => ({
    number: cutText(Array.isArray(p) ? p[0] : "", 3),
    name: cutText(Array.isArray(p) ? p[1] : "", 8),
    x: clampNum(Array.isArray(p) ? p[2] : 50, 0, 100),
    y: clampNum(Array.isArray(p) ? p[3] : 50, 0, 100)
  }));
  if (!players.length) return null;
  const color = /^#[0-9a-f]{6}$/i.test(source.c || "") ? source.c.toLowerCase() : "";
  return { m: mode, f: cutText(source.f, 10), t: cutText(source.t, 20), o: cutText(source.o, 20), s: cutText(source.s, 80), c: color, pl: players };
}

/** 試合結果の中身を確かめる。おかしなものは null */
function sanitizeMatch(source) {
  if (!source || typeof source !== "object") return null;
  const score = (value) => (value === "" || value === null || value === undefined ? "" : clampNum(value, 0, 99));
  return {
    t: cutText(source.t, 20),
    o: cutText(source.o, 20),
    us: clampNum(source.us, 0, 99),
    th: clampNum(source.th, 0, 99),
    hu: score(source.hu),
    ht: score(source.ht),
    su: score(source.su),
    st: score(source.st),
    eu: score(source.eu),
    et: score(source.et),
    pu: score(source.pu),
    pt: score(source.pt),
    g: (Array.isArray(source.g) ? source.g : []).slice(0, 20).map((g) => ({
      side: g?.[0] === "t" ? "t" : "u",
      min: cutText(g?.[1], 4),
      name: cutText(g?.[2], 12)
    })),
    mvp: cutText(source.mvp, 12),
    as: (Array.isArray(source.as) ? source.as : []).slice(0, 16).map((a) => [cutText(a?.[0], 12), clampNum(a?.[1], 1, 9)]).filter(([name]) => name),
    cd: (Array.isArray(source.cd) ? source.cd : []).slice(0, 16)
      .map((c) => [c?.[0] === "r" ? "r" : "y", cutText(c?.[1], 12), c?.[0] === "r" ? 1 : clampNum(c?.[2], 1, 2)])
      .filter(([, name]) => name),
    sb: (Array.isArray(source.sb) ? source.sb : []).slice(0, 30).map((s) => [cutText(s?.[0], 4), cutText(s?.[1], 12), cutText(s?.[2], 12)]).filter(([, o, i]) => o || i)
  };
}

// アシスト・カードの行（文字）。なければ空
const assistText = (match) => (match.as?.length ? `👟 アシスト ${match.as.map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join("・")}` : "");
// 交代の行（「🔄 60' たなか → すずき」を改行でつなぐ）。なければ空
const subsText = (match) => (match.sb?.length ? match.sb.map(([min, out, inn]) => `🔄 ${min ? `${min}' ` : ""}${out || "?"} → ${inn || "?"}`).join("\n") : "");
const cardsText = (match) => (match.cd?.length ? match.cd.map(([kind, name, n]) => `${(kind === "r" ? "🟥" : "🟨").repeat(n)} ${name}`).join("　") : "");

// 保存・送り直しのときは、プレビュー用に整えた形から data の形に戻す
function lineupToData(lineup) {
  return { ...lineup, pl: lineup.pl.map((p) => [p.number, p.name, p.x, p.y]) };
}

function matchToData(match) {
  return { ...match, g: match.g.map((g) => [g.side, g.min, g.name]) };
}

/** さくせん盤に、今の中身のまま戻るリンク */
function soccerEditorUrl() {
  if (state.kind === "lineup" && state.lineup) return `${SOCCER_EDITOR_URL}?tab=lineup&data=${encodeSoccerData(lineupToData(state.lineup))}`;
  if (state.kind === "match" && state.match) return `${SOCCER_EDITOR_URL}?tab=result&data=${encodeSoccerData(matchToData(state.match))}`;
  return SOCCER_EDITOR_URL;
}

// ---- さくせん盤へのリンク（スタメンのピッチ・試合結果をタップしたとき） ----
// リンクを付けるかどうかはここだけで決める。あとで有償プランの「ツールへのリンクを外す」を足すときは、
// shared/plan.js と gas/Code.js の PLANS に hideToolLink を足し、カードの設定（state.hideToolLink）を作れば、
// ここが空を返してリンクと「タップすると…」の案内が消える
const TOOL_LINK_FEATURE = "hideToolLink";
const TOOL_NAME = "さくせん盤"; // SAQSEN
const TOOL_TAP_HINT = { lineup: `ピッチをタップすると ${TOOL_NAME} が開きます`, match: `タップすると ${TOOL_NAME} が開きます` };

function soccerToolLinkShown() {
  return !(state.hideToolLink && window.LineSharePlan?.has?.(TOOL_LINK_FEATURE));
}

// 部品に付けるリンク（付けないときは null）
function soccerToolAction(uri) {
  return soccerToolLinkShown() ? { type: "uri", label: `${TOOL_NAME}を開く`, uri } : null;
}

const toolTapHintEl = (kind) => (soccerToolLinkShown() ? [Object.assign(document.createElement("p"), { className: "sc-tap", textContent: TOOL_TAP_HINT[kind] })] : []);
const toolTapHintFlex = (kind) => (soccerToolLinkShown() ? [{ type: "text", text: TOOL_TAP_HINT[kind], size: "xxs", color: "#9CA3AF", align: "center" }] : []);

const pitchHeight = (lineup) => (lineup.m === "futsal" ? 300 : 360);
const tokenWidth = (lineup) => (lineup.m === "futsal" ? 26 : 19); // %
const isKeeper = (lineup, index) => index === 0; // 先頭は GK

// 選手の丸の色（チームの色。GK も同じ色で、丸の左下に 🧤 を付けて見分ける）と、その上の背番号の色
const isLightColor = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};
function tokenColors(lineup, index, palette) {
  const team = lineup.c || palette.start;
  const fill = team;
  const light = isLightColor(fill);
  return { fill, text: light ? "#23302A" : "#FFFFFF", border: light ? "#23302A" : "#FFFFFF" };
}

// ---- プレビュー ----

function renderSoccerPreview(palette) {
  els.lineupArea.hidden = state.kind !== "lineup";
  els.matchArea.hidden = state.kind !== "match";
  els.soccerEditLink.hidden = state.kind !== "lineup" && state.kind !== "match";
  els.soccerEditLink.href = soccerEditorUrl();
  if (state.kind === "lineup") renderPitchPreview(palette);
  if (state.kind === "match") renderMatchPreview(palette);
}

function renderPitchPreview(palette) {
  const lineup = state.lineup;
  if (!lineup) {
    els.lineupArea.replaceChildren(Object.assign(document.createElement("p"), { className: "sc-empty", textContent: `${TOOL_NAME}で選手を並べてから開いてください。` }));
    return;
  }
  const pitch = document.createElement("div");
  pitch.className = "sc-pitch";
  pitch.style.height = `${pitchHeight(lineup)}px`;
  // サッカーは四角いペナルティエリア、フットサルはゴール前の半円（D形）と小さめのセンターサークル
  pitch.classList.toggle("is-futsal", lineup.m === "futsal");
  pitch.innerHTML = lineup.m === "futsal"
    ? '<i class="sc-line is-border"></i><i class="sc-line is-half"></i><i class="sc-line is-circle"></i><i class="sc-d is-top"><span></span></i><i class="sc-d is-bottom"><span></span></i>'
    : '<i class="sc-line is-border"></i><i class="sc-line is-half"></i><i class="sc-line is-circle"></i><i class="sc-line is-box-top"></i><i class="sc-line is-box-bottom"></i>';
  const width = tokenWidth(lineup);
  lineup.pl.forEach((p, index) => {
    const token = document.createElement("span");
    token.className = "sc-token";
    token.style.width = `${width}%`;
    token.style.left = `${Math.min(100 - width, Math.max(0, p.x - width / 2))}%`;
    token.style.top = `${Math.min(pitchHeight(lineup) - 40, Math.max(0, (p.y / 100) * pitchHeight(lineup) - 18))}px`;
    const number = document.createElement("b");
    number.textContent = p.number || "";
    const colors = tokenColors(lineup, index, palette);
    number.style.background = colors.fill;
    number.style.color = colors.text;
    number.style.borderColor = colors.border;
    const name = document.createElement("small");
    name.textContent = p.name || "";
    token.append(number, name);
    if (isKeeper(lineup, index)) token.append(Object.assign(document.createElement("i"), { className: "sc-gk", textContent: "🧤" }));
    pitch.append(token);
  });
  const parts = [pitch, ...toolTapHintEl("lineup")];
  if (lineup.s) parts.push(Object.assign(document.createElement("p"), { className: "sc-subs", textContent: `控え：${lineup.s}` }));
  els.lineupArea.replaceChildren(...parts);
}

function renderMatchPreview(palette) {
  const match = state.match;
  if (!match) {
    els.matchArea.replaceChildren(Object.assign(document.createElement("p"), { className: "sc-empty", textContent: `${TOOL_NAME}で結果を入れてから開いてください。` }));
    return;
  }
  const sides = matchSides(match, palette);
  const box = document.createElement("div");
  box.className = "sc-match";
  box.innerHTML = `
    <div class="sc-teams"><div><b></b></div><span>vs</span><div><b></b></div></div>
    <b class="sc-score"></b>
    <span class="sc-result is-draw"></span>
    <small class="sc-half"></small>
    <ul class="sc-goal-list"></ul>
    <p class="sc-mvp"></p>`;
  // チーム名の行（勝ち・負けはそれぞれの下）とスコアの行。引き分けはスコアの下の中央
  const [usBox, , themBox] = box.querySelector(".sc-teams").children;
  [[usBox, match.t || "自チーム", sides.us], [themBox, match.o || "相手", sides.them]].forEach(([el, name, result]) => {
    el.querySelector("b").textContent = name;
    if (result) el.append(badgeEl(result));
  });
  const scoreEl = box.querySelector(".sc-score");
  scoreEl.textContent = `${match.us} - ${match.th}`;
  scoreEl.style.color = palette.start;
  const draw = box.querySelector(".sc-result.is-draw");
  if (sides.draw) {
    draw.textContent = sides.draw.label;
    draw.style.background = sides.draw.color;
  } else {
    draw.remove();
  }
  box.querySelector(".sc-half").textContent = periodsText(match);
  if (pkText(match)) box.querySelector(".sc-score").insertAdjacentElement("afterend", Object.assign(document.createElement("b"), { className: "sc-pk", textContent: pkText(match), style: `color: ${palette.start}` }));
  box.querySelector(".sc-goal-list").replaceChildren(
    ...goalLines(match).map((g) => Object.assign(document.createElement("li"), { className: g.side === "t" ? "is-them" : "", textContent: g.text }))
  );
  // 得点の下に アシスト → カード の順（afterend で足すので逆から）
  [subsText(match), cardsText(match), assistText(match)].filter(Boolean).forEach((text) =>
    box.querySelector(".sc-goal-list").insertAdjacentElement("afterend", Object.assign(document.createElement("p"), { className: "sc-extra", textContent: text }))
  );
  box.querySelector(".sc-mvp").textContent = match.mvp ? `🏅 MVP ${match.mvp}` : "";
  els.matchArea.replaceChildren(box, ...toolTapHintEl("match"));
}

const hasPair = (a, b) => a !== "" && b !== "";

// 前半・後半・延長の内訳（入っているものだけ）
function periodsText(match) {
  return [["前半", match.hu, match.ht], ["後半", match.su, match.st], ["延長", match.eu, match.et]]
    .filter(([, a, b]) => hasPair(a, b))
    .map(([label, a, b]) => `${label} ${a} - ${b}`)
    .join("・");
}

const pkText = (match) => (hasPair(match.pu, match.pt) ? `PK ${match.pu} - ${match.pt}` : "");

// 勝ち・負けはチームごと（us・them）、引き分けは1つ（draw）。同点で PK があれば PK で決める
function matchSides(match, palette) {
  const win = (pk) => ({ label: pk ? "勝ち（PK）" : "勝ち", color: palette.start });
  const lose = (pk) => ({ label: pk ? "負け（PK）" : "負け", color: "#6B7280" });
  if (match.us > match.th) return { us: win(), them: lose() };
  if (match.us < match.th) return { us: lose(), them: win() };
  if (hasPair(match.pu, match.pt) && match.pu !== match.pt) {
    return match.pu > match.pt ? { us: win(true), them: lose(true) } : { us: lose(true), them: win(true) };
  }
  return { draw: { label: "引き分け", color: "#9CA3AF" } };
}

function badgeEl(result) {
  const el = Object.assign(document.createElement("span"), { className: "sc-result", textContent: result.label });
  el.style.background = result.color;
  return el;
}

// 勝ち・負け・引き分けの印（Flex）
function badgeFlex(result) {
  return {
    type: "box",
    layout: "horizontal",
    justifyContent: "center",
    contents: [
      // flex: 0 で文字の幅だけの札にする（横の箱の中の部品は、何もしないと幅いっぱいに広がり、文字が左に寄る）
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        cornerRadius: "999px",
        backgroundColor: result.color,
        paddingStart: "12px",
        paddingEnd: "12px",
        paddingTop: "2px",
        paddingBottom: "2px",
        contents: [{ type: "text", text: result.label, size: "xxs", color: "#FFFFFF", weight: "bold", align: "center" }]
      }
    ]
  };
}

// 得点を時間の順に。自チームは「⚽ 12' 山田」、相手は「25' 相手 ⚽」
function goalLines(match) {
  return [...match.g]
    .sort((a, b) => (parseInt(a.min, 10) || 0) - (parseInt(b.min, 10) || 0))
    .map((g) => {
      const min = g.min ? `${g.min}'` : "";
      return g.side === "t"
        ? { side: "t", text: [min, g.name || match.o || "相手", "⚽"].filter(Boolean).join(" ") }
        : { side: "u", text: ["⚽", min, g.name].filter(Boolean).join(" ") };
    });
}

// ---- 送るカード（Flex）----

// 位置を指定して置く、中身のない箱（ピッチの線など）
function absBox(props) {
  return { type: "box", layout: "vertical", position: "absolute", contents: [], ...props };
}

const circleFlex = (size) => ({ type: "box", layout: "vertical", width: `${size}px`, height: `${size}px`, cornerRadius: `${size / 2}px`, borderWidth: "2px", borderColor: LINE_COLOR, contents: [] });

/**
 * フットサルのゴール前のエリア（D形＝両端が丸い形の半分）。入れ物（高さ d）の中に、高さ 2d の角丸の箱を
 * 入れ物の上（下）にはみ出させて置き、はみ出た半分を入れ物に切らせる（位置を指定した部品は親の外が切れる）
 */
function futsalAreasFlex(height) {
  const d = Math.round(height * 0.15);
  const inner = (side) => ({ ...absBox({ width: "100%", height: `${d * 2}px`, cornerRadius: `${d}px`, borderWidth: "2px", borderColor: LINE_COLOR }), ...(side === "top" ? { offsetBottom: "0px" } : { offsetTop: "0px" }), offsetStart: "0px" });
  return [
    { type: "box", layout: "vertical", position: "absolute", offsetTop: `${Math.round(height * 0.04)}px`, offsetStart: "15%", width: "70%", height: `${d}px`, contents: [inner("top")] },
    { type: "box", layout: "vertical", position: "absolute", offsetTop: `${Math.round(height * 0.96) - d}px`, offsetStart: "15%", width: "70%", height: `${d}px`, contents: [inner("bottom")] }
  ];
}

/** ピッチの図（線と選手）。body の中に置く */
function pitchFlex(lineup, palette) {
  const height = pitchHeight(lineup);
  const width = tokenWidth(lineup);
  const lines = [
    absBox({ offsetTop: "4%", offsetStart: "5%", width: "90%", height: "92%", borderWidth: "2px", borderColor: LINE_COLOR, cornerRadius: "4px" }),
    absBox({ offsetTop: "50%", offsetStart: "5%", width: "90%", height: "2px", backgroundColor: LINE_COLOR }),
    // センターサークル：横いっぱいの帯の中で真ん中に寄せる（% の位置では円の中心を合わせられないため）
    {
      type: "box",
      layout: "horizontal",
      position: "absolute",
      offsetTop: `${height / 2 - (lineup.m === "futsal" ? 23 : 28)}px`,
      offsetStart: "0px",
      width: "100%",
      justifyContent: "center",
      contents: [circleFlex(lineup.m === "futsal" ? 46 : 56)]
    },
    ...(lineup.m === "futsal" ? futsalAreasFlex(height) : [
      absBox({ offsetTop: "4%", offsetStart: "28%", width: "44%", height: "13%", borderWidth: "2px", borderColor: LINE_COLOR }),
      absBox({ offsetTop: "83%", offsetStart: "28%", width: "44%", height: "13%", borderWidth: "2px", borderColor: LINE_COLOR })
    ])
  ];
  const players = lineup.pl.map((p, index) => ({
    type: "box",
    layout: "vertical",
    position: "absolute",
    width: `${width}%`,
    offsetStart: `${Math.min(100 - width, Math.max(0, p.x - width / 2))}%`,
    offsetTop: `${Math.round(Math.min(height - 40, Math.max(0, (p.y / 100) * height - 18)))}px`,
    alignItems: "center",
    contents: [
      isKeeper(lineup, index) ? keeperFlex(tokenFlex(lineup, index, p, palette)) : tokenFlex(lineup, index, p, palette),
      { type: "text", text: p.name || " ", size: "xxs", color: "#FFFFFF", weight: "bold", align: "center", margin: "xs" }
    ]
  }));
  return {
    type: "box",
    layout: "vertical",
    height: `${height}px`,
    backgroundColor: PITCH_COLOR,
    cornerRadius: "12px",
    contents: [...lines, ...players]
  };
}

// 選手の丸（背番号）
function tokenFlex(lineup, index, p, palette) {
  const colors = tokenColors(lineup, index, palette);
  return {
    type: "box",
    layout: "vertical",
    width: "24px",
    height: "24px",
    cornerRadius: "12px",
    backgroundColor: colors.fill,
    borderWidth: "1px",
    borderColor: colors.border,
    justifyContent: "center",
    contents: [{ type: "text", text: p.number || " ", size: "xxs", color: colors.text, weight: "bold", align: "center" }]
  };
}

// GK：丸の左下に白い丸の 🧤（さくせん盤と同じ。右下は得点・カードの印の場所）。
// 入れ物からはみ出すと切れるので、丸が真ん中に来る広さ（左右に 14px ずつ）の入れ物に重ねる
function keeperFlex(token) {
  return {
    type: "box",
    layout: "vertical",
    width: "52px",
    height: "28px",
    contents: [
      Object.assign(token, { position: "absolute", offsetStart: "14px", offsetTop: "0px" }),
      {
        type: "box",
        layout: "vertical",
        position: "absolute",
        offsetStart: "1px",
        offsetTop: "13px",
        width: "15px",
        height: "15px",
        cornerRadius: "8px",
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        contents: [{ type: "text", text: "🧤", size: "xxs", align: "center" }]
      }
    ]
  };
}

/** スタメンの body に足す部品（ピッチと控え） */
function lineupFlex(palette) {
  if (!state.lineup) return [];
  const pitch = pitchFlex(state.lineup, palette);
  // ピッチをタップすると、同じ選手・フォーメーション・色のままサッカーの作戦盤が開く。
  // LINE のリンクは 1000 文字までなので、収まらないときはさくせん盤を開くだけにする
  const full = soccerEditorUrl();
  const action = soccerToolAction(full.length <= 1000 ? full : SOCCER_EDITOR_URL);
  if (action) pitch.action = action;
  const parts = [pitch, ...toolTapHintFlex("lineup")];
  if (state.lineup.s) parts.push({ type: "text", text: `控え：${state.lineup.s}`, size: "xs", color: "#6B7280", wrap: true });
  return parts;
}

/** 試合結果の body に足す部品（スコア・勝敗・前半・得点・MVP） */
function matchFlex(palette) {
  const match = state.match;
  if (!match) return [];
  const sides = matchSides(match, palette);
  // チーム名の行（勝ち・負けはそれぞれの下。名前が長ければ折り返す）とスコアの行。引き分けはスコアの下の中央
  const team = (name, result) => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    spacing: "xs",
    contents: [{ type: "text", text: name, size: "sm", weight: "bold", color: "#111827", align: "center", wrap: true }, ...(result ? [badgeFlex(result)] : [])]
  });
  const parts = [
    {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [team(match.t || "自チーム", sides.us), { type: "text", text: "vs", size: "xs", color: "#9CA3AF", flex: 0, gravity: "top" }, team(match.o || "相手", sides.them)]
    },
    { type: "text", text: `${match.us} - ${match.th}`, size: "3xl", weight: "bold", color: palette.start, align: "center" }
  ];
  if (sides.draw) parts.push(badgeFlex(sides.draw));
  if (pkText(match)) parts.push({ type: "text", text: pkText(match), size: "md", weight: "bold", color: palette.start, align: "center" });
  if (periodsText(match)) parts.push({ type: "text", text: periodsText(match), size: "xs", color: "#6B7280", align: "center", wrap: true });
  const goals = goalLines(match);
  if (goals.length) {
    parts.push({ type: "separator", margin: "md" });
    parts.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: goals.map((g) => ({ type: "text", text: g.text, size: "sm", color: g.side === "t" ? "#6B7280" : "#111827", align: g.side === "t" ? "end" : "start", wrap: true }))
    });
  }
  // アシスト・カード（さくせん盤の印から。あるときだけ）
  const extras = [assistText(match), cardsText(match), subsText(match)].filter(Boolean);
  if (extras.length) {
    if (!goals.length) parts.push({ type: "separator", margin: "md" });
    extras.forEach((text, i) => parts.push({ type: "text", text, size: "xs", color: "#4B5563", wrap: true, ...(i === 0 ? { margin: "md" } : {}) }));
  }
  if (match.mvp) parts.push({ type: "text", text: `🏅 MVP ${match.mvp}`, size: "sm", weight: "bold", color: "#111827", align: "center", margin: "md" });
  // 結果のところ全体をタップすると、さくせん盤が開く。結果の中身は渡さない（直したり流用したりはしない想定）
  const action = soccerToolAction(SOCCER_EDITOR_URL);
  return [{ type: "box", layout: "vertical", spacing: "sm", contents: parts, ...(action ? { action } : {}) }, ...toolTapHintFlex("match")];
}
