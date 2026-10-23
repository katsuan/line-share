// お知らせカード：入力チェックと送信（LIFF の準備・送る前の確認）

// ---- 入力チェックと送信 ----

function getValidation() {
  if (photo.uploading) return { message: "写真をアップロードしています。少しお待ちください。", fieldId: "photoFileInput" };
  if (!state.headerTitle) return { message: "タイトルを入力してください。", fieldId: "headerInput" };
  if (!state.title) return { message: "本文タイトルを入力してください。", fieldId: "titleInput" };
  if (state.showDate && !state.date) {
    return { message: "サブタイトルを入力するか、× で消してください。", fieldId: "dateInput" };
  }
  if (state.showDetail && !state.detail) {
    return { message: "詳細を入力するか、× で消してください。", fieldId: "detailInput" };
  }
  const filled = state.items.filter(Boolean);
  if (state.kind === "vote" && filled.length < 2) {
    return { message: "投票の候補を2つ以上入れてください。", focus: () => els.itemsArea.querySelector("input")?.focus() };
  }
  if (state.kind === "ticket" && (!state.route.from || !state.route.to)) {
    return { message: "チケットの出発と到着を入れてください。", fieldId: state.route.from ? "routeTo" : "routeFrom" };
  }
  if (state.kind === "coupon" && !state.coupon.offer) {
    return { message: "クーポンの特典（例：20% OFF）を入れてください。", fieldId: "couponOffer" };
  }
  if (state.kind === "checklist" && filled.length < 1) {
    return { message: "チェックリストの項目を1つ以上入れてください。", focus: () => els.itemsArea.querySelector("input")?.focus() };
  }
  if (state.imageUrl && !isHttpsUrl(state.imageUrl)) {
    return { message: "写真のURLは https:// から始まる公開URLを入力してください。", fieldId: "imageUrlInput" };
  }
  if (state.imageActionUrl && !getSendableUrl(state.imageActionUrl) && !isBlockedQueryUrl(state.imageActionUrl)) {
    return { message: "写真タップ時のURLの形式が正しくありません。", fieldId: "imageActionUrlInput" };
  }
  const brokenIndex = state.buttons.findIndex(
    (button) => !button.url.trim() || (!getSendableUrl(button.url) && !isBlockedQueryUrl(button.url))
  );
  if (brokenIndex >= 0) {
    return {
      message: "ボタンのリンク先を http(s)・tel・mailto・line のいずれかで入力するか、ボタンを削除してください。",
      section: "linkSettings",
      focus: () => els.buttonList.querySelectorAll("input[type=url]")[brokenIndex]?.focus()
    };
  }
  return { message: "" };
}

// 全カードを確かめ、最初に足りないところがあるカードと理由を返す（2枚以上なら「カード2：」を付ける）
function getDeckValidation() {
  storeCurrent();
  const order = [current, ...cards.keys()].filter((index, i, list) => list.indexOf(index) === i);
  for (const index of order) {
    const validation = withCard(cards[index], getValidation);
    if (validation.message) {
      return {
        ...validation,
        index,
        message: cards.length > 1 ? `カード${index + 1}：${validation.message}` : validation.message
      };
    }
  }
  return { message: "" };
}

function updateShareButtonState() {
  const { message } = getDeckValidation();
  window.LineShareUI.setPreviewError(els.bubble, message);
  els.shareButton.disabled = !shareReady;
  els.shareButton.classList.toggle("is-incomplete", Boolean(message));

  if (!shareReady) return;
  setStatus(message || "送ったあとは直せません。", Boolean(message) && hasTriedShare);
}

// ---- 記録用の文字（?sendText=）。カードの後ろに、文字のメッセージを1通足して送る ----
// LINE のボットには Flex（カード）の中身が届かないので、ボットに記録させたいツール（しょくじなど）が、読みとれる文字を一緒に渡す。
// 送る前に中身を見せ、チェックを外せば送らない
// LINE の外で「ログインして送る」と、パラメータなしで戻ってくるので、ログインの前に sessionStorage に残したものも読む（storage.js の keepDeckForLogin）
const SEND_TEXT_KEY = "oqrn:card-send-text";
const SEND_TEXT = (() => {
  const fromUrl = new URLSearchParams(location.search).get("sendText") || "";
  let kept = "";
  try {
    kept = sessionStorage.getItem(SEND_TEXT_KEY) || "";
    sessionStorage.removeItem(SEND_TEXT_KEY);
  } catch {
    // 残せない端末では URL のものだけ
  }
  return (fromUrl || kept).trim().slice(0, 2000);
})();

// 送るときに使う記録用の文字（チェックを外していれば空）
function activeSendText() {
  return SEND_TEXT && document.getElementById("sendTextToggle")?.checked ? SEND_TEXT : "";
}

function initSendText() {
  const row = document.getElementById("sendTextRow");
  if (!row || !SEND_TEXT) return;
  document.getElementById("sendTextPreview").textContent = SEND_TEXT;
  row.hidden = false;
}

function sendTextMessages() {
  const text = activeSendText();
  return text ? [{ type: "text", text }] : [];
}

// ---- 来た元のツール（?from=）。送ったあとのシートに「○○に戻る」を出す ----
// from はツールごとの流入口の目印（さくせん盤＝soccer、くろのす＝countdown、紹介カード＝<key>-intro など）。
// 戻り先は、来たページ（document.referrer）がそのツールのページならそこ、なければ data/hub-links.json の url
const FROM_TOOLS = { soccer: "saqsen", countdown: "qronos", "gender-reveal": "babyq", workout: "kiloq" };
let backTarget = null;
// どのツールから来たか（読みこみのあとに URL のクエリは消すので、先に覚えておく）
const FROM_PARAM = new URLSearchParams(location.search).get("from") || "";

