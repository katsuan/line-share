// お知らせカード（card/js/）の中身の扱いのテスト。画面は使わず、ファイルを読みこんで関数を呼ぶ。
//   node --test card/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILES = ["config.js", "store.js", "state.js", "url.js", "soccer.js", "render.js", "templates.js"];
// 色の並び（shared/ui.js の PALETTE）。ui.js は画面を触るので、並びだけ取り出す
const UI = fs.readFileSync(path.join(__dirname, "../../shared/ui.js"), "utf8");
const PALETTE = vm.runInNewContext(/const PALETTE = (\[[\s\S]*?\n  \]);/.exec(UI)[1]);

function load(storage = {}) {
  const store = new Map(Object.entries(storage));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const ctx = vm.createContext({
    window: { LINE_SHARE_CONFIG: { liffId: "1-x" }, LineShareUI: { PALETTE } },
    location: new URL("https://katsuan.github.io/line-share/card/"),
    localStorage,
    sessionStorage: localStorage,
    history: { replaceState() {} },
    console,
    structuredClone,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa
  });
  for (const file of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), ctx, { filename: file });
  return ctx;
}

test("hydrate：壊れた中身（null・数・文字・配列）でも止まらず、空のカードになる", () => {
  const ctx = load();
  for (const bad of [null, undefined, 1, "x", [], [1, 2], true]) {
    const card = ctx.hydrate(bad);
    assert.equal(card.kind, "notice");
    assert.equal(card.title, "");
  }
});

test("hydrate：形のちがう項目（badges が文字・buttons が数・route が文字など）でも止まらない", () => {
  const ctx = load();
  const card = ctx.hydrate({ kind: "zzz", badges: "x", buttons: 5, items: "no", route: "x", pairs: [null, 1], coupon: 3, title: 12 });
  assert.equal(card.kind, "notice");
  assert.deepEqual([...card.badges], []);
  assert.deepEqual([...card.buttons], []);
  assert.equal(card.title, "12");
});

test("loadDraft：壊れた下書きは使わない・何枚目かが数でないときは1枚目", () => {
  assert.equal(load({ "line-share:card-draft": "{" }).loadDraft(), null);
  assert.equal(load({ "line-share:card-draft": '{"cards":"x"}' }).loadDraft(), null);
  const ctx = load({ "line-share:card-draft": '{"cards":[null,{"title":"a"}],"current":"x"}' });
  const draft = ctx.loadDraft();
  assert.equal(draft.current, 0);
  assert.equal(load({ "line-share:card-draft": '{"cards":[{"title":"a"}],"current":99}' }).loadDraft().current, 0);
});

test("lastSentCards：前に送った中身が壊れていても止まらない", () => {
  assert.deepEqual([...load({ "flexshare:lastSentState": "5" }).lastSentCards()], []);
  assert.deepEqual([...load({ "flexshare:lastSentState": '"x"' }).lastSentCards()], []);
  assert.equal(load({ "flexshare:lastSentState": '{"cards":[null]}' }).lastSentCards().length, 1);
});

test("getTemplates：保存したテンプレートが壊れていても、名前のあるものだけ並べる", () => {
  const ctx = load({ "line-share:card-templates": '[null,1,{"name":5},{"name":"ok","state":{}}]' });
  assert.deepEqual(ctx.getTemplates().map((t) => t.name), ["ok"]);
  assert.deepEqual([...load({ "line-share:card-templates": '{"a":1}' }).getTemplates()], []);
});
