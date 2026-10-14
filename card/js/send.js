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
  setStatus(message || "送信後は修正できません。", Boolean(message) && hasTriedShare);
}

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.classList.toggle("is-error", isError);
}

async function share() {
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
    const messages = [buildDeckMessage()];
    if (!(await window.LineShareLiff.share(messages))) {
      setStatus(window.LineShareLiff.MESSAGES.canceled);
      return;
    }

    storeCurrent();
    saveJson(LAST_SENT_KEY, { cards: structuredClone(cards) });
    clearDraft(); // 送った内容は「前回送った内容」に残るので、下書きは消す
    renderTemplates(); // テンプレートの「前回送った内容」を今送ったものにする
    setStatus(window.LineShareLiff.MESSAGES.sent);
    // すぐ閉じず、続けて別のトークにも送るか・閉じるか・もう少し作るかを選んでもらう
    window.LineShareUI.afterSent({ resend: () => window.LineShareLiff.share(messages) });
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
}

function jumpToSection(id, focusTarget) {
  window.LineShareUI.jumpTo(id, focusTarget);
}
