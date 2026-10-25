// お知らせカード：端末に残すもの（下書き・前回送った内容・持っていく中身。localStorage が使えなくても止まらない）。card/index.html が順に読む（同じ範囲の変数を使う）。

// ---- localStorage（使えない環境でも落ちないように） ----

// 端末から1つ読む（読めない端末では null）
function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 端末に1つ残す（残せない端末ではログだけ）
function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(error);
  }
}

// 端末から1つ消す（消せない端末ではログだけ）
function localStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(error);
  }
}

// 端末から JSON を読む（読めない・壊れているときは null）
function loadJson(key) {
  try {
    return JSON.parse(localStorageGet(key) || "null");
  } catch {
    return null;
  }
}

// 端末に JSON で残す
function saveJson(key, value) {
  localStorageSet(key, JSON.stringify(value));
}

// ---- 編集中の下書き ----
// LINE の中では、ほかのアプリに移っただけでページが閉じることがあるので、編集するたびに少し間をおいて残す。
// 空のカード1枚だけのときと、前回送った内容と同じときは残さない（次に開いたときに「続きから」を出さないため）

let draftTimer = null;
// 開いた直後の描画では保存しない（init が最後に true にする）
let draftReady = false;

// 少し間をおいて下書きを残す（打っている間に何度も残さない）
function saveDraftSoon() {
  if (!draftReady) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 600);
}

// すぐ下書きを残す（空のカードだけ・前回送った内容と同じなら消す）
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

// 今のカードの束を、URL に入れられる文字（base64url の JSON）にする
function encodeDeck() {
  storeCurrent();
  const bytes = new TextEncoder().encode(JSON.stringify({ cards, current }));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// encodeDeck の文字を、カードの束に戻す（読めなければ例外）
function decodeDeck(text) {
  const b64 = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
}

// ログインで行き来する前に、作りかけのカードと記録用の文字をこのタブに残す
function keepDeckForLogin() {
  saveDraftNow();
  try {
    sessionStorage.setItem(CARRY_KEY, encodeDeck());
    // 記録用の文字（?sendText=。send.js）も、ログインのあとに残す
    const text = activeSendText();
    if (text) sessionStorage.setItem(SEND_TEXT_KEY, text);
  } catch (error) {
    console.warn(error);
  }
}

// ログインのあとは、渡されたパラメータを付けずにカードの画面へ戻る（付けると、その中身で開き直してしまう）
function loginReturnUrl() {
  return new URL("./", location.href).toString();
}

// 作りかけのカードを持って LINE 版で開く URL（長すぎるときはカードを持っていかない）
function carriedDeckUrl() {
  const deck = encodeDeck();
  // 記録用の文字（?sendText=。send.js）も、LINE アプリで開いたあとに渡す
  const text = activeSendText();
  const extra = text ? `sendText=${encodeURIComponent(text)}` : "";
  const query = [deck.length <= CARRY_MAX ? `deck=${deck}` : "", extra].filter(Boolean).join("&");
  return window.LineShareLiff.appUrl(query ? `/card/?${query}` : "/card/");
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

// 中身の中から、リンク（http・https・line:）を全部集める
function collectUrls(value, found = []) {
  if (typeof value === "string") {
    if (/^(https?:\/\/|line:)/i.test(value.trim())) found.push(value.trim());
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectUrls(item, found));
  }
  return found;
}

// 端末の下書きを読む（壊れていれば null。何枚目かが数でないときは1枚目）
function loadDraft() {
  const draft = loadJson(DRAFT_KEY);
  if (!Array.isArray(draft?.cards) || !draft.cards.length) return null;
  // 何枚目を開いていたか。数でない・枚数をこえるときは1枚目（壊れていても止まらないように）
  const current = Number.isInteger(draft.current) && draft.current >= 0 && draft.current < Math.min(draft.cards.length, MAX_CARDS) ? draft.current : 0;
  return { ...draft, current };
}

// 下書きを消す
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

// 2つのカードの束が同じ中身か
function sameDeck(a, b) {
  return a.length === b.length && a.every((card, i) => JSON.stringify(hydrate(card)) === JSON.stringify(hydrate(b[i])));
}

// カードが1枚だけで、まだ何も入れていないか
function isBlankDeck(list) {
  if (list.length !== 1) return false;
  const blank = hydrate({ ...BLANK_STATE, kind: list[0].kind, theme: list[0].theme, bubbleSize: list[0].bubbleSize });
  return JSON.stringify(hydrate(list[0])) === JSON.stringify(blank);
}
