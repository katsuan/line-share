// お知らせカード：サッカー・フットサルの形式（スタメン・試合結果）。
// 作るのは別のツール（サッカーの道具。SOCCER_EDITOR_URL）で、ここへは ?kind=lineup|match&data=<JSON を base64url> で渡される。
// ここでは中身を確かめて（数・長さ・位置の範囲）、ピッチの図・スコアをプレビューと送るカード（Flex）にする。
// 選手の配置などを直すときは「配置を直す」で同じ中身のままサッカーの道具に戻る。
//
// data の形（キーは短くしてリンクを短くする）
//   lineup: { m: "futsal"|"soccer", f: "1-2-1", t: チーム, o: 相手, s: 控え, pl: [[背番号, 名前, x, y], ...] }   x・y は 0〜100（ピッチの左上から。上が攻める向き）
//   match:  { t: チーム, o: 相手, us, th, hu, ht（前半。なければ空）, g: [[ "u"|"t", 分, 名前 ], ...], mvp }

const SOCCER_EDITOR_URL = "https://katsuan.github.io/soccer/";
const GK_COLOR = "#F5A524";
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
  const players = source.pl.slice(0, mode === "futsal" ? 5 : 11).map((p) => ({
    number: cutText(Array.isArray(p) ? p[0] : "", 3),
    name: cutText(Array.isArray(p) ? p[1] : "", 8),
    x: clampNum(Array.isArray(p) ? p[2] : 50, 0, 100),
    y: clampNum(Array.isArray(p) ? p[3] : 50, 0, 100)
  }));
  if (!players.length) return null;
  return { m: mode, f: cutText(source.f, 10), t: cutText(source.t, 20), o: cutText(source.o, 20), s: cutText(source.s, 80), pl: players };
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
    g: (Array.isArray(source.g) ? source.g : []).slice(0, 20).map((g) => ({
      side: g?.[0] === "t" ? "t" : "u",
      min: cutText(g?.[1], 4),
      name: cutText(g?.[2], 12)
    })),
    mvp: cutText(source.mvp, 12)
  };
}

// 保存・送り直しのときは、プレビュー用に整えた形から data の形に戻す
function lineupToData(lineup) {
  return { ...lineup, pl: lineup.pl.map((p) => [p.number, p.name, p.x, p.y]) };
}

function matchToData(match) {
  return { ...match, g: match.g.map((g) => [g.side, g.min, g.name]) };
}

/** サッカーの道具に、今の中身のまま戻るリンク */
function soccerEditorUrl() {
  if (state.kind === "lineup" && state.lineup) return `${SOCCER_EDITOR_URL}?tab=lineup&data=${encodeSoccerData(lineupToData(state.lineup))}`;
  if (state.kind === "match" && state.match) return `${SOCCER_EDITOR_URL}?tab=result&data=${encodeSoccerData(matchToData(state.match))}`;
  return SOCCER_EDITOR_URL;
}

const pitchHeight = (lineup) => (lineup.m === "futsal" ? 300 : 360);
const tokenWidth = (lineup) => (lineup.m === "futsal" ? 26 : 19); // %
const isKeeper = (lineup, index) => index === 0; // 先頭は GK

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
    els.lineupArea.replaceChildren(Object.assign(document.createElement("p"), { className: "sc-empty", textContent: "サッカーの道具で選手を並べてから開いてください。" }));
    return;
  }
  const pitch = document.createElement("div");
  pitch.className = "sc-pitch";
  pitch.style.height = `${pitchHeight(lineup)}px`;
  pitch.innerHTML = '<i class="sc-line is-border"></i><i class="sc-line is-half"></i><i class="sc-line is-circle"></i><i class="sc-line is-box-top"></i><i class="sc-line is-box-bottom"></i>';
  const width = tokenWidth(lineup);
  lineup.pl.forEach((p, index) => {
    const token = document.createElement("span");
    token.className = "sc-token";
    token.style.width = `${width}%`;
    token.style.left = `${Math.min(100 - width, Math.max(0, p.x - width / 2))}%`;
    token.style.top = `${Math.min(pitchHeight(lineup) - 40, Math.max(0, (p.y / 100) * pitchHeight(lineup) - 18))}px`;
    const number = document.createElement("b");
    number.textContent = p.number || "";
    number.style.background = isKeeper(lineup, index) ? GK_COLOR : palette.start;
    const name = document.createElement("small");
    name.textContent = p.name || "";
    token.append(number, name);
    pitch.append(token);
  });
  const parts = [pitch];
  if (lineup.s) parts.push(Object.assign(document.createElement("p"), { className: "sc-subs", textContent: `控え：${lineup.s}` }));
  els.lineupArea.replaceChildren(...parts);
}

