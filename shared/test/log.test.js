// shared/log.js（利用状況とエラーの記録）のテスト。送る先（GAS）は偽物。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "log.js"), "utf8");
const GAS = "https://script.google.com/macros/s/x/exec";

// log.js を偽物のページで読む。sent は送った events の中身（まとめて送った回ごと）
function load({ url = "https://katsuan.github.io/line-share/card/", config = { gasWebAppUrl: GAS }, referrer = "", session = {}, inClient = false } = {}) {
  const sent = [];
  const listeners = {};
  const store = { ...session };
  const loc = new URL(url);
  const on = (target) => (type, fn) => { (listeners[`${target}:${type}`] ||= []).push(fn); };
  const document = { referrer, visibilityState: "visible", addEventListener: on("document") };
  const window = { LINE_SHARE_CONFIG: config, liff: { isInClient: () => inClient }, addEventListener: on("window") };
  const context = {
    window, document, location: loc, URL, URLSearchParams, Date, JSON, Math, Number, String, Boolean, Set,
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    navigator: { sendBeacon: (to, blob) => { sent.push({ to, ...JSON.parse(blob.text) }); return true; } },
    fetch: async () => ({})
  };
  vm.runInNewContext(SOURCE, context);
  const fire = (key, event) => (listeners[key] || []).forEach((fn) => fn(event));
  return { Log: window.LineShareLog, sent, store, fire, document };
}

test("開いたら「open」をためて、ページが隠れたらまとめて送る", () => {
  const { sent, fire, document } = load();
  assert.strictEqual(sent.length, 0);
  document.visibilityState = "hidden";
  fire("document:visibilitychange");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, GAS);
  assert.strictEqual(sent[0].action, "log");
  const [open] = sent[0].events;
  assert.strictEqual(open.event, "open");
  assert.strictEqual(open.tool, "card");
  assert.strictEqual(open.step, 1);
  assert.strictEqual(open.from, "direct");
});

test("記録に個人がわかるものは入れない（決まった項目だけ・長さを切る）", () => {
  const { Log, sent } = load();
  Log.track("send", { tool: "card", kind: "vote", count: "2", message: "x".repeat(500), userId: "U123", name: "かつ" });
  Log.flush();
  const send = sent[0].events[1];
  assert.deepStrictEqual(Object.keys(send).sort(), ["at", "count", "event", "from", "inClient", "kind", "message", "prev", "session", "step", "tool"]);
  assert.strictEqual(send.message.length, 200);
  assert.strictEqual(send.count, 2);
  assert.strictEqual(send.prev, ""); // 直前のページ・何ページ目かは open にだけ
  assert.doesNotMatch(JSON.stringify(sent), /U123|かつ/);
});

test("手元（localhost・*.test・file:）・logging: false・GAS がないとき・LINE の入口の中継では何も送らない", () => {
  for (const url of ["http://localhost:8790/card/", "http://127.0.0.1:3000/", "http://q.test/card/", "file:///Users/x/card/index.html", "https://katsuan.github.io/line-share/?liff.state=%2Fcard"]) {
    const { Log, sent } = load({ url });
    Log.track("send");
    Log.flush();
    assert.strictEqual(sent.length, 0, url);
  }
  for (const config of [{ gasWebAppUrl: GAS, logging: false }, {}]) {
    const { Log, sent } = load({ config });
    Log.track("send");
    Log.flush();
    assert.strictEqual(sent.length, 0);
  }
});

test("10件たまったら送り、1ページで40件まで", () => {
  const { Log, sent } = load();
  for (let i = 0; i < 60; i++) Log.track("send");
  Log.flush();
  assert.strictEqual(sent[0].events.length, 10);
  assert.strictEqual(sent.reduce((n, s) => n + s.events.length, 0), 40);
});

test("同じエラーは1ページで1回だけ。ファイルは最後の2つの名前と行（?v= は外す）", () => {
  const { Log, sent, fire } = load();
  fire("window:error", { message: "boom", filename: "https://katsuan.github.io/line-share/card/js/send.js?v=1", lineno: 12 });
  fire("window:error", { message: "boom", filename: "https://katsuan.github.io/line-share/card/js/send.js?v=1", lineno: 12 });
  fire("window:unhandledrejection", { reason: new Error("nope") });
  Log.flush();
  const errors = sent[0].events.filter((e) => e.event === "error").map((e) => e.message);
  assert.deepStrictEqual(errors, ["boom @js/send.js:12", "nope @promise"]);
});

test("流入口：?from= の目印 → ほかのサイト（ホストとパスの先頭。20字まで） → direct。同じサイトの中の移動は流入口にしない。タブの間は引き継ぐ", () => {
  assert.strictEqual(load({ url: "https://katsuan.github.io/line-share/card/?from=home!" }).Log.from, "home");
  assert.strictEqual(load({ referrer: "https://www.google.com/" }).Log.from, "www.google.com");
  assert.strictEqual(load({ referrer: "https://katsuan.github.io/line-share/" }).Log.from, "direct");
  assert.strictEqual(load({ referrer: "https://katsuan.github.io/countdown/" }).Log.from, "katsuan.github.io/co");
  assert.strictEqual(load({ session: { "line-share:from": "home" }, referrer: "https://x.example/" }).Log.from, "home");
});

test("足跡：何ページ目か・直前のページをこのタブに覚える", () => {
  const first = load({ url: "https://katsuan.github.io/line-share/" });
  assert.strictEqual(first.store["line-share:step"], "1");
  assert.strictEqual(first.store["line-share:last-page"], "line-share");
  const second = load({ session: first.store });
  second.Log.flush();
  const open = second.sent[0].events[0];
  assert.strictEqual(open.step, 2);
  assert.strictEqual(open.prev, "line-share");
  assert.strictEqual(open.session, first.store["line-share:session"]);
});
