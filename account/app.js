// プラン（/account/）の入口（account/index.html が読む）：自分のプランと、プランごとに使える機能を見せる。有償プランへは Stripe の支払いリンクで進む。
// プランの判定と機能の表は shared/plan.js（正本は GAS）。ここは表示だけ。
const config = window.LINE_SHARE_CONFIG || {};

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const Plan = window.LineSharePlan;
  renderTable(Plan, "");

  // このページでは、覚えておいたプランを使わずに聞き直す（支払いのすぐあとに開き直したとき、古いプランを出さない）
  try {
    sessionStorage.removeItem("line-share:plan");
  } catch {
    // 覚えていなければそのまま
  }
  // プランは LINE のログインで決まるので、LINE の外ではログインしてもらう
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ready: false, reason: "timeout" }), 8000));
  const { ready, reason } = await Promise.race([window.LineShareLiff.init({ login: "redirect" }), timeout]);
  if (!ready) {
    if (reason === "redirecting") return;
    $("planName").textContent = "確かめられませんでした";
    $("planNote").textContent = "LINE 版で開きなおすと、プランを確かめられます。";
    // 案内のとおりに押せるよう、LINE 版で開くボタンを出す（LIFF ID がないときは出さない）
    const lineUrl = window.LineShareLiff.appUrl("/account/");
    if (lineUrl) {
      $("lineOpenButton").href = lineUrl;
      $("lineOpenButton").hidden = false;
    }
    return;
  }

  const plan = await Plan.get();
  $("planName").textContent = plan.label;
  $("planSub").textContent = plan.plan === "premium" && plan.expiresAt ? `${formatDate(plan.expiresAt)} まで` : "";
  renderTable(Plan, plan.plan);

  if (plan.plan === "premium") {
    $("planNote").textContent = "有償プランをご利用いただき、ありがとうございます。";
    if (config.billingPortalUrl) {
      $("portalButton").href = config.billingPortalUrl;
      $("portalButton").hidden = false;
    }
    return;
  }
  const checkout = Plan.checkoutUrl();
  if (checkout) {
    $("upgradeButton").href = checkout;
    $("upgradeButton").hidden = false;
    $("planNote").textContent = "お支払いが済むと、数分以内にこの画面のプランが切り替わります（切り替わらないときは開き直してください）。";
  } else {
    $("planNote").textContent = "有償プランは準備中です。";
  }
});

// 機能の表を描く（current のプランで使えるものに印）
function renderTable(Plan, current) {
  const rows = Object.entries(Plan.FEATURE_LABELS).map(([key, label]) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = label;
    tr.append(name);
    for (const plan of ["free", "premium"]) {
      const cell = document.createElement("td");
      cell.textContent = Plan.PLANS[plan].features[key] ? "✓" : "—";
      cell.classList.toggle("is-current", plan === current);
      tr.append(cell);
    }
    return tr;
  });
  document.getElementById("featureRows").replaceChildren(...rows);
  document.querySelectorAll("[data-col]").forEach((th) => th.classList.toggle("is-current", th.dataset.col === current));
}

// 日付を "2026/10/25" の形にする（読めなければそのまま）
function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? value : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
