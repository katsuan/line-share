// 送るカード（Flex）の末尾に「Created by」を付け、タップでこの LIFF のツール一覧を開く。
// 受け取った人が「どうやって作ったんだろう？」と思ったときに辿れるようにする。
(function () {
  const LABEL = "Created by おくるカード ›";

  // 「Created by」を出すかどうか。config.js の showCredit: false で消せる。
  // 将来、有償プランで消す場合は、購入状態を確認できたときに setEnabled(false) を呼ぶ。
  let enabled = !(window.LINE_SHARE_CONFIG && window.LINE_SHARE_CONFIG.showCredit === false);

  function applyToPage() {
    document.documentElement.dataset.credit = enabled ? "on" : "off";
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    applyToPage();
  }

  function isEnabled() {
    return enabled;
  }

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
          action: { type: "uri", label: "おくるカード", uri: topUrl() }
        }
      ]
    };
  }

  // Flex のバブルにだけ付ける（画像メッセージはリンクを持てないのでそのまま）
  function withCredit(message) {
    if (!enabled || !message || message.type !== "flex" || message.contents?.type !== "bubble") {
      return message;
    }
    const bubble = message.contents;
    const footer = bubble.footer
      ? { ...bubble.footer, contents: [...bubble.footer.contents, creditBox()] }
      : { type: "box", layout: "vertical", paddingAll: "8px", contents: [creditBox()] };
    return { ...message, contents: { ...bubble, footer } };
  }

  applyToPage();
  window.LineShareCredit = { LABEL, topUrl, withCredit, enabled: isEnabled, setEnabled };
})();
