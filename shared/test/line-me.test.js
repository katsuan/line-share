// shared/line-me.js（LINE 版の「わたし」のアイコンとシート）のテスト。画面に触らない部分。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const M = require("../line-me.js");

// localStorage の偽物
function memory(init = {}) {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}

test("端末に残すのは名前とアイコンの URL だけ（LINE の ID・トークンは残さない）。https の画像だけ使う", () => {
  const s = memory();
  const me = M.saveMe({ userId: "U0123456789abcdef0123456789abcdef", displayName: "かつ", pictureUrl: "https://profile.line-scdn.net/abc", statusMessage: "x", idToken: "t" }, s);
  assert.deepStrictEqual(me, { name: "かつ", picture: "https://profile.line-scdn.net/abc" });
  const saved = JSON.parse(s.data[M.KEY]);
  assert.deepStrictEqual(Object.keys(saved).sort(), ["at", "name", "picture", "v"]);
  assert.doesNotMatch(s.data[M.KEY], /U0123|idToken|statusMessage/);
  assert.deepStrictEqual(M.readMe(s), { name: "かつ", picture: "https://profile.line-scdn.net/abc" });
  for (const bad of ["http://x.example/a.png", "javascript:alert(1)", "https://x.example/a\".png", "data:image/png;base64,AAA"]) { // qcheck-ok: W8 テストの見本の文字
    assert.strictEqual(M.saveMe({ displayName: "a", pictureUrl: bad }, memory()).picture, "", bad);
  }
  assert.strictEqual(M.readMe(memory({ [M.KEY]: "{壊れた" })), null);
  assert.strictEqual(M.readMe(memory()), null);
});

test("名前の頭の字（絵文字も1つ）。名前がなければ 👤", () => {
  assert.strictEqual(M.initial("かつ"), "か");
  assert.strictEqual(M.initial("👨‍👩‍👧 家族"), "👨‍👩‍👧");
  assert.strictEqual(M.initial(""), "👤");
});

test("シートの中身：ログイン済み・つながっている・送っていない記録", () => {
  const rows = M.describe({ me: { name: "かつ" }, loggedIn: true, connected: true, pending: 2, botName: "くらぶボット", online: true });
  const text = rows.map((r) => r.text).join("\n");
  assert.match(text, /かつ さんでログインしています/);
  assert.match(text, /くらぶボットとつながっています/);
  assert.match(text, /送っていない記録が 2 件。すぐ送りなおします/);
  assert.ok(rows.find((r) => r.pending));
  assert.match(text, /ブラウザ版とは別/);
});

test("シートの中身：未ログイン・つながっていない・電波なしでも、記録は端末に残ると伝える", () => {
  const off = M.describe({ me: null, loggedIn: false, connected: false, pending: 3, botName: "くらぶボット", online: false });
  const text = off.map((r) => r.text).join("\n");
  assert.match(text, /まだ LINE にログインしていません。記録はこの端末に残ります/);
  assert.match(text, /つながなくても、記録はこの端末に残ります/);
  assert.match(text, /3 件。電波がもどったら送ります/);
  assert.match(text, /いまは電波がありません/);
  const none = M.describe({ loggedIn: true, connected: true, pending: 0, botName: "くらぶボット", online: true }).map((r) => r.text).join("\n");
  assert.match(none, /送っていない記録はありません/);
  assert.match(none, /^LINEでログインしています/m, "名前がわからないとき");
});

test("ボットにつながないツール（キロっく）：ボットの行・送っていない数を出さない。うつし方の言葉を変えられる", () => {
  const rows = M.describe({ me: { name: "かつ" }, loggedIn: true, connected: true, pending: 5, bot: false, online: true, moveHint: "「💾 この端末の記録をバックアップ」でうつせます" });
  const text = rows.map((r) => r.text).join("\n");
  assert.match(text, /かつ さんでログインしています/);
  assert.doesNotMatch(text, /ボット|送っていない/);
  assert.ok(!rows.some((r) => r.pending));
  assert.match(text, /💾 この端末の記録をバックアップ/);
  const browser = M.describe({ loggedIn: false, bot: false }).map((r) => r.text).join("\n");
  assert.match(browser, /まだ LINE にログインしていません/);
});
