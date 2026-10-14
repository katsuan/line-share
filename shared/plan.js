// 画像のアップロード先をプランで分ける。
//   無料: 画像サーバー（Render）。スリープで消えるので、相手が開くのが遅いと表示されないことがある
//   有償: GAS 経由で Google ドライブに保存し、長く残す（gas/ を参照）
//
// 有償かどうかは config.js の premiumUsers（LINE ユーザーIDの SHA-256）で決める。これは送り先を選ぶためだけで、
// 本当に保存してよいかは GAS がアクセストークンで本人を確かめ、Script Properties の一覧で判定する。
// 有償の人のページには <html data-plan="premium"> が付き、data-plan-only の案内が切り替わる。
(function () {
  const config = window.LINE_SHARE_CONFIG || {};
  let premium = false;
  let checking = Promise.resolve();

  function applyToPage() {
    document.documentElement.dataset.plan = premium ? "premium" : "free";
  }

  /** LIFF の初期化後に、ログイン中のユーザーのハッシュを渡して呼ぶ */
  function checkUser(userHash) {
    const list = Array.isArray(config.premiumUsers) ? config.premiumUsers : [];
    premium = Boolean(config.gasWebAppUrl && userHash && list.includes(userHash));
    applyToPage();
  }

  function setChecking(promise) {
    checking = promise.catch(() => {});
  }

  function isPremium() {
    return premium;
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

  // GAS は OPTIONS に答えられないので、text/plain で送って事前確認（プリフライト）を起こさない
  async function uploadToGas(dataUrl) {
    const response = await fetch(config.gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ imageData: dataUrl, accessToken: liff.getAccessToken() }),
      redirect: "follow"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !/^https:\/\//.test(data.imageUrl || "")) {
      throw new Error(data.error || `GAS への保存に失敗しました（${response.status}）`);
    }
    return data.imageUrl;
  }

  /** PNG / JPEG の data URL を保存して、公開 URL を返す。有償で GAS に失敗したときは画像サーバーに保存する */
  async function upload(dataUrl) {
    await checking;
    if (premium) {
      try {
        return await uploadToGas(dataUrl);
      } catch (error) {
        console.error(error);
      }
    }
    return uploadToServer(dataUrl);
  }

  applyToPage();
  window.LineSharePlan = { checkUser, setChecking, isPremium, upload };
})();
