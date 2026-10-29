// お知らせカード：画面の操作（入力・スワイプ・ボタン）を結ぶ。card/index.html が順に読む（同じ範囲の変数を使う）。

// ---- イベント ----

// 行を編集しているあいだだけ出す × （バッジ・候補・項目・チケットの項目で共通。shared/ui.js）
function removeOnEdit(ariaLabel, onClick) {
  return window.LineShareUI.removeButton(ariaLabel, onClick, { onEdit: true });
}

// 画面の操作（入力・ボタン・スワイプ・タップ）をつなぐ。はじめに1回だけ呼ぶ
function bindEvents() {
  bindRowAdds();
  bindTextInputs();
  bindCardSwitch();
  bindLook();
  bindOptionalRows();
  bindPhoto();
  bindPreviewJumps();
  bindTemplatesAndReset();
  bindEnterChain(["headerInput", "dateInput", "titleInput"]);
}

// 入力欄の中身（前後の空白を除く）を target[key] に入れて描きなおす。pairs は [els の名前, key] の並び
function bindTrimmedInputs(pairs, target, after) {
  for (const [id, key] of pairs) {
    els[id].addEventListener("input", () => {
      target()[key] = els[id].value.trim();
      after?.(key);
      render();
    });
  }
}

// 同じ name のラジオを選んだら state[key] に入れて描きなおす
function bindRadios(name, key) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.addEventListener("change", () => {
      state[key] = input.value;
      render();
    });
  });
}

// 「＋ 足す」ボタン：上限までは list に空の1行を足し、足した行の入力欄へ
function bindRowAdd(button, { list, max, blank, focus, beforeRender }) {
  button.addEventListener("click", () => {
    if (list().length >= max()) return;
    list().push(blank());
    beforeRender?.();
    render();
    focus()?.focus();
  });
}

// 項目・チケットの項目・バッジ・ボタンの「＋」と、編集中だけ出す ×
function bindRowAdds() {
  for (const [container, row] of [[els.itemsArea, ".bubble-item"], [els.pairsArea, ".ticket-pair"], [els.badgeRow, ".bubble-badge"]]) {
    window.LineShareUI.keepRemoveVisible(container, row);
  }
  bindRowAdd(els.itemAddButton, {
    list: () => state.items,
    // リストのない種類では足さない
    max: () => (KINDS[state.kind].list ? KINDS[state.kind].max : 0),
    blank: () => "",
    focus: () => [...els.itemsArea.querySelectorAll("input")].pop()
  });
  bindRowAdd(els.pairAddButton, {
    list: () => state.pairs,
    max: () => MAX_PAIRS,
    blank: () => ({ label: "", value: "" }),
    focus: () => els.pairsArea.querySelector(".ticket-pair:last-child input")
  });
  bindRowAdd(els.badgeAddButton, {
    list: () => state.badges,
    max: () => MAX_BADGES,
    blank: () => "",
    focus: () => els.badgeRow.querySelector(".bubble-badge:last-child .bubble-badge-text")
  });
  bindRowAdd(els.addButtonButton, {
    list: () => state.buttons,
    max: () => MAX_BUTTONS,
    blank: () => ({ label: "", url: "" }),
    beforeRender: renderButtonList,
    focus: () => els.buttonList.querySelector(".button-row:last-child input")
  });
}

// 文字の入力欄（完了ボタン・道のり・クーポン・見出しなど）
function bindTextInputs() {
  els.doneButton.addEventListener("input", () => {
    state.doneLabel = els.doneButton.value.trim() || DEFAULT_DONE_LABEL;
    render();
  });
  bindTrimmedInputs([["routeFrom", "from"], ["routeFromSub", "fromSub"], ["routeTo", "to"], ["routeToSub", "toSub"]], () => state.route);
  bindTrimmedInputs([["couponOffer", "offer"], ["couponCode", "code"], ["couponExpiry", "expiry"]], () => state.coupon);
  const textFields = [
    ["headerInput", "headerTitle"],
    ["dateInput", "date"],
    ["titleInput", "title"],
    ["detailInput", "detail"],
    ["imageUrlInput", "imageUrl"],
    ["imageActionUrlInput", "imageActionUrl"]
  ];
  bindTrimmedInputs(textFields, () => state, (key) => {
    if (key === "imageUrl") state.imageRatio = "";
  });
}

// カードの切りかえ：足す・消す・隣の端のタップ・横スクロール・スワイプ
function bindCardSwitch() {
  els.cardAddButton.addEventListener("click", addCard);
  els.cardRemoveButton.addEventListener("click", removeCard);
  // 隣のカードの端をタップすると、そのカードへ
  els.peekPrev.addEventListener("click", () => switchCard(current - 1));
  els.peekNext.addEventListener("click", () => switchCard(current + 1));
  bindWheelSwitch();
  bindSwipeSwitch();
}