async function loadBackTarget() {
  const from = FROM_PARAM;
  const key = FROM_TOOLS[from] || from.replace(/-intro$/, "");
  if (!key || key === "home") return;
  try {
    const data = await fetch("../data/hub-links.json", { cache: "no-cache" }).then((response) => response.json());
    const tool = (data.items || []).find((item) => item.key === key);
    if (!tool?.url) return;
    let url = tool.url;
    try {
      const ref = new URL(document.referrer);
      const base = new URL(tool.url);
      if (ref.host === base.host && ref.pathname.startsWith(base.pathname.replace(/[^/]*$/, ""))) url = ref.href;
    } catch {
      // 来たページがわからないときは、ツールの入口へ
    }
    backTarget = { label: `${tool.name}に戻る`, url };
  } catch (error) {
    console.warn(error);
  }
}

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.classList.toggle("is-error", isError);
}

// 送っている途中か（確かめの窓・送り先選びが開いている間に、もう一度押されても2回送らない）
let sharing = false;

async function share() {
  if (sharing) return;
  sharing = true;
  try {
    await shareOnce();
  } finally {
    sharing = false;
  }
}

async function shareOnce() {
  if (!window.LineShareLiff.canShare()) {
    setStatus(window.LineShareLiff.MESSAGES.notInLine, true);
    return;
  }

  const validation = getDeckValidation();
  if (validation.message) {
    hasTriedShare = true;
    if (validation.index !== current) switchCard(validation.index);
    setStatus(validation.message, true);
    focusField(validation);
    return;
  }

  if (!(await confirmSendWarning())) {
    setStatus(window.LineShareLiff.MESSAGES.canceled);
    return;
  }

  try {
    setStatus("共有先を開いています…");
    const messages = [buildDeckMessage(), ...sendTextMessages()];
    if (!(await window.LineShareLiff.share(messages))) {
      setStatus(window.LineShareLiff.MESSAGES.canceled);
      return;
    }

    storeCurrent();
    saveJson(LAST_SENT_KEY, { cards: structuredClone(cards) });
    clearDraft(); // 送った内容は「前回送った内容」に残るので、下書きは消す
    window.LineShareLog?.track("send", { kind: [...new Set(cards.map((card) => card.kind))].join("+"), count: cards.length });
    renderTemplates(); // テンプレートの「前回送った内容」を今送ったものにする
    setStatus(window.LineShareLiff.MESSAGES.sent);
    // すぐ閉じず、続けて別のトークにも送るか・閉じるか・もう少し作るかを選んでもらう
    window.LineShareUI.afterSent({ resend: () => window.LineShareLiff.share(messages), back: backTarget });
  } catch (error) {
    console.error(error);
    setStatus(window.LineShareLiff.MESSAGES.sendFailed, true);
  }
}

function focusField(validation) {
  if (validation.section) document.getElementById(validation.section).open = true;
  if (validation.focus) {
    validation.focus();
    return;
  }
  const field = document.getElementById(validation.fieldId);
  if (!field) return;
  field.closest("details")?.setAttribute("open", "");
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  field.focus({ preventScroll: true });
}

function confirmSendWarning() {
  if (localStorageGet(SEND_WARNING_DISMISSED_KEY) === "true") {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const close = (result) => {
      els.sendWarningModal.hidden = true;
      els.sendWarningConfirm.removeEventListener("click", onConfirm);
      els.sendWarningCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => {
      if (els.sendWarningDontShow.checked) {
        localStorageSet(SEND_WARNING_DISMISSED_KEY, "true");
      }
      close(true);
    };
    const onCancel = () => close(false);

    els.sendWarningDontShow.checked = false;
    els.sendWarningConfirm.addEventListener("click", onConfirm);
    els.sendWarningCancel.addEventListener("click", onCancel);
    els.sendWarningModal.hidden = false;
    els.sendWarningConfirm.focus();
  });
}

async function initLiff() {
  if (location.protocol === "file:") {
    setStatus("ローカルプレビュー中です。共有確認は GitHub Pages など https 上で行ってください。");
    return;
  }
  if (!config.liffId) {
    setStatus("LIFF ID が未設定です（リポジトリ直下の config.js）。カードの作成とJSONコピーは使えます。", true);
    return;
  }
  loadBackTarget();
  initSendText();
  // LIFF の準備は shared/liff.js。ログインはさせず、送るときに LINE アプリ内か確かめる
  const { MESSAGES } = window.LineShareLiff;
  setStatus(MESSAGES.connecting);
  const { ready, reason } = await window.LineShareLiff.init({ login: "none" });
  if (ready) {
    shareReady = true;
    els.shareButton.addEventListener("click", share);
  } else {
    setStatus(MESSAGES[reason] || MESSAGES.failed, true);
  }
  updateShareButtonState();
  // LINE の外で開いて送り先を選べないとき：ログインして送るか、LINE アプリで開き直す（作っていた中身は持っていく）
  if (!ready || !window.LineShareLiff.canShare()) {
    window.LineShareLiff.outsideHelp(els.outsideHelp, {
      appUrl: carriedDeckUrl,
      loginUrl: loginReturnUrl,
      beforeLogin: keepDeckForLogin,
      canLogin: ready
    });
  }
}

function jumpToSection(id, focusTarget) {
  window.LineShareUI.jumpTo(id, focusTarget);
}
