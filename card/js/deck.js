// お知らせカード：複数枚（カルーセル）のタブ・切り替え・左右のチラ見せ

// ---- 複数枚（カルーセル） ----

// state を差し替えたあと（テンプレートなど）に、並びの中身も合わせる
function storeCurrent() {
  cards[current] = state;
}

// card を一時的に編集中のカードとして fn を呼ぶ（検証や送るカードの組み立てを、どのカードにも使えるように）
function withCard(card, fn) {
  const editing = state;
  state = card;
  try {
    return fn();
  } finally {
    state = editing;
  }
}

function switchCard(index) {
  storeCurrent();
  if (index < 0 || index >= cards.length || index === current) {
    renderCardTabs();
    return;
  }
  current = index;
  state = cards[current];
  applyStateToEditor();
  render();
  requestAnimationFrame(() => {
    autoGrowAll();
    renderPeeks();
  });
}

// 新しいカードは今のカードの色・大きさ・見出しを引き継いで、すぐうしろに足す
function addCard() {
  if (cards.length >= MAX_CARDS) return;
  storeCurrent();
  const next = hydrate({
    theme: state.theme,
    customColor: state.customColor,
    bubbleSize: state.bubbleSize,
    headerTitle: state.headerTitle,
    date: state.date,
    showDate: state.showDate,
    showDetail: false
  });
  cards.splice(current + 1, 0, next);
  switchCard(current + 1);
  // 隣のカードを作り直したあと（switchCard の中の次のフレーム）で入力に移る
  requestAnimationFrame(() => els.titleInput.focus());
  setStatus(`カード${current + 1}を足しました。`);
}

function removeCard() {
  if (cards.length <= 1) return;
  // 聞かずに消して、「元に戻す」を出す
  const at = current;
  const [removed] = cards.splice(current, 1);
  current = Math.min(current, cards.length - 1);
  state = cards[current];
  applyStateToEditor();
  render();
  renderPeeks();
  setStatus("");
  window.LineShareUI?.toast(`カード${at + 1}を消しました`, {
    actionLabel: "元に戻す",
    onAction: () => {
      cards.splice(at, 0, removed);
      switchCard(at);
    }
  });
}

// 隣のカード（左右に端だけ見せる）の絵を作る。編集中のカードの画面を一時的にそのカードにして写し取り、元に戻す。
// 切り替え・足す・消す・大きさを変えたときだけ作り直す（入力中は作り直さない）
function snapshotCard(index) {
  const editing = state;
  state = cards[index];
  applyStateToEditor();
  render();
  const clone = els.bubble.cloneNode(true);
  // 入力欄の中身は写し取られないので、文字として入れ直す
  const sources = els.bubble.querySelectorAll("input, textarea");
  clone.querySelectorAll("input, textarea").forEach((field, i) => {
    field.setAttribute("value", sources[i]?.value ?? "");
    if (field.tagName === "TEXTAREA") field.textContent = sources[i]?.value ?? "";
    field.style.height = sources[i]?.style.height || "";
    field.tabIndex = -1;
  });
  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  clone.removeAttribute("id");
  clone.querySelectorAll("button, [tabindex]").forEach((element) => element.setAttribute("tabindex", "-1"));
  state = editing;
  return clone;
}

function renderPeeks() {
  const multiple = cards.length > 1;
  els.cardStage.classList.toggle("has-peek", multiple);
  // 入力中（キーボードが開いて画面の大きさが変わったときなど）は作り直さず、幅だけ合わせる
  const typing = document.activeElement && document.activeElement !== document.body && els.cardStage.contains(document.activeElement);
  if (typing) {
    const width = `${els.bubble.getBoundingClientRect().width}px`;
    els.peekPrev.style.width = els.peekNext.style.width = width;
    return;
  }
  const neighbors = [
    [els.peekPrev, current - 1],
    [els.peekNext, current + 1]
  ];
  const snapshots = neighbors.map(([, index]) => (multiple && index >= 0 && index < cards.length ? snapshotCard(index) : null));
  // 写し取りのあとで、編集中のカードの画面に戻す
  if (snapshots.some(Boolean)) {
    applyStateToEditor();
    render();
  }
  const width = `${els.bubble.getBoundingClientRect().width}px`;
  neighbors.forEach(([peek], i) => {
    peek.hidden = !snapshots[i];
    peek.replaceChildren(...(snapshots[i] ? [snapshots[i]] : []));
    peek.style.width = width;
  });
}

function renderCardTabs() {
  els.cardTabs.replaceChildren(
    ...cards.map((card, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "card-tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(index === current));
      tab.setAttribute("aria-label", `カード${index + 1}${card.headerTitle ? `「${card.headerTitle}」` : ""}`);
      tab.textContent = String(index + 1);
      tab.addEventListener("click", () => switchCard(index));
      return tab;
    })
  );
  els.cardAddButton.hidden = cards.length >= MAX_CARDS;
  els.cardRemoveButton.hidden = cards.length <= 1;
}
