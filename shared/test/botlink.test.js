// shared/botlink.js（ボットとつなぐ共通の部品）のテスト。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const B = require("../botlink.js");

const URL_OK = "https://script.google.com/macros/s/AKfycbx_abcdefghijklmnopqrstuvwxyz012345/exec";
const URL_QLOVE = "https://script.google.com/macros/s/AKfycbQ_qlovebot_abcdefghijklmnopqrstuvwxyz/exec";
// localStorage の偽物
function memory(init = {}) {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
// 送った中身を覚えて、決まった返事をする fetch の偽物
function fakeFetch(reply, seen = []) {
  return async (url, opt) => {
    seen.push({ url, opt, body: JSON.parse(opt.body) });
    if (reply instanceof Error) throw reply;
    return { json: async () => (typeof reply === "function" ? reply(JSON.parse(opt.body)) : reply) };
  };
}

test("URL は GAS のウェブアプリ（…/exec）だけ。?key= や http・ほかのドメインは受けない", () => {
  assert.strictEqual(B.cleanUrl(`  ${URL_OK} `), URL_OK);
  assert.strictEqual(B.cleanUrl("https://script.google.com/a/example.com/macros/s/AKfycbx_abcdefghij/exec"), "https://script.google.com/a/example.com/macros/s/AKfycbx_abcdefghij/exec");
  for (const bad of ["", null, `${URL_OK}?key=secret`, URL_OK.replace("https", "http"), "https://example.com/macros/s/AKfycbx_abcdefghij/exec", "javascript:alert(1)"]) { // qcheck-ok: W8 テストの見本の文字
    assert.strictEqual(B.cleanUrl(bad), "", String(bad));
  }
});

test("LINE のアプリの中かは、User-Agent の Line/ で見る", () => {
  assert.strictEqual(B.inLineApp("Mozilla/5.0 (iPhone) Line/14.1.0 LIFF"), true);
  assert.strictEqual(B.inLineApp("Mozilla/5.0 (iPhone) Safari/604.1"), false);
});

test("送る形：ふだんはくらぶボットの形。legacyApp を渡すと前の形（app・op）も入れる。決まった項目は上書きさせない", () => {
  assert.deepStrictEqual(B.body("shoquji", "listMealLogs", { from: "2026-10-01", app: "x", tool: "y" }, { liffId: "2010-a", idToken: "t" }), {
    app: "qlove", v: 1, tool: "shoquji", action: "listMealLogs", liffId: "2010-a", idToken: "t", from: "2026-10-01"
  });
  assert.deepStrictEqual(B.body("tuzuq", "record", { text: "# workout", op: "days" }, { legacyApp: "tuzuq", idToken: "t" }), {
    app: "tuzuq", v: 1, op: "record", tool: "tuzuq", action: "record", idToken: "t", text: "# workout"
  });
});

test("送る口：ID トークンを付けて text/plain で送る。トークンがなければ送らない。つながらなければ net。error は mapError でツールの印に", async () => {
  const seen = [];
  const c = B.makeClient(URL_OK, () => "tok", { tool: "tuzuq", legacyApp: "tuzuq", liffId: "2012-x", fetch: fakeFetch({ ok: true, added: true }, seen) });
  assert.deepStrictEqual(await c.call("record", { text: "# a", date: "2026-10-25" }, { keepalive: true }), { ok: true, added: true });
  assert.strictEqual(seen[0].url, URL_OK);
  assert.match(seen[0].opt.headers["Content-Type"], /^text\/plain/);
  assert.strictEqual(seen[0].opt.keepalive, true);
  assert.strictEqual(seen[0].opt.credentials, "omit");
  assert.deepStrictEqual(seen[0].body, { app: "tuzuq", v: 1, op: "record", tool: "tuzuq", action: "record", liffId: "2012-x", idToken: "tok", text: "# a", date: "2026-10-25" });

  const none = B.makeClient(URL_OK, () => "", { tool: "tuzuq", fetch: fakeFetch({ ok: true }) });
  assert.deepStrictEqual(await none.call("record", {}), { ok: false, error: "auth" });
  const down = B.makeClient(URL_OK, () => "tok", { tool: "tuzuq", fetch: fakeFetch(new Error("offline")) });
  assert.deepStrictEqual(await down.call("record", {}), { ok: false, error: "net" });
  const mapped = B.makeClient(URL_OK, () => "tok", { tool: "shoquji", fetch: fakeFetch({ ok: false, error: "このボットをまだ使っていません" }), mapError: (e) => (/まだ使って/.test(e) ? "guest" : "fail") });
  assert.strictEqual((await mapped.call("listMealLogs", {})).error, "guest");
  const badUrl = B.makeClient("https://example.com/x", () => "tok", { tool: "tuzuq", fetch: fakeFetch({ ok: true }) });
  assert.deepStrictEqual(await badUrl.call("record", {}), { ok: false, error: "net" });
});

test("つなぎ先：ツールに入れた URL が先（前の形）。なければ、くらぶボットにそのツールの機能があるときだけ（1時間覚える）", async () => {
  const session = memory();
  let pings = 0;
  const qlove = (modules, url = URL_QLOVE) => ({ get: () => url, ping: async () => { pings++; return { ok: true, modules }; } });
  assert.deepStrictEqual(await B.target({ own: URL_OK, tool: "tuzuq", qlove: qlove(["tuzuq"]), session }), { url: URL_OK, legacy: true });
  assert.strictEqual(pings, 0, "ツールに入れた URL があれば、くらぶボットには聞かない");
  assert.strictEqual(await B.target({ own: "", tool: "tuzuq", qlove: qlove(["weather"]), session: memory() }), null, "まだ合流していない");
  assert.deepStrictEqual(await B.target({ own: "", tool: "tuzuq", qlove: qlove(["weather", "tuzuq"]), session }), { url: URL_QLOVE, legacy: false });
  const before = pings;
  assert.deepStrictEqual(await B.target({ own: "", tool: "tuzuq", qlove: qlove(["weather", "tuzuq"]), session }), { url: URL_QLOVE, legacy: false });
  assert.strictEqual(pings, before, "1時間は聞きなおさない");
  assert.strictEqual(await B.target({ own: "", tool: "tuzuq", qlove: qlove(["tuzuq"], ""), session: memory() }), null, "くらぶボットの URL もない");
  assert.strictEqual(await B.target({ own: "", tool: "tuzuq", qlove: { get: () => URL_QLOVE, ping: async () => ({ ok: false, error: "net" }) }, session: memory() }), null);
  assert.strictEqual(await B.target({ own: "", tool: "TUZUQ!", qlove: qlove(["tuzuq"]), session: memory() }), null);
});

test("送れなかったものの箱：入れる・消す・古い順。上限と日数をこえたら捨てる。壊れていても空", () => {
  const s = memory();
  const box = B.outbox("t:out", { storage: s, max: 2 });
  box.put("a", { text: "# a" });
  box.put("b", { text: "# b" });
  box.put("a", { text: "# a2" });
  assert.deepStrictEqual(box.all().map((x) => [x.id, x.item.text]), [["b", "# b"], ["a", "# a2"]]);
  box.put("c", { text: "# c" });
  assert.deepStrictEqual(box.all().map((x) => x.id), ["a", "c"], "max 2");
  box.drop("a");
  box.drop("c");
  assert.strictEqual(s.data["t:out"], undefined, "空になったらキーも消す");
  s.data["t:old"] = JSON.stringify([{ id: "x", item: 1, at: Date.now() - 20 * 86400000 }, { id: "y", item: 2, at: Date.now() }]);
  assert.deepStrictEqual(B.outbox("t:old", { storage: s }).all().map((x) => x.id), ["y"]);
  s.data["t:bad"] = "{壊れた";
  assert.deepStrictEqual(B.outbox("t:bad", { storage: s }).all(), []);
  assert.doesNotMatch(JSON.stringify(s.data), /idToken/);
});

test("「LINE 版で開きなおす」は、つないだ人が LINE のふつうのブラウザで、つながらなかったときだけ", () => {
  const ua = "Mozilla/5.0 (iPhone) Line/14.1.0";
  assert.strictEqual(B.reopenHidden({ client: null, url: URL_OK, ua }), false);
  assert.strictEqual(B.reopenHidden({ client: {}, url: URL_OK, ua }), true);
  assert.strictEqual(B.reopenHidden({ client: null, url: "", ua }), true);
  assert.strictEqual(B.reopenHidden({ client: null, url: URL_OK, ua: "Safari" }), true);
});
