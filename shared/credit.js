// 送るカード（Flex）の末尾に「Created by」を付け、タップでこの LIFF のツール一覧を開く。
// 受け取った人が「どうやって作ったんだろう？」と思ったときに辿れるようにする。
//
// 消し方（自分用）
//   1. URL に ?credit=off を付けて一度開く → その端末では以後消える（?credit=on で戻る）
//   2. config.js の creditFreeUsers に自分の LINE ユーザーIDのハッシュを入れる → LINE でログインすると自動で消える
//      ハッシュは ?credit=whoami を付けて LINE で開くと表示される
// どちらもページ側の判定なので、有償プランで消すときはサーバーで購入状態を確かめてから setEnabled(false) を呼ぶ。
(function () {
  const LABEL = "Created by おくるカード ›";
  const STORAGE_KEY = "line-share:credit";
  const config = window.LINE_SHARE_CONFIG || {};
  const param = new URLSearchParams(location.search).get("credit");

  // ?credit=off / on をこの端末に覚えておく
  if (param === "off" || param === "on") {
    try {
      if (param === "off") localStorage.setItem(STORAGE_KEY, "off");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 保存できない環境ではこのページを開いている間だけ反映する
    }
  }

  let enabled = config.showCredit !== false && param !== "off" && readStored() !== "off";

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

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

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * LIFF の初期化後に呼ぶ。ログイン中の LINE ユーザーが creditFreeUsers に入っていれば消す。
   * ?credit=whoami のときは、config.js に書くためのハッシュを表示する。
   */
  async function checkUser() {
    try {
      if (!window.liff || !liff.isLoggedIn()) return;
      const { userId } = await liff.getProfile();
      const hash = await sha256(userId);

      if (param === "whoami") {
        window.prompt(
          "あなたのハッシュです。config.js の creditFreeUsers に追加すると、LINEでログインしたときに Created by が消えます。",
          hash
        );
      }

      const allowList = Array.isArray(config.creditFreeUsers) ? config.creditFreeUsers : [];
      if (allowList.includes(hash)) setEnabled(false);
    } catch (error) {
      console.error(error);
    }
  }

  function topUrl() {
    return config.liffId ? `https://liff.line.me/${config.liffId}` : "https://katsuan.github.io/line-share/";
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
  window.LineShareCredit = { LABEL, topUrl, withCredit, enabled: isEnabled, setEnabled, checkUser };
})();
