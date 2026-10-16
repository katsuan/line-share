// お知らせカード：localStorage（使えない環境でも落ちないように）

// ---- localStorage（使えない環境でも落ちないように） ----

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(error);
  }
}

function localStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(error);
  }
}

function loadJson(key) {
  try {
    return JSON.parse(localStorageGet(key) || "null");
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  localStorageSet(key, JSON.stringify(value));
}

// ---- 編集中の下書き ----
// LINE の中では、ほかのアプリに移っただけでページが閉じることがあるので、編集するたびに少し間をおいて残す。
// 空のカード1枚だけのときと、前回送った内容と同じときは残さない（次に開いたときに「続きから」を出さないため）

let draftTimer = null;
// 開いた直後の描画では保存しない（init が最後に true にする）
let draftReady = false;

function saveDraftSoon() {
  if (!draftReady) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 600);
}

function saveDraftNow() {
  clearTimeout(draftTimer);
  if (!draftReady) return;
  storeCurrent();
  if (isBlankDeck(cards) || sameDeck(cards, lastSentCards())) {
    localStorageRemove(DRAFT_KEY);
    return;
  }
  saveJson(DRAFT_KEY, { cards: structuredClone(cards), current, savedAt: Date.now() });
}

// ---- LINE の外から持っていく中身（ログインの行き来・LINE アプリで開き直す） ----
// ログイン：このブラウザに一時的に残し（sessionStorage）、戻ったら続きから。
// LINE アプリ：?deck=（カードの束を base64url にした JSON）で渡す。長すぎるときは持っていかない（LINE アプリ側の続きで開く）
const CARRY_KEY = "line-share:card-carry";
const CARRY_MAX = 6000;

function encodeDeck() {
  storeCurrent();
  const bytes = new TextEncoder().encode(JSON.stringify({ cards, current }));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeDeck(text) {
  const b64 = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
}

function keepDeckForLogin() {
  saveDraftNow();
  try {
    sessionStorage.setItem(CARRY_KEY, encodeDeck());
  } catch (error) {
    console.warn(error);
  }
}

// ログインのあとは、渡されたパラメータを付けずにカードの画面へ戻る（付けると、その中身で開き直してしまう）
function loginReturnUrl() {
  return new URL("./", location.href).toString();
}

function carriedDeckUrl() {
  const deck = encodeDeck();
  return window.LineShareLiff.appUrl(deck.length <= CARRY_MAX ? `/card/?deck=${deck}` : "/card/");
}

// ?deck=（LINE アプリで開いたとき）か、ログインの前に残した中身。URL からは消す
function takeCarriedDeck() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get("deck") || "";
  let raw = fromUrl;
  try {
    raw = raw || sessionStorage.getItem(CARRY_KEY) || "";
    sessionStorage.removeItem(CARRY_KEY);
  } catch {
    // sessionStorage が使えないときは ?deck= だけ
  }
  if (url.searchParams.has("deck")) {
    url.searchParams.delete("deck");
    history.replaceState(null, "", url);
  }
  if (!raw) return null;
  try {
    const deck = decodeDeck(raw);
    if (!Array.isArray(deck?.cards) || !deck.cards.length) return null;
    // リンク（?deck=）で渡された中のリンクは、ほかのクエリと同じく許可したドメインだけ送れるようにする（url.js）
    if (fromUrl && raw === fromUrl) collectUrls(deck.cards).forEach((value) => queryUrls.add(value));
    return deck;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function collectUrls(value, found = []) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value.trim())) found.push(value.trim());
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectUrls(item, found));
  }
  return found;
}

function loadDraft() {
  const draft = loadJson(DRAFT_KEY);
  return Array.isArray(draft?.cards) && draft.cards.length ? draft : null;
}

function clearDraft() {
  clearTimeout(draftTimer);
  localStorageRemove(DRAFT_KEY);
}

// 前回送った内容（複数枚 { cards } か、1枚だけの古い形）
function lastSentCards() {
  const saved = loadJson(LAST_SENT_KEY);
  if (Array.isArray(saved?.cards)) return saved.cards;
  return saved && typeof saved === "object" ? [saved] : [];
}

function sameDeck(a, b) {
  return a.length === b.length && a.every((card, i) => JSON.stringify(hydrate(card)) === JSON.stringify(hydrate(b[i])));
}

function isBlankDeck(list) {
  if (list.length !== 1) return false;
  const blank = hydrate({ ...BLANK_STATE, kind: list[0].kind, theme: list[0].theme, bubbleSize: list[0].bubbleSize });
  return JSON.stringify(hydrate(list[0])) === JSON.stringify(blank);
}
