// 全ツール共通の LIFF の準備・送る・URL の片づけ（window.LineShareLiff）。おくるんの各ページと、ほかの Q のツールが読む。
// ツールごとに違うのは「LINE の外で開いたときのログインのしかた」だけ。
//   login: "redirect" … LINE の外ではログイン画面へ移る（場所・予定）
//          "external" … LINE の外ではログイン画面へ移る（文字・手書き。redirect と同じ動き）
//          "none"     … ログインさせない。送るときに LINE アプリ内か確かめる（お知らせカード）
// 結果は { ready, reason } で返す。reason: "noLiffId" | "failed" | "redirecting" | "timeout"
// 10秒たっても終わらないときは timeout で返す（画面が「つないでいます…」のまま止まらないように）
(function () {
  const MESSAGES = {
    connecting: "つないでいます…",
    failed: "つながりませんでした。LINE で開きなおすと送れます。",
    timeout: "つながりませんでした。電波のよい所で開き直してください（作成・プレビューはできます）。",
    // 送った結果（全ツールでそろえる）
    sent: "送りました。",
    canceled: "送るのをやめました。",
    sendFailed: "送れませんでした。時間をおいてもう一度お試しください。",
    notInLine: "LINE 版で開くと送れます。"
  };

  let pending = null;
  let userHash = null; // ログイン中のユーザーIDの SHA-256（Promise）。作成者かどうかを見るのに使う
  const TIMEOUT_MS = 10000;

  // LIFF を1回だけ用意する。{ ready, reason } を返す（10秒で終わらなければ timeout）
  function init({ login = "none" } = {}) {
    if (pending) return pending;
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ ready: false, reason: "timeout" }), TIMEOUT_MS));
    pending = Promise.race([start(login), timeout]);
    return pending;
  }

  // liff.init を呼び、ログインが要る開き方ならログインへ移る
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

  // 文字の SHA-256（16進）
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
    userHash = hash;
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
   * 送ったあとのシート（LineShareUI.afterSent）の「続けて別のトークにも送る」からも、同じ messages で呼ぶ。
   * 送り先選びが開いている間にもう一度呼ばれたら（二重押し）、2つ目は開かずに同じ結果を返す
   */
  let picking = null;
  // 送り先を選んで送る。送れたら true、閉じられたら false
  function share(messages) {
    if (picking) return picking;
    picking = (async () => {
      if (!canShare()) throw new Error(MESSAGES.notInLine);
      const result = await liff.shareTargetPicker(messages, { isMultiple: true });
      return Boolean(result) && (!result.status || result.status === "success");
    })().finally(() => {
      picking = null;
    });
    return picking;
  }

  // 作成者（config.js の ownerUsers）か。ログインしていないとき・確かめられないときは false
  async function isOwner() {
    const owners = window.LINE_SHARE_CONFIG?.ownerUsers;
    if (!userHash || !Array.isArray(owners) || !owners.length) return false;
    try {
      return owners.includes(await userHash);
    } catch {
      return false;
    }
  }

  // このブラウザのまま LINE でログインし、今のページに戻る
  function login() {
    try {
      liff.login({ redirectUri: returnUrl() });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  // ---- LINE の外で開いたとき（送り先選びが使えないとき）の案内 ----
  // ブラウザで開いたときは「このブラウザのまま LINE でログインする」か「LINE アプリで開き直す」のどちらかで送れるようにする。
  // （キロっくと同じ考え方。LINE アプリの中で送れないときはログインでは直らないので、案内は出さない）

  // LINE 版で開いているか・ログインしているか（LIFF の準備の前でも例外にしない）
  function environment() {
    try {
      return { inClient: Boolean(window.liff?.isInClient?.()), loggedIn: Boolean(window.liff?.isLoggedIn?.()) };
    } catch {
      return { inClient: false, loggedIn: false };
    }
  }

  // 読み終えたクエリ（ほかのツールから渡された中身）を URL から消す。長い URL がアドレス欄・タブ・履歴に残らないように。
  // LIFF とログインの戻りに使う印（liff.〜・code・state など）と keep に入れたものは残す。# のあとは触らない
  const LIFF_KEYS = /^(liff|code$|state$|error|friendship_status_changed$)/i;
  // 読み終えたクエリを URL から消す（keep に入れた名前と、LIFF・ログインの戻りの印は残す）
  function tidyUrl(keep = []) {
    try {
      const url = new URL(location.href);
      [...new Set(url.searchParams.keys())].forEach((key) => {
        if (!keep.includes(key) && !LIFF_KEYS.test(key)) url.searchParams.delete(key);
      });
      if (url.search !== location.search) history.replaceState(history.state, "", url);
    } catch {
      // 書きかえられなくても、ページはそのまま使える
    }
  }

  // LINE 版で開くリンク。path はサイトのトップからの道筋（例 "/card/?deck=…"）
  function appUrl(path = "") {
    const liffId = window.LINE_SHARE_CONFIG?.liffId;
    return liffId ? `https://liff.line.me/${liffId}${path}` : "";
  }

  /**
   * 送るボタンの上などに案内を出す。
   *   host        案内を入れる要素
   *   appUrl()    LINE 版で開く URL（押した瞬間の中身で作る）
   *   loginUrl()  ログインのあとに戻る URL（省略時は今のページ）
   *   beforeLogin() ログインの行き来の前に、入力中の中身を残す
   *   canLogin    LIFF の準備ができたときだけ true（準備できないとログインも始められない）
   * LINE アプリの中で開いているときは何も出さず false を返す
   */
  function outsideHelp(host, { appUrl: getAppUrl, loginUrl, beforeLogin, canLogin = true } = {}) {
    const env = environment();
    if (!host || env.inClient) return false;
    host.className = "ls-outside";
    host.hidden = false;
    host.innerHTML =
      '<p class="ls-outside-text">ブラウザ版です。送るには：</p>' +
      '<div class="ls-outside-actions">' +
      '<button type="button" class="ls-outside-button" data-outside-login>🔑 ログインして送る</button>' +
      '<a class="ls-outside-button is-app" data-outside-app href="#">📱 LINE 版で開く</a>' +
      "</div>";
    const loginButton = host.querySelector("[data-outside-login]");
    const appLink = host.querySelector("[data-outside-app]");
    loginButton.hidden = !canLogin || env.loggedIn;
    if (loginButton.hidden) host.querySelector(".ls-outside-text").textContent = "ブラウザ版では見本だけ。送るときは：";
    loginButton.addEventListener("click", () => {
      beforeLogin?.();
      try {
        liff.login({ redirectUri: loginUrl ? loginUrl() : returnUrl() });
      } catch (error) {
        console.error(error);
      }
    });
    appLink.href = getAppUrl?.() || appUrl();
    appLink.addEventListener("click", (event) => {
      // 押した瞬間の中身で作り直す（開いたあとに入力した分も持っていく）
      const url = getAppUrl?.() || appUrl();
      if (!url) return;
      event.preventDefault();
      location.href = url;
    });
    return true;
  }

  window.LineShareLiff = { init, canShare, share, environment, appUrl, outsideHelp, isOwner, login, tidyUrl, MESSAGES };
})();
