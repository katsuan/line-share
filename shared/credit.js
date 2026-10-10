// 送るカード（Flex）の末尾に「Created by」を付け、タップでこの LIFF のツール一覧を開く。
// 受け取った人が「どうやって作ったんだろう？」と思ったときに辿れるようにする。
(function () {
  const LABEL = "Created by LINEで送る ›";

  function topUrl() {
    const liffId = window.LINE_SHARE_CONFIG && window.LINE_SHARE_CONFIG.liffId;
    return liffId ? `https://liff.line.me/${liffId}` : "https://katsuan.github.io/line-share/";
  }

  function creditBox() {
    return {
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        {
          type: "text",
          text: LABEL,
          size: "xxs",
          color: "#9AA0A6",
          align: "center",
          action: { type: "uri", label: "LINEで送る", uri: topUrl() }
        }
      ]
    };
  }

  // Flex のバブルにだけ付ける（画像メッセージはリンクを持てないのでそのまま）
  function withCredit(message) {
    if (!message || message.type !== "flex" || message.contents?.type !== "bubble") {
      return message;
    }
    const bubble = message.contents;
    const footer = bubble.footer
      ? { ...bubble.footer, contents: [...bubble.footer.contents, creditBox()] }
      : { type: "box", layout: "vertical", paddingAll: "8px", contents: [creditBox()] };
    return { ...message, contents: { ...bubble, footer } };
  }

  window.LineShareCredit = { LABEL, topUrl, withCredit };
})();
