// shared/week-start.js（週のはじまりの共通設定）のテスト。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const QWeekStart = require("../week-start.js");

// localStorage の偽物
function memory(init = {}) {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("キーはくるかなと同じ qlove:weekStart", () => {
  assert.strictEqual(QWeekStart.KEY, "qlove:weekStart");
});

test("なにもなければ月曜", () => {
  assert.strictEqual(QWeekStart.get(undefined, { storage: memory() }), 1);
  assert.strictEqual(QWeekStart.get(undefined, { storage: broken }), 1);
});

test("共通の設定がないときは、ツールの値", () => {
  assert.strictEqual(QWeekStart.get(0, { storage: memory() }), 0);
  assert.strictEqual(QWeekStart.get("0", { storage: memory() }), 0);
  assert.strictEqual(QWeekStart.get(0, { storage: broken }), 0);
  assert.strictEqual(QWeekStart.get(7, { storage: memory() }), 1);
});

test("共通の設定がツールの値より先", () => {
  assert.strictEqual(QWeekStart.get(1, { storage: memory({ "qlove:weekStart": "0" }) }), 0);
  assert.strictEqual(QWeekStart.get(0, { storage: memory({ "qlove:weekStart": "1" }) }), 1);
});

test("変な値は読まない", () => {
  assert.strictEqual(QWeekStart.get(0, { storage: memory({ "qlove:weekStart": "2" }) }), 0);
  assert.strictEqual(QWeekStart.get(undefined, { storage: memory({ "qlove:weekStart": "" }) }), 1);
});

test("残す：0 は日曜、それ以外は月曜", () => {
  const s = memory();
  assert.strictEqual(QWeekStart.set(0, { storage: s }), 0);
  assert.strictEqual(s.data["qlove:weekStart"], "0");
  QWeekStart.set(5, { storage: s });
  assert.strictEqual(s.data["qlove:weekStart"], "1");
  assert.strictEqual(QWeekStart.set(0, { storage: broken }), 0);
});
