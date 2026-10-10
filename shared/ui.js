// 全ツール共通の画面の振る舞い
(function () {
  // 文字入力中は下部の送信バーを隠し、スマホのキーボードと重ならないようにする
  const TEXT_FIELD =
    "input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=button]), textarea, [contenteditable=true]";

  document.addEventListener("focusin", (event) => {
    if (event.target.matches?.(TEXT_FIELD)) {
      document.body.classList.add("is-typing");
    }
  });
  document.addEventListener("focusout", () => {
    document.body.classList.remove("is-typing");
  });

  /**
   * 設定の場所を開いてそこへ移動し、入力欄に移る。
   * focusTargets は候補を順に並べ、画面に出ている最初のものに移る（検索欄がないときは場所名へ、など）。
   */
  function jumpTo(target, ...focusTargets) {
    const section = typeof target === "string" ? document.getElementById(target) : target;
    if (!section) return;
    if (section.tagName === "DETAILS") section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusTarget = focusTargets
      .map((item) => (typeof item === "string" ? document.getElementById(item) : item))
      .find((element) => element && element.getClientRects().length > 0);
    // スクロールが終わってから入力欄に移る（先にフォーカスするとスマホでは位置がずれる）
    setTimeout(() => {
      // なめらかなスクロールが効かない環境では、すぐにその位置へ移す
      const top = section.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) section.scrollIntoView({ block: "start" });
      focusTarget?.focus({ preventScroll: true });
    }, 400);
  }

  // プレビューの中で data-jump を付けた部分をタップすると、その設定へ移る
  // data-jump="<設定の id>" data-jump-focus="<入力欄の id（空白区切りで候補）>"
  function handleJump(event) {
    const item = event.target.closest?.("[data-jump]");
    if (!item) return false;
    event.preventDefault();
    jumpTo(item.dataset.jump, ...(item.dataset.jumpFocus || "").split(/\s+/).filter(Boolean));
    return true;
  }
  document.addEventListener("click", handleJump);
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-jump]")) handleJump(event);
  });

  window.LineShareUI = { jumpTo };
})();
