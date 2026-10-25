// shared/season.js（季節の絵文字）のテスト。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const QSeason = require("../season.js");

// 日本時間のその日の正午
const jstDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3));
// その日のイベントの key の一覧
const keys = (date) => QSeason.events({ date }).map((e) => e.key);
// いつも同じ数を返す（rand の代わり）
const fixed = (v) => () => v;

test("ハロウィンの時期と当日", () => {
  assert.deepStrictEqual(keys(jstDay(2026, 10, 14)), []);
  assert.deepStrictEqual(keys(jstDay(2026, 10, 24)), ["halloween"]);
  const [h] = QSeason.events({ date: jstDay(2026, 10, 31) });
  assert.strictEqual(h.peak, true);
  assert.deepStrictEqual(keys(jstDay(2026, 11, 1)), []);
});

test("日本時間で日付を見る（UTC ではまだ前の日）", () => {
  // 2026-12-31T15:30Z は日本時間 1/1 0:30
  assert.ok(keys(new Date("2026-12-31T15:30:00Z")).includes("newyear"));
});

test("年で変わる日：母の日・父の日・十五夜", () => {
  assert.ok(keys(jstDay(2026, 5, 10)).includes("mothersday")); // 2026 は 5/10
  assert.ok(!keys(jstDay(2026, 5, 11)).includes("mothersday"));
  assert.ok(keys(jstDay(2026, 6, 21)).includes("fathersday")); // 2026 は 6/21
  assert.ok(keys(jstDay(2026, 9, 25)).includes("tsukimi"));
  assert.ok(keys(jstDay(2027, 9, 15)).includes("tsukimi"));
  assert.ok(!keys(jstDay(2027, 9, 25)).includes("tsukimi"));
});

test("出やすさ：ふだん < イベント中 < 当日", () => {
  assert.strictEqual(QSeason.rate({ date: jstDay(2026, 6, 10) }), 0.3);
  assert.strictEqual(QSeason.rate({ date: jstDay(2026, 10, 24) }), 0.6);
  assert.strictEqual(QSeason.rate({ date: jstDay(2026, 12, 25) }), 0.9);
});

test("pick はイベントの絵文字か月の絵文字を返す", () => {
  const date = jstDay(2026, 10, 24);
  assert.strictEqual(QSeason.pick({ date, rand: fixed(0) }), "🎃");
  assert.ok(QSeason.MONTHS[10].includes(QSeason.pick({ date, rand: fixed(0.99) })));
});

test("どの日も、何かしら絵文字が出る", () => {
  for (let i = 0; i < 366; i++) {
    const date = new Date(Date.UTC(2028, 0, 1 + i, 3));
    for (const v of [0, 0.5, 0.999]) assert.ok(QSeason.pick({ date, rand: fixed(v) }));
  }
});

test("maybe・decorate は出さないときは何も足さない", () => {
  const date = jstDay(2026, 6, 10);
  assert.strictEqual(QSeason.maybe({ date, rand: fixed(0.5) }), "");
  assert.strictEqual(QSeason.decorate("記録しました", { date, rand: fixed(0.5) }), "記録しました");
  assert.match(QSeason.decorate("記録しました", { date, rand: fixed(0) }), /^記録しました \S+$/u);
});

test("GAS と同じく、module も window もないところで読める", () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../season.js"), "utf8"), ctx);
  assert.strictEqual(typeof vm.runInNewContext("QSeason.pick", ctx), "function");
});
