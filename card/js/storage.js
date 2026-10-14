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