// PC のトラックパッドなどの横スクロールでも前後へ（続けて動かないよう少し間を空ける）
function bindWheelSwitch() {
  let wheelLock = 0;
  els.cardStage.addEventListener("wheel", (event) => {
    if (cards.length <= 1 || Math.abs(event.deltaX) < 25 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelLock = now + 500;
    switchCard(current + (event.deltaX > 0 ? 1 : -1));
  }, { passive: false });
}

// カードを左右にスワイプすると前後のカードへ（LINE の横スクロールと同じ向き）
function bindSwipeSwitch() {
  let swipe = null;
  els.bubble.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    swipe = { x: touch.clientX, y: touch.clientY, horizontal: null };
  }, { passive: true });
  els.bubble.addEventListener("touchmove", (event) => {
    if (!swipe || cards.length <= 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (swipe.horizontal === null && Math.hypot(dx, dy) > 8) swipe.horizontal = Math.abs(dx) > Math.abs(dy);
    if (swipe.horizontal) els.cardStage.style.setProperty("--drag", `${dx * 0.6}px`);
  }, { passive: true });
  els.bubble.addEventListener("touchend", (event) => {
    els.cardStage.style.removeProperty("--drag");
    if (!swipe || cards.length <= 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const horizontal = swipe.horizontal;
    swipe = null;
    if (!horizontal || Math.abs(dx) < 50) return;
    switchCard(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

// 見た目：色・自分の色・大きさ・写真の形と収め方
function bindLook() {
  bindRadios("theme", "theme");
  els.customColorInput.addEventListener("input", () => {
    state.customColor = normalizeHexColor(els.customColorInput.value);
    state.theme = "custom";
    checkRadio("theme", "custom");
    render();
  });
  els.bubbleSizeRange.addEventListener("input", () => {
    state.bubbleSize = BUBBLE_SIZES[Number(els.bubbleSizeRange.value)] || "mega";
    // 横スクロールのカードは同じ大きさにそろえる
    cards.forEach((card) => (card.bubbleSize = state.bubbleSize));
    requestAnimationFrame(renderPeeks);
    els.bubbleSizeLabel.textContent = state.bubbleSize;
    render();
  });
  bindRadios("imageShape", "imageShape");
  bindRadios("imageFit", "imageFit");
}

// サブタイトル・詳細はプレビュー上の ＋ で出し、× で隠す（中身は残るので ＋ で戻せる）
function bindOptionalRows() {
  els.showDateToggle.addEventListener("change", () => {
    state.showDate = els.showDateToggle.checked;
    render();
  });
  els.showDetailToggle.addEventListener("change", () => {
    state.showDetail = els.showDetailToggle.checked;
    render();
  });
  const toggle = (checkbox, on) => {
    checkbox.checked = on;
    checkbox.dispatchEvent(new Event("change"));
  };
  window.LineShareUI.optional(els.dateRow, {
    label: "サブタイトル",
    isOn: () => state.showDate,
    onAdd: () => toggle(els.showDateToggle, true),
    onRemove: () => toggle(els.showDateToggle, false)
  });
  window.LineShareUI.optional(els.detailRow, {
    label: "詳細",
    isOn: () => state.showDetail,
    onAdd: () => toggle(els.showDetailToggle, true),
    onRemove: () => toggle(els.showDetailToggle, false)
  });
}

// 写真：選ぶ・消す・読めたか
function bindPhoto() {
  els.photoFileInput.addEventListener("change", () => {
    const file = els.photoFileInput.files?.[0];
    els.photoFileInput.value = "";
    if (file) uploadPhoto(file);
  });
  els.photoClearButton.addEventListener("click", () => {
    state.imageUrl = "";
    state.imageRatio = "";
    els.imageUrlInput.value = "";
    setPhotoStatus("");
    render();
  });
  els.heroImage.addEventListener("error", () => {
    if (photo.uploading) return;
    els.imageWarning.hidden = false;
    els.imageWarning.textContent = "写真を読み込めませんでした。URLを確認してください。";
  });
  els.heroImage.addEventListener("load", () => {
    rememberImageRatio();
    els.imageWarning.textContent = "写真のURLは https:// から始まる公開URLを入力してください。";
    els.imageWarning.hidden = isHttpsUrl(state.imageUrl);
  });
}

// プレビューの写真・ボタンをタップしたら、その設定を開いてそこへ移動する
function bindPreviewJumps() {
  els.heroArea.addEventListener("click", () => jumpToSection("photoSettings", els.imageUrlInput));
  const jumpToButton = (event) => {
    const item = event.target.closest(".bubble-action");
    if (!item) return;
    const index = [...els.buttonStack.children].indexOf(item);
    const row = els.buttonList.querySelectorAll(".button-row")[index];
    jumpToSection("linkSettings", row?.querySelector("input"));
  };
  els.buttonStack.addEventListener("click", jumpToButton);
  els.buttonStack.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      jumpToButton(event);
    }
  });
}

// テンプレートの保存・JSON のコピー・入力を消す
function bindTemplatesAndReset() {
  els.saveTemplateButton.addEventListener("click", saveTemplate);
  els.templateNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      saveTemplate();
    }
  });
  els.copyJsonButton.addEventListener("click", copyJson);
  els.resetButton.addEventListener("click", resetInput);
}

// 入力を消す。聞かずに消して、トーストの「元に戻す」で戻せるようにする（docs/ux.md D1）
function resetInput() {
  const lastSent = localStorageGet(LAST_SENT_KEY);
  const showUndo = offerUndo("入力を消しました", () => {
    if (lastSent !== null) localStorageSet(LAST_SENT_KEY, lastSent);
  });
  hasTriedShare = false;
  state = structuredClone(BLANK_STATE);
  cards = [state];
  current = 0;
  queryUrls.clear();
  localStorageRemove(LAST_SENT_KEY);
  applyStateToEditor();
  render();
  setStatus("");
  showUndo();
}

// カード上の1行入力は Enter で次の欄へ（使えない欄はとばす。最後なら閉じる）
function bindEnterChain(chain) {
  chain.forEach((id, index) => {
    els[id].enterKeyHint = "next";
    els[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || els[id].tagName === "TEXTAREA") return;
      event.preventDefault();
      const next = chain.slice(index + 1).map((nextId) => els[nextId]).find((field) => !field.disabled);
      (next || els[id]).focus();
      if (!next) els[id].blur();
    });
  });
}
