// shared/plan.js（無料・有償のプランと、画像の保存先）のテスト。GAS・画像サーバー・LIFF は偽物。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "plan.js"), "utf8");

// plan.js を偽物の window で読む。answers は GAS に送った action ごとの答え（関数なら呼ぶ・Error なら投げる）
function load({ config = {}, token = "tok", answers = {}, server = { ok: true, imageUrl: "https://img.example/a.png" }, session = {} } = {}) {
  const calls = [];
  const events = [];
  const store = { ...session };
  const sessionStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  const document = {
    documentElement: { dataset: {} },
    dispatchEvent: (event) => events.push(event)
  };
  async function fetch(url, opts = {}) {
    const body = opts.body && opts.body[0] === "{" ? JSON.parse(opts.body) : null;
    calls.push({ url, body, opts });
    let answer;
    if (url === config.gasWebAppUrl) answer = answers[body.action];
    else if (String(url).endsWith("/api/upload")) answer = server;
    else answer = {};
    if (typeof answer === "function") answer = answer(body);
    if (answer instanceof Error) throw answer;
    return { ok: !(answer && answer.status >= 400), status: (answer && answer.status) || 200, json: async () => answer || {} };
  }
  const liff = { getAccessToken: () => token };
  const window = { LINE_SHARE_CONFIG: config, liff };
  const context = {
    window, document, sessionStorage, fetch, liff, URL, Date, JSON, Promise,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console: { warn() {}, error() {}, log() {} }
  };
  vm.runInNewContext(SOURCE, context);
  return { Plan: window.LineSharePlan, calls, events, store, document };
}

const GAS = "https://script.google.com/macros/s/x/exec";

test("はじめは無料プラン。<html data-plan> とイベントで知らせる", () => {
  const { Plan, events, document } = load();
  assert.strictEqual(document.documentElement.dataset.plan, "free");
  assert.strictEqual(events[0].type, "lineshare:plan");
  assert.deepStrictEqual({ ...events[0].detail.features }, { longImageStorage: false, hideCredit: false });
  assert.strictEqual(Plan.has("hideCredit"), false);
});

test("プランごとの機能は gas/Code.js の PLANS と同じ（片方だけ足さない）", () => {
  const { Plan } = load();
  const gas = fs.readFileSync(path.join(__dirname, "..", "..", "gas", "Code.js"), "utf8");
  const block = gas.match(/const PLANS = \{([\s\S]*?)\n\};/)[1];
  for (const [name, plan] of Object.entries(Plan.PLANS)) {
    const line = block.match(new RegExp(`${name}: \\{([^}]*)\\}`))[1];
    const theirs = Object.fromEntries(line.split(",").map((pair) => pair.split(":").map((s) => s.trim())).map(([k, v]) => [k, v === "true"]));
    assert.deepStrictEqual({ ...plan.features }, theirs, name);
  }
  assert.deepStrictEqual(Object.keys(Plan.FEATURE_LABELS).sort(), Object.keys(Plan.PLANS.free.features).sort());
});

test("GAS が有償と答えたら有償。同じ人なら、このタブでは聞きなおさない", async () => {
  const { Plan, calls, document } = load({ config: { gasWebAppUrl: GAS }, answers: { me: { ok: true, plan: "premium", expiresAt: "2027-01-01" } } });
  await Plan.checkUser("hashA");
  const got = await Plan.get();
  assert.strictEqual(got.plan, "premium");
  assert.strictEqual(got.source, "server");
  assert.strictEqual(got.expiresAt, "2027-01-01");
  assert.strictEqual(document.documentElement.dataset.plan, "premium");
  assert.strictEqual(Plan.has("longImageStorage"), true);
  assert.deepStrictEqual(calls[0].body, { action: "me", accessToken: "tok" });
  assert.strictEqual(calls[0].opts.headers["Content-Type"], "text/plain;charset=utf-8"); // 事前確認を起こさない

  await Plan.checkUser("hashA");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual((await Plan.get()).source, "server(cache)");

  await Plan.checkUser(Promise.resolve("hashB")); // ちがう人は聞きなおす（Promise でも渡せる）
  assert.strictEqual(calls.length, 2);
});

