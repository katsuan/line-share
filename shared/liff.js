// 全ツール共通の LIFF の準備。ツールごとに違うのは「LINE の外で開いたときのログインのしかた」だけ。
//   login: "redirect" … LINE の外ではログイン画面へ移る（場所・予定）
//          "external" … LINE の外ではログイン画面へ移る（文字・手書き。redirect と同じ動き）
//          "none"     … ログインさせない。送るときに LINE アプリ内か確かめる（お知らせカード）
// 結果は { ready, reason } で返す。reason: "noLiffId" | "failed" | "redirecting" | "timeout"
// 10秒たっても終わらないときは timeout で返す（画面が「つないでいます…」のまま止まらないように）
(function () {
  const MESSAGES = {
    connecting: "LINEとつないでいます…",
    failed: "LINEとの接続に失敗しました。LINEアプリから開き直してください。",
    timeout: "LINEとつながりませんでした。電波のよい所で開き直してください（作成・プレビューはできます）。",
    notInLine: "LINEアプリ内で開くと送れます。"
  };

  let pending = null;
  const TIMEOUT_MS = 10000;

  function init({ login = "none" } = {}) {
    if (pending) return pending;
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ ready: false, reason: "timeout" }), TIMEOUT_MS));
    pending = Promise.race([start(login), timeout]);
    return pending;
  }

  function start(login) {
    return (async () => {
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
        checkUser();
        return { ready: true };
      } catch (error) {
        console.error(error);
        return { ready: false, reason: "failed" };
      }
    })();
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ログイン中のユーザーのハッシュで、プラン（plan.js）と Created by の表示（credit.js）を決める。
  // プランが決まるまでの間に画像を保存しようとしても、plan.js の upload が待つ
  function checkUser() {
    if (!liff.isLoggedIn()) return;
    const hash = liff.getProfile().then(({ userId }) => sha256(userId));
    window.LineSharePlan?.checkUser(hash);
    hash.then((value) => window.LineShareCredit?.checkUser(value)).catch((error) => console.error(error));
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

  /**
   * 送り先を選んで送る（全ツール共通）。送れたら true、閉じられたら false を返す。
   * Created by は各ツールがメッセージを作るときに付ける（カルーセルなど付け方がツールで違うため）。
   * 送ったあとのシート（LineShareUI.afterSent）の「続けて別のトークにも送る」からも、同じ messages で呼ぶ
   */
  async function share(messages) {
    if (!canShare()) throw new Error(MESSAGES.notInLine);
    const result = await liff.shareTargetPicker(messages, { isMultiple: true });
    return Boolean(result) && (!result.status || result.status === "success");
  }

  window.LineShareLiff = { init, canShare, share, MESSAGES };
})();
