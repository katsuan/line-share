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
})();
