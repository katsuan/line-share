// 全ツール共通の LIFF の準備。ツールごとに違うのは「LINE の外で開いたときのログインのしかた」だけ。
//   login: "redirect" … LINE の外ではログイン画面へ移る（場所・予定）
//          "external" … liff.init の withLoginOnExternalBrowser に任せる（文字・手書き）
//          "none"     … ログインさせない。送るときに LINE アプリ内か確かめる（お知らせカード）
// 結果は { ready, reason } で返す。reason: "noLiffId" | "failed" | "redirecting"
(function () {
  const MESSAGES = {
    connecting: "LINEとつないでいます…",
    failed: "LINEとの接続に失敗しました。LINEアプリから開き直してください。",
    notInLine: "LINEアプリ内で開くと送れます。"
  };

  let pending = null;

  function init({ login = "none" } = {}) {
    if (pending) return pending;
    pending = (async () => {
      const liffId = window.LINE_SHARE_CONFIG?.liffId;
      if (!liffId || !window.liff) return { ready: false, reason: "noLiffId" };
      try {
        await liff.init(login === "external" ? { liffId, withLoginOnExternalBrowser: true } : { liffId });
        if (login === "redirect" && !liff.isLoggedIn()) {
          liff.login();
          return { ready: false, reason: "redirecting" };
        }
        window.LineShareCredit?.checkUser();
        return { ready: true };
      } catch (error) {
        console.error(error);
        return { ready: false, reason: "failed" };
      }
    })();
    return pending;
  }

  // shareTargetPicker が使えるか（初期化前・失敗時も例外にしない）
  function canShare() {
    try {
      return Boolean(window.liff) && liff.isApiAvailable("shareTargetPicker");
    } catch {
      return false;
    }
  }

  window.LineShareLiff = { init, canShare, MESSAGES };
})();
