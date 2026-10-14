// プラン（無料・有償）と、プランごとに使える機能を1か所で決める。各ページは「この機能を使えるか」（has）で判定する。
//
// プランの決め方（上から順に）
//   1. GAS（gas/）に聞く … LIFF のアクセストークンで本人を確かめ、プランの一覧（シート・Script Properties）で判定した結果。正本
//   2. config.js の premiumUsers … GAS が答えられないとき（未設定・古い版）の予備。ページ側の判定なので、保存などの
//      実際の権限は GAS が改めて確かめる
//   結果はそのタブに少しの間だけ覚え、ページを移るたびに GAS へ聞き直さない
//
// 役割の分け方
//   システム管理者 … GAS のデプロイ・Script Properties（Stripe の鍵など）
//   ツール管理者   … プランの一覧（シート）で、誰をどのプランにするか・いつまでか
//   ユーザー       … 自分のプランを見る（/account/）・支払う（Stripe）
//
// ページへの反映: <html data-plan="free|premium">（data-plan-only の案内が切り替わる）と、
// document に "lineshare:plan" イベント（detail: { plan, features }）を出す（credit.js などが受け取る）。
(function () {
  const config = window.LINE_SHARE_CONFIG || {};

  // プランごとに使える機能。機能を足すときはここと gas/Code.js の PLANS をそろえる
  const PLANS = {
    free: {
      label: "無料プラン",
      features: { longImageStorage: false, hideCredit: false }
    },
    premium: {
      label: "有償プラン",
      features: { longImageStorage: true, hideCredit: true }
    }
  };
  // /account/ に出す機能の説明（並び順もこのとおり）
  const FEATURE_LABELS = {
    longImageStorage: "画像を長く保存（相手が後で開いても消えない）",
    hideCredit: "送るカードの「Created by おくるん」を消せる"
  };

  const CACHE_KEY = "line-share:plan";
  const CACHE_MS = 10 * 60 * 1000;

  let current = { plan: "free", source: "none", userHash: "", expiresAt: "" };
  let checking = Promise.resolve();

  function applyToPage() {
    document.documentElement.dataset.plan = current.plan;
    document.dispatchEvent(new CustomEvent("lineshare:plan", { detail: { plan: current.plan, features: features() } }));
  }

  function features() {
    return { ...(PLANS[current.plan] || PLANS.free).features };
  }

  function readCache(userHash) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.userHash === userHash && Date.now() - cached.at < CACHE_MS && PLANS[cached.plan]) return cached;
    } catch {
      // 読めなければ聞き直す
    }
    return null;
  }

  function writeCache(value) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...value, at: Date.now() }));
    } catch {
      // 覚えられなくても、次に聞き直すだけ
    }
  }

  // GAS にプランを聞く。古い GAS（action を知らない）や通信の失敗のときは null
  async function askServer() {
    if (!config.gasWebAppUrl || !window.liff?.getAccessToken?.()) return null;
    try {
      const data = await postGas({ action: "me", accessToken: liff.getAccessToken() });
      return data.ok && PLANS[data.plan] ? { plan: data.plan, expiresAt: data.expiresAt || "" } : null;
    } catch (error) {
      console.warn("plan: GAS に聞けませんでした", error);
      return null;
    }
  }

  function fromConfig(userHash) {
    const list = Array.isArray(config.premiumUsers) ? config.premiumUsers : [];
    return { plan: userHash && list.includes(userHash) ? "premium" : "free", expiresAt: "" };
  }

  /** LIFF の初期化後に、ログイン中のユーザーのハッシュ（か、そのハッシュになる Promise）を渡して呼ぶ（shared/liff.js が呼ぶ） */
  function checkUser(userHashOrPromise) {
    checking = (async () => {
      const userHash = await userHashOrPromise;
      const cached = readCache(userHash);
      if (cached) {
        current = { ...cached, source: `${cached.source}(cache)` };
      } else {
        const server = await askServer();
        current = server ? { ...server, source: "server", userHash } : { ...fromConfig(userHash), source: "config", userHash };
        if (server) writeCache(current);
      }
      applyToPage();
    })().catch((error) => console.error(error));
    return checking;
  }

  function has(feature) {
    return Boolean(features()[feature]);
  }

  /** いまのプラン（決まるまで待つ）。{ plan, label, features, source, userHash, expiresAt } */
  async function get() {
    await checking;
    return { ...current, label: (PLANS[current.plan] || PLANS.free).label, features: features() };
  }

  // GAS は OPTIONS に答えられないので、text/plain で送って事前確認（プリフライト）を起こさない
  async function postGas(body) {
    const response = await fetch(config.gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GAS（${response.status}）`);
    return data;
  }

  async function uploadToServer(dataUrl) {
    const base = String(config.imageApiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("画像のアップロード先（config.js の imageApiBaseUrl）が未設定です。");
    const response = await fetch(`${base}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: dataUrl })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !/^https:\/\//.test(data.imageUrl || "")) {
      console.error("upload failed", response.status, data);
      throw new Error("画像のアップロードに失敗しました。");
    }
    return data.imageUrl;
  }

  async function uploadToGas(dataUrl) {
    const data = await postGas({ action: "upload", imageData: dataUrl, accessToken: liff.getAccessToken() });
    if (!data.ok || !/^https:\/\//.test(data.imageUrl || "")) throw new Error(data.error || "GAS への保存に失敗しました");
    return data.imageUrl;
  }

  /** PNG / JPEG の data URL を保存して、公開 URL を返す。長く保存できるプランは GAS（失敗したら画像サーバー） */
  async function upload(dataUrl) {
    await checking;
    if (has("longImageStorage") && config.gasWebAppUrl) {
      try {
        return await uploadToGas(dataUrl);
      } catch (error) {
        console.error(error);
      }
    }
    return uploadToServer(dataUrl);
  }

  /** 有償プランの支払いページ（Stripe の支払いリンク）。だれの支払いかわかるよう、ユーザーのハッシュを付ける */
  function checkoutUrl() {
    if (!config.premiumCheckoutUrl || !current.userHash) return "";
    const url = new URL(config.premiumCheckoutUrl);
    url.searchParams.set("client_reference_id", current.userHash);
    return url.toString();
  }

  applyToPage();
  window.LineSharePlan = { PLANS, FEATURE_LABELS, checkUser, has, get, upload, checkoutUrl };
})();
