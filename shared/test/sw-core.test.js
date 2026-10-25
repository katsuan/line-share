// shared/sw-core.js（電波がないときのための保存）のテスト。service worker の中身を偽の caches・fetch で動かす。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ORIGIN = "https://katsuan.github.io";
const SOURCE = fs.readFileSync(path.join(__dirname, "../sw-core.js"), "utf8");

// 偽の caches・fetch の上で sw-core.js を動かす。{ get, stores, state, listeners }
function makeWorker({ online = true } = {}) {
  const stores = new Map();
  // 保存の名前（文字なら sw.js の場所から読んだ URL）
  const keyOf = (req) => (typeof req === "string" ? new URL(req, `${ORIGIN}/line-share/sw.js`).href : req.url);
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(req, res) { store.set(keyOf(req), res); },
        async add(req) { store.set(keyOf(req), new Response("top")); },
        async match(req, opt = {}) {
          const key = keyOf(req);
          if (store.has(key)) return store.get(key);
          if (!opt.ignoreSearch) return undefined;
          const bare = key.split("?")[0];
          for (const [k, v] of store) if (k.split("?")[0] === bare) return v;
          return undefined;
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const listeners = {};
  const state = { online };
  const self = {
    CONNEQT_TOOL: "test",
    location: new URL(`${ORIGIN}/line-share/sw.js`),
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting() {},
    clients: { claim: async () => {} }
  };
  // 偽の fetch（state.online が false なら失敗する）
  const fetch = async (req) => {
    if (!state.online) throw new TypeError("Failed to fetch");
    const res = new Response(`body of ${req.url}`, { status: 200 });
    Object.defineProperty(res, "type", { value: "basic" });
    return res;
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch, Request, Response, URL, setTimeout, Promise, console });
  // url を開いたときの service worker の返事を待って返す
  async function get(url, mode = "navigate") {
    let responded;
    const pending = [];
    listeners.fetch({
      request: { url, method: "GET", mode },
      respondWith: (p) => (responded = p),
      waitUntil: (p) => pending.push(p)
    });
    const res = await responded;
    await Promise.all(pending);
    return res;
  }
  return { get, stores, state, listeners };
}

test("クエリのちがう URL を何度開いても、保存はページ1つ分だけ（開いたカードの数だけ増えない）", async () => {
  const sw = makeWorker();
  await sw.get(`${ORIGIN}/line-share/card/?deck=aaa`);
  await sw.get(`${ORIGIN}/line-share/card/?deck=bbb`);
  await sw.get(`${ORIGIN}/line-share/card/js/main.js?v=1`, "no-cors");
  await sw.get(`${ORIGIN}/line-share/card/js/main.js?v=2`, "no-cors");
  const keys = [...sw.stores.get("conneqt-test-v2").keys()];
  assert.deepEqual(keys.sort(), [`${ORIGIN}/line-share/card/`, `${ORIGIN}/line-share/card/js/main.js`]);
});

test("電波がないときは、前に開いたページを出す（クエリがちがっても）", async () => {
  const sw = makeWorker();
  await sw.get(`${ORIGIN}/line-share/card/?deck=aaa`);
  sw.state.online = false;
  const res = await sw.get(`${ORIGIN}/line-share/card/?deck=zzz`);
  assert.match(await res.text(), /card\/\?deck=aaa/);
});

test("前の版の保存（クエリごとに増えていたもの）は、新しい版になったら消す", async () => {
  const sw = makeWorker();
  const old = await caches_open(sw, "conneqt-test-v1");
  await old.put(`${ORIGIN}/line-share/card/?deck=aaa`, new Response("old"));
  const other = await caches_open(sw, "conneqt-other-v1");
  await other.put(`${ORIGIN}/x/`, new Response("x"));
  await new Promise((resolve) => sw.listeners.activate({ waitUntil: (p) => p.then(resolve) }));
  assert.ok(!sw.stores.has("conneqt-test-v1"));
  assert.ok(sw.stores.has("conneqt-other-v1")); // ほかのツールの保存は触らない
});

// 前の版の保存の場所を、テストで先に作る
function caches_open(sw, name) {
  if (!sw.stores.has(name)) sw.stores.set(name, new Map());
  const store = sw.stores.get(name);
  return { put: async (k, v) => store.set(k, v) };
}
