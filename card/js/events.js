// お知らせカード：画面の操作（入力・スワイプ・ボタン）を結ぶ

// ---- イベント ----

// 行を編集しているあいだだけ出す × （バッジ・候補・項目・チケットの項目で共通。shared/ui.js）
function removeOnEdit(ariaLabel, onClick) {
  return window.LineShareUI.removeButton(ariaLabel, onClick, { onEdit: true });
}

function bindEvents() {
  for (const [container, row] of [[els.itemsArea, ".bubble-item"], [els.pairsArea, ".ticket-pair"], [els.badgeRow, ".bubble-badge"]]) {
    window.LineShareUI.keepRemoveVisible(container, row);
  }
  els.itemAddButton.addEventListener("click", () => {
    const kind = KINDS[state.kind];
    if (!kind.list || state.items.length >= kind.max) return;
    state.items.push("");
    render();
    const inputs = els.itemsArea.querySelectorAll("input");
    inputs[inputs.length - 1]?.focus();
  });
  els.doneButton.addEventListener("input", () => {
    state.doneLabel = els.doneButton.value.trim() || DEFAULT_DONE_LABEL;
    render();
  });
  for (const [id, key] of [["routeFrom", "from"], ["routeFromSub", "fromSub"], ["routeTo", "to"], ["routeToSub", "toSub"]]) {
    els[id].addEventListener("input", () => {
      state.route[key] = els[id].value.trim();
      render();
    });
  }
  for (const [id, key] of [["couponOffer", "offer"], ["couponCode", "code"], ["couponExpiry", "expiry"]]) {
    els[id].addEventListener("input", () => {
      state.coupon[key] = els[id].value.trim();
      render();
    });
  }
  els.pairAddButton.addEventListener("click", () => {
    if (state.pairs.length >= MAX_PAIRS) return;
    state.pairs.push({ label: "", value: "" });
    render();
    els.pairsArea.querySelector(".ticket-pair:last-child input")?.focus();
  });
  els.cardAddButton.addEventListener("click", addCard);
  els.cardRemoveButton.addEventListener("click", removeCard);
  // 隣のカードの端をタップすると、そのカードへ
  els.peekPrev.addEventListener("click", () => switchCard(current - 1));
  els.peekNext.addEventListener("click", () => switchCard(current + 1));
  // PC のトラックパッドなどの横スクロールでも前後へ（続けて動かないよう少し間を空ける）
  let wheelLock = 0;
  els.cardStage.addEventListener("wheel", (event) => {
    if (cards.length <= 1 || Math.abs(event.deltaX) < 25 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelLock = now + 500;
    switchCard(current + (event.deltaX > 0 ? 1 : -1));
  }, { passive: false });
  // カードを左右にスワイプすると前後のカードへ（LINE の横スクロールと同じ向き）
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

  const textFields = [
    ["headerInput", "headerTitle"],
    ["dateInput", "date"],
    ["titleInput", "title"],
    ["detailInput", "detail"],
    ["imageUrlInput", "imageUrl"],
    ["imageActionUrlInput", "imageActionUrl"]
  ];
  for (const [id, key] of textFields) {
    els[id].addEventListener("input", () => {
      state[key] = els[id].value.trim();
      if (key === "imageUrl") state.imageRatio = "";
      render();
    });
  }

  els.showDateToggle.addEventListener("change", () => {
    state.showDate = els.showDateToggle.checked;
    render();
  });
  els.showDetailToggle.addEventListener("change", () => {
    state.showDetail = els.showDetailToggle.checked;
    render();
  });

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.theme = input.value;
      render();
    });
  });
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

  // サブタイトル・詳細はプレビュー上の ＋ で出し、× で隠す（中身は残るので ＋ で戻せる）
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

  document.querySelectorAll('input[name="imageShape"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.imageShape = input.value;
      render();
    });
  });
  document.querySelectorAll('input[name="imageFit"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.imageFit = input.value;
      render();
    });
  });

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

  // プレビューの写真・バッジ・ボタンをタップしたら、その設定を開いてそこへ移動する
  els.heroArea.addEventListener("click", () => jumpToSection("photoSettings", els.imageUrlInput));
  els.badgeAddButton.addEventListener("click", () => {
    if (state.badges.length >= MAX_BADGES) return;
    state.badges.push("");
    render();
    els.badgeRow.querySelector(".bubble-badge:last-child .bubble-badge-text")?.focus();
  });
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


  els.addButtonButton.addEventListener("click", () => {
    if (state.buttons.length >= MAX_BUTTONS) return;
    state.buttons.push({ label: "", url: "" });
    renderButtonList();
    render();
    els.buttonList.querySelector(".button-row:last-child input")?.focus();
  });

  els.saveTemplateButton.addEventListener("click", saveTemplate);
  els.templateNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      saveTemplate();
    }
  });
  els.copyJsonButton.addEventListener("click", copyJson);

  const resetLabel = els.resetButton.textContent;
  let resetTimer = null;
  els.resetButton.addEventListener("click", () => {
    if (resetTimer === null) {
      els.resetButton.textContent = "もう一度タップでリセット";
      resetTimer = setTimeout(() => {
        els.resetButton.textContent = resetLabel;
        resetTimer = null;
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    els.resetButton.textContent = resetLabel;
    const showUndo = offerUndo("入力をリセットしました");
    hasTriedShare = false;
    state = structuredClone(BLANK_STATE);
    cards = [state];
    current = 0;
    queryUrls.clear();
    localStorageRemove(LAST_SENT_KEY);
    applyStateToEditor();
    render();
    setStatus("入力をリセットしました。");
    showUndo();
  });

  // カード上の1行入力は Enter で次の欄へ
  const chain = ["headerInput", "dateInput", "titleInput"];
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
