// お知らせカード：はじめに動かす（init）。ファイルの読み込み順は card/index.html を参照

async function init() {
  renderThemeSwatches();
  [
    "bubble", "bubbleHeader", "headerInput", "dateInput", "titleInput", "detailInput",
    "heroArea", "heroImage", "badgeRow", "buttonStack",
    "showDateToggle", "showDetailToggle", "customColorInput",
    "imageUrlInput", "imageActionUrlInput", "imageWarning",
    "photoFileInput", "photoClearButton", "photoStatus", "photoExpireNote",
    "photoShapeField", "photoShapeHint", "photoFitField",
    "badgeAddButton",
    "buttonList", "addButtonButton", "buttonWarning",
    "presetGrid", "templateList", "templateNameInput", "saveTemplateButton",
    "lookMeta", "photoMeta", "linkMeta",
    "dateRow", "detailRow", "bubbleSizeRange", "bubbleSizeLabel",
    "copyJsonButton", "resetButton", "shareButton", "status",
    "cardTabs", "cardAddButton", "cardRemoveButton", "cardStage", "peekPrev", "peekNext",
    "kindChips", "itemsArea", "itemAddButton", "doneButton",
    "ticketArea", "routeFrom", "routeFromSub", "routeTo", "routeToSub", "pairsArea", "pairAddButton",
    "couponArea", "couponOffer", "couponCode", "couponExpiry",
    "sendWarningModal", "sendWarningDontShow", "sendWarningConfirm", "sendWarningCancel"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
  els.pageTitle = document.querySelector(".ls-topbar .ls-title");

  const queryState = getQueryState();
  startedWithQuery = Boolean(queryState);
  const saved = loadJson(LAST_SENT_KEY);
  // 前に送った内容は、複数枚（{ cards }）か、1枚だけの古い形のどちらか。
  // 形式（テンプレート）を選んで開いたときは、まっさらな1枚にしてテンプレートの読み込みを待つ（種類だけ先に合わせる）
  cards = queryState
    ? [hydrate(queryState)]
    : START_TEMPLATE
      ? [hydrate({ ...BLANK_STATE, kind: KINDS[START_TEMPLATE] ? START_TEMPLATE : "notice" })]
    : Array.isArray(saved?.cards) && saved.cards.length
      ? saved.cards.slice(0, MAX_CARDS).map(hydrate)
      : [hydrate(saved ?? BLANK_STATE)];
  // 大きさは全カードでそろえる（カルーセルのカードは同じ大きさにする）
  cards.forEach((card) => (card.bubbleSize = cards[0].bubbleSize));
  current = 0;
  state = cards[0];

  bindEvents();
  renderTemplates();
  loadPresets();
  applyStateToEditor();
  render();

  window.addEventListener("resize", () => {
    autoGrowAll();
    renderPeeks();
  });
  requestAnimationFrame(renderPeeks);
  requestAnimationFrame(autoGrowAll);

  // はじめて開いた人にだけ、短い使い方を出す（shared/ui.js）
  window.LineShareUI.firstTip("card", [
    "カードの文字をタップして、そのまま入力します。",
    "投票・チケットなどの形式は、上のボタンで切り替えられます。",
    "下の「カードで送る」で、送り先を選んで送れます。"
  ], document.querySelector(".ls-preview"));
  // 無料の画像サーバーは眠っていると写真の保存が遅いので、開いた時点で起こしておく
  window.LineSharePlan?.warmUp();
  await initLiff();
}

document.addEventListener("DOMContentLoaded", init);
