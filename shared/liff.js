// 全ツール共通の LIFF の準備。ツールごとに違うのは「LINE の外で開いたときのログインのしかた」だけ。
//   login: "redirect" … LINE の外ではログイン画面へ移る（場所・予定）
//          "external" … LINE の外ではログイン画面へ移る（文字・手書き。redirect と同じ動き）
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
        await liff.init({ liffId });
        if ((login === "redirect" || login === "external") && !liff.isLoggedIn()) {
          // ログイン後は今のページに戻す。指定しないと LIFF の入口（HOME）に戻り、
          // HOME ではログインが終わらないので、ツールを開くたびにログインを求めてループする
          liff.login({ redirectUri: returnUrl() });
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

  // ログイン後に戻る URL。ログインの受け渡しで付く一時的なパラメータは外す
  function returnUrl() {
    const url = new URL(location.href);
    for (const key of ["code", "state", "liffClientId", "liffRedirectUri", "error", "error_description", "friendship_status_changed"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
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