function renderMatchPreview(palette) {
  const match = state.match;
  if (!match) {
    els.matchArea.replaceChildren(Object.assign(document.createElement("p"), { className: "sc-empty", textContent: "サッカーの道具で結果を入れてから開いてください。" }));
    return;
  }
  const result = matchResult(match, palette);
  const box = document.createElement("div");
  box.className = "sc-match";
  box.innerHTML = `
    <div class="sc-score"><span></span><b></b><span></span></div>
    <span class="sc-result"></span>
    <small class="sc-half"></small>
    <ul class="sc-goal-list"></ul>
    <p class="sc-mvp"></p>`;
  const [teamEl, scoreEl, oppEl] = box.querySelector(".sc-score").children;
  teamEl.textContent = match.t || "自分たち";
  scoreEl.textContent = `${match.us} - ${match.th}`;
  scoreEl.style.color = palette.start;
  oppEl.textContent = match.o || "相手";
  const badge = box.querySelector(".sc-result");
  badge.textContent = result.label;
  badge.style.background = result.color;
  const half = box.querySelector(".sc-half");
  half.textContent = match.hu !== "" && match.ht !== "" ? `前半 ${match.hu} - ${match.ht}` : "";
  box.querySelector(".sc-goal-list").replaceChildren(
    ...goalLines(match).map((g) => Object.assign(document.createElement("li"), { className: g.side === "t" ? "is-them" : "", textContent: g.text }))
  );
  box.querySelector(".sc-mvp").textContent = match.mvp ? `🏅 MVP ${match.mvp}` : "";
  els.matchArea.replaceChildren(box);
}

function matchResult(match, palette) {
  if (match.us > match.th) return { label: "勝ち", color: palette.start };
  if (match.us < match.th) return { label: "負け", color: "#6B7280" };
  return { label: "引き分け", color: "#9CA3AF" };
}

// 得点を時間の順に。自分たちは「⚽ 12' 山田」、相手は「25' 相手 ⚽」
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
      offsetTop: `${height / 2 - 28}px`,
      offsetStart: "0px",
      width: "100%",
      justifyContent: "center",
      contents: [{ type: "box", layout: "vertical", width: "56px", height: "56px", cornerRadius: "28px", borderWidth: "2px", borderColor: LINE_COLOR, contents: [] }]
    },
    absBox({ offsetTop: "4%", offsetStart: "28%", width: "44%", height: "13%", borderWidth: "2px", borderColor: LINE_COLOR }),
    absBox({ offsetTop: "83%", offsetStart: "28%", width: "44%", height: "13%", borderWidth: "2px", borderColor: LINE_COLOR })
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
      {
        type: "box",
        layout: "vertical",
        width: "24px",
        height: "24px",
        cornerRadius: "12px",
        backgroundColor: isKeeper(lineup, index) ? GK_COLOR : palette.start,
        borderWidth: "1px",
        borderColor: "#FFFFFF",
        justifyContent: "center",
        contents: [{ type: "text", text: p.number || " ", size: "xxs", color: "#FFFFFF", weight: "bold", align: "center" }]
      },
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

/** スタメンの body に足す部品（ピッチと控え） */
function lineupFlex(palette) {
  if (!state.lineup) return [];
  const parts = [pitchFlex(state.lineup, palette)];
  if (state.lineup.s) parts.push({ type: "text", text: `控え：${state.lineup.s}`, size: "xs", color: "#6B7280", wrap: true });
  return parts;
}

/** 試合結果の body に足す部品（スコア・勝敗・前半・得点・MVP） */
function matchFlex(palette) {
  const match = state.match;
  if (!match) return [];
  const result = matchResult(match, palette);
  const side = (text) => ({ type: "text", text: text || " ", size: "sm", weight: "bold", color: "#111827", align: "center", wrap: true, flex: 1 });
  const parts = [
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      spacing: "sm",
      contents: [
        side(match.t || "自分たち"),
        { type: "text", text: `${match.us} - ${match.th}`, size: "3xl", weight: "bold", color: palette.start, align: "center", flex: 0 },
        side(match.o || "相手")
      ]
    },
    {
      type: "box",
      layout: "horizontal",
      justifyContent: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          cornerRadius: "999px",
          backgroundColor: result.color,
          paddingStart: "14px",
          paddingEnd: "14px",
          paddingTop: "2px",
          paddingBottom: "2px",
          contents: [{ type: "text", text: result.label, size: "xs", color: "#FFFFFF", weight: "bold" }]
        }
      ]
    }
  ];
  if (match.hu !== "" && match.ht !== "") {
    parts.push({ type: "text", text: `前半 ${match.hu} - ${match.ht}`, size: "xs", color: "#6B7280", align: "center" });
  }
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
  if (match.mvp) parts.push({ type: "text", text: `🏅 MVP ${match.mvp}`, size: "sm", weight: "bold", color: "#111827", align: "center", margin: "md" });
  return parts;
}