test("覚えたプランは10分まで。古いもの・知らないプランは使わない", async () => {
  const old = JSON.stringify({ plan: "premium", source: "server", userHash: "h", at: Date.now() - 11 * 60 * 1000 });
  const a = load({ config: { gasWebAppUrl: GAS }, answers: { me: { ok: true, plan: "free" } }, session: { "line-share:plan": old } });
  await a.Plan.checkUser("h");
  assert.strictEqual((await a.Plan.get()).plan, "free");
  assert.strictEqual(a.calls.length, 1);

  const odd = JSON.stringify({ plan: "gold", source: "server", userHash: "h", at: Date.now() });
  const b = load({ config: { gasWebAppUrl: GAS }, answers: { me: { ok: true, plan: "free" } }, session: { "line-share:plan": odd } });
  await b.Plan.checkUser("h");
  assert.strictEqual(b.calls.length, 1);
});

test("GAS に聞けないときは config.js の premiumUsers（覚えない）", async () => {
  const { Plan, store } = load({ config: { gasWebAppUrl: GAS, premiumUsers: ["hashP"] }, answers: { me: new Error("network") } });
  await Plan.checkUser("hashP");
  assert.strictEqual((await Plan.get()).plan, "premium");
  assert.strictEqual((await Plan.get()).source, "config");
  assert.strictEqual(store["line-share:plan"], undefined);

  await Plan.checkUser("other");
  assert.strictEqual((await Plan.get()).plan, "free");
});

test("GAS の答えが知らないプラン・ok でないときも予備（config.js）", async () => {
  const { Plan } = load({ config: { gasWebAppUrl: GAS }, answers: { me: { ok: true, plan: "gold" } } });
  await Plan.checkUser("h");
  assert.strictEqual((await Plan.get()).source, "config");
  const noToken = load({ config: { gasWebAppUrl: GAS }, token: "" });
  await noToken.Plan.checkUser("h");
  assert.strictEqual(noToken.calls.length, 0);
});

test("画像の保存：有償は GAS、だめなら画像サーバー。無料は画像サーバー", async () => {
  const config = { gasWebAppUrl: GAS, imageApiBaseUrl: "https://srv.example/" };
  const premium = load({ config, answers: { me: { ok: true, plan: "premium" }, upload: { ok: true, imageUrl: "https://drive.example/x" } } });
  await premium.Plan.checkUser("h");
  assert.strictEqual(await premium.Plan.upload("data:image/png;base64,AA"), "https://drive.example/x");
  assert.deepStrictEqual(premium.calls.at(-1).body, { action: "upload", imageData: "data:image/png;base64,AA", accessToken: "tok" });

  const fallback = load({ config, answers: { me: { ok: true, plan: "premium" }, upload: { ok: false, error: "full" } } });
  await fallback.Plan.checkUser("h");
  assert.strictEqual(await fallback.Plan.upload("data:x"), "https://img.example/a.png");
  assert.strictEqual(fallback.calls.at(-1).url, "https://srv.example/api/upload"); // 最後の / は1つにまとめる

  const free = load({ config, answers: { me: { ok: true, plan: "free" } } });
  await free.Plan.checkUser("h");
  await free.Plan.upload("data:x");
  assert.deepStrictEqual(free.calls.map((c) => c.body && c.body.action), ["me", undefined]);
});

test("画像サーバーが https の URL を返さなければ失敗にする。保存先がなければ知らせる", async () => {
  const bad = load({ config: { imageApiBaseUrl: "https://srv.example" }, server: { ok: true, imageUrl: "http://plain.example/a.png" } });
  await assert.rejects(bad.Plan.upload("data:x"), /アップロードに失敗/);
  const none = load();
  await assert.rejects(none.Plan.upload("data:x"), /imageApiBaseUrl/);
});

test("支払いページには、だれの支払いかのハッシュを付ける。わからないときは空", async () => {
  const { Plan } = load({ config: { premiumCheckoutUrl: "https://buy.stripe.com/test_x?a=1" } });
  assert.strictEqual(Plan.checkoutUrl(), "");
  await Plan.checkUser("abc");
  assert.strictEqual(Plan.checkoutUrl(), "https://buy.stripe.com/test_x?a=1&client_reference_id=abc");
});

test("画像サーバーを起こすのは同じタブで5分に1回まで", () => {
  const { Plan, calls } = load({ config: { imageApiBaseUrl: "https://srv.example/" } });
  Plan.warmUp();
  Plan.warmUp();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://srv.example/health");
});
