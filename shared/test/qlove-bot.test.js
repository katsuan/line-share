// shared/qlove-bot.js（くらぶボットの URL の共通の置き場所）のテスト。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Q = require("../qlove-bot.js");

function memory(init = {}) {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
const URL_OK = "https://script.google.com/macros/s/AKfycbx_abcdefghijklmnopqrstuvwxyz012345/exec";

test("キーは qlove:bot。URL は GAS のウェブアプリ（…/exec）だけ", () => {
  assert.strictEqual(Q.KEY, "qlove:bot");
  const s = memory();
  assert.deepStrictEqual(Q.set(`  ${URL_OK} `, { storage: s }), { ok: true, url: URL_OK });
  assert.strictEqual(Q.get({ storage: s }), URL_OK);
  for (const bad of ["", "http://script.google.com/macros/s/AKfycbx_abcdefghijklmnopqrstuvwxyz012345/exec", `${URL_OK}?key=secret`, "https://example.com/macros/s/AKfycbx_abcdefghijklmnopqrstuvwxyz012345/exec", "javascript:alert(1)", `${URL_OK}/../x`]) { // qcheck-ok: W8 テストの見本の文字
    assert.deepStrictEqual(Q.set(bad, { storage: memory() }), { ok: false, error: "url" }, bad);
  }
});

test("合言葉つきの URL（Webhook 用）は入れられない。残すのは URL だけ", () => {
  const s = memory();
  Q.set(URL_OK, { storage: s });
  const saved = JSON.parse(s.data["qlove:bot"]);
  assert.deepStrictEqual(Object.keys(saved).sort(), ["at", "url", "v"]);
});

test("壊れた中身・読めない端末では \"\"。消せる", () => {
  for (const raw of ["{", "null", "5", '"x"', '{"v":2,"url":"' + URL_OK + '"}', '{"v":1,"url":"https://example.com"}']) {
    assert.strictEqual(Q.get({ storage: memory({ "qlove:bot": raw }) }), "", raw);
  }
  assert.strictEqual(Q.get({ storage: broken }), "");
  assert.deepStrictEqual(Q.set(URL_OK, { storage: broken }), { ok: false, error: "save" });
  const s = memory();
  Q.set(URL_OK, { storage: s });
  Q.clear({ storage: s });
  assert.strictEqual(Q.get({ storage: s }), "");
  Q.clear({ storage: broken });
});

test("call：入れた URL に text/plain の JSON を送る。payload で app・v・tool・action は上書きできない", async () => {
  const s = memory();
  Q.set(URL_OK, { storage: s });
  let sent = null;
  const fetch = async (url, opt) => {
    sent = { url, opt, body: JSON.parse(opt.body) };
    return { json: async () => ({ ok: true, places: [] }) };
  };
  const out = await Q.call("weather", "list", { liffId: "1-x", idToken: "t", tool: "core", app: "x" }, { storage: s, fetch });
  assert.deepStrictEqual(out, { ok: true, places: [] });
  assert.strictEqual(sent.url, URL_OK);
  assert.strictEqual(sent.opt.method, "POST");
  assert.match(sent.opt.headers["Content-Type"], /^text\/plain/);
  assert.deepStrictEqual(sent.body, { app: "qlove", v: 1, tool: "weather", action: "list", liffId: "1-x", idToken: "t" });
  // ID トークンは残さない
  assert.doesNotMatch(JSON.stringify(s.data), /idToken|"t"/);
});

test("call：URL がない・つながらない・変な返事", async () => {
  assert.deepStrictEqual(await Q.call("core", "ping", {}, { storage: memory(), fetch: async () => ({}) }), { ok: false, error: "nourl" });
  const s = memory();
  Q.set(URL_OK, { storage: s });
  assert.deepStrictEqual(await Q.call("core", "ping", {}, { storage: s, fetch: async () => { throw new Error("offline"); } }), { ok: false, error: "net" });
  assert.deepStrictEqual(await Q.call("core", "ping", {}, { storage: s, fetch: async () => ({ json: async () => "<html>" }) }), { ok: false, error: "bad" });
  assert.deepStrictEqual(await Q.ping(URL_OK, { fetch: async () => ({ json: async () => ({ ok: true, version: "1" }) }) }), { ok: true, version: "1" });
  assert.deepStrictEqual(await Q.ping("https://example.com", { fetch: async () => ({ json: async () => ({ ok: true }) }) }), { ok: false, error: "nourl" });
});
