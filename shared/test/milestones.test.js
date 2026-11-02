// shared/milestones.js（目じるしと進みぐあい）のテスト。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Q = require("../milestones.js");

// 重さの目じるし（キロっくの一部）と、続けた日数の目じるし（つづくの見本）
const WEIGHT = [
  { icon: "🐼", name: "パンダ", value: 100, count: "頭" },
  { icon: "🚗", name: "乗用車", value: 1500, count: "台" },
  { icon: "🚑", name: "救急車", value: 3500, count: "台" },
  { icon: "🐘", name: "ゾウ", value: 6000, count: "頭" },
  { icon: "🦖", name: "ティラノサウルス", short: "ティラノ", value: 9000, count: "体" },
  { icon: "🗼", name: "東京タワー", value: 4000000, count: "本", big: true },
  { icon: "🚢", name: "タイタニック号", value: 50000000, count: "隻" },
  { icon: "🔺", name: "ギザの大ピラミッド", value: 6e9, count: "基", big: true },
  { icon: "🌕", name: "月", value: 7.3e22, count: "個", big: true },
  { icon: "🌍", name: "地球", value: 6e24, count: "個", big: true }
];
const kg = (v) => (v < 100000 ? Math.round(v).toLocaleString("ja-JP") + " kg" : Q.bigNumber(Math.round(v / 1000)) + " t");
const weight = Q.create({ marks: WEIGHT, amount: kg, markValue: (v) => (v < 1000 ? "約 " + v + " kg" : "約 " + Q.bigNumber(v / 1000) + " t") });
const DAYS = [
  { icon: "🌱", name: "3日", value: 3, count: "回" },
  { icon: "🌿", name: "1週間", value: 7, count: "回" },
  { icon: "🌳", name: "1か月", value: 30, count: "回", big: true },
  { icon: "🎉", name: "1年", value: 365, count: "回", big: true }
];
const days = Q.create({ marks: DAYS, amount: (v) => Math.round(v) + "日" });

// ---- これまでの合計 ----

test("はじめては、今ある記録を1回だけ数える。もう一度合わせても増えない（2回入らない）", () => {
  const first = Q.syncLedger(null, [{ id: "a", value: 1000 }, { id: "b", value: 500.5 }]);
  assert.strictEqual(first.ledger.total, 1500.5);
  assert.strictEqual(first.added, 1500.5);
  const again = Q.syncLedger(first.ledger, [{ id: "a", value: 1000 }, { id: "b", value: 500.5 }]);
  assert.strictEqual(again.ledger.total, 1500.5);
  assert.strictEqual(again.added, 0);
});

test("記録を足したら合計に足す", () => {
  const { ledger } = Q.syncLedger(null, [{ id: "a", value: 1000 }]);
  const next = Q.syncLedger(ledger, [{ id: "c", value: 300 }, { id: "a", value: 1000 }]);
  assert.strictEqual(next.ledger.total, 1300);
  assert.strictEqual(next.added, 300);
});

test("記録を消しても・古い記録が消えても、合計は減らない。「元に戻す」で戻っても2回数えない", () => {
  const { ledger } = Q.syncLedger(null, [{ id: "a", value: 1000 }, { id: "b", value: 500 }]);
  const deleted = Q.syncLedger(ledger, [{ id: "b", value: 500 }]);
  assert.strictEqual(deleted.ledger.total, 1500);
  const none = Q.syncLedger(deleted.ledger, []);
  assert.strictEqual(none.ledger.total, 1500);
  assert.strictEqual(Q.syncLedger(none.ledger, [{ id: "a", value: 1000 }, { id: "b", value: 500 }]).ledger.total, 1500);
});

test("同じ記録を直したら、差の分だけ合計を直す（減らす直しもある）。直したあとに消しても減らない", () => {
  const { ledger } = Q.syncLedger(null, [{ id: "a", value: 1000 }, { id: "b", value: 500 }]);
  const up = Q.syncLedger(ledger, [{ id: "a", value: 1200 }, { id: "b", value: 500 }]);
  assert.strictEqual(up.ledger.total, 1700);
  assert.strictEqual(up.added, 200);
  const down = Q.syncLedger(up.ledger, [{ id: "a", value: 900 }, { id: "b", value: 500 }]);
  assert.strictEqual(down.ledger.total, 1400);
  assert.strictEqual(down.added, -300);
  assert.strictEqual(Q.syncLedger(down.ledger, [{ id: "b", value: 500 }]).ledger.total, 1400);
});

test("小数の足し引きでずれない・id のない記録とマイナスは数えない", () => {
  let ledger = null;
  for (let i = 0; i < 10; i += 1) ledger = Q.syncLedger(ledger, [{ id: "w" + i, value: 0.1 }]).ledger;
  assert.strictEqual(ledger.total, 1);
  assert.strictEqual(Q.syncLedger(ledger, [{ value: 100 }, { id: "", value: 100 }, { id: "x", value: -50 }]).ledger.total, 1);
});

test("覚える id は 300 件まで（新しいものを残す）。max で変えられる", () => {
  let ledger = null;
  for (let i = 0; i < Q.COUNTED_MAX + 5; i += 1) ledger = Q.syncLedger(ledger, [{ id: "w" + i, value: 1 }]).ledger;
  assert.strictEqual(ledger.counted.length, Q.COUNTED_MAX);
  assert.strictEqual(ledger.counted[0][0], "w" + (Q.COUNTED_MAX + 4));
  assert.strictEqual(ledger.total, Q.COUNTED_MAX + 5);
  assert.strictEqual(Q.syncLedger(null, [{ id: "a", value: 1 }, { id: "b", value: 1 }, { id: "c", value: 1 }], { max: 2 }).ledger.counted.length, 2);
});

test("端末から読んだ形がおかしいときは使わない（同じ id は1つに）", () => {
  assert.strictEqual(Q.ledgerIn(null), null);
  assert.strictEqual(Q.ledgerIn({ total: "x", counted: [] }), null);
  assert.strictEqual(Q.ledgerIn({ total: -1, counted: [] }), null);
  assert.deepStrictEqual(Q.ledgerIn({ total: 10, counted: [["a", 5], ["a", 7], [1, 2], "x"] }), { total: 10, counted: [["a", 5]] });
});

test("端末への読み書き：読めない・残せない端末でも止めない", () => {
  const data = {};
  const memory = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.strictEqual(Q.loadLedger("k", memory), null);
  Q.saveLedger("k", { total: 3, counted: [] }, memory);
  assert.deepStrictEqual(Q.loadLedger("k", memory), { total: 3, counted: [] });
  assert.strictEqual(Q.loadLedger("k", broken), null);
  assert.deepStrictEqual(Q.saveLedger("k", { total: 1, counted: [] }, broken), { total: 1, counted: [] });
});

// ---- 大きな数 ----

test("大きな数は 万・億・兆・京・垓 で（3けたくらい）", () => {
  assert.strictEqual(Q.bigNumber(3000), "3,000");
  assert.strictEqual(Q.bigNumber(1.5), "1.5");
  assert.strictEqual(Q.bigNumber(12345), "1.23万");
  assert.strictEqual(Q.bigNumber(1240000), "124万");
  assert.strictEqual(Q.bigNumber(2.75e10), "275億");
  assert.strictEqual(Q.bigNumber(2.36e13), "23.6兆");
  assert.strictEqual(Q.bigNumber(5.1e15), "5,100兆");
  assert.strictEqual(Q.bigNumber(7.3e19), "7,300京");
  assert.strictEqual(Q.bigNumber(6e21), "60垓");
  assert.strictEqual(Q.bigNumber(-5), "0");
});

test("◯つ分の数・遠い目じるしの「◯％」「◯分の1」", () => {
  assert.strictEqual(Q.ratioLabel(0.94), "0.9");
  assert.strictEqual(Q.ratioLabel(12.4), "12");
  assert.strictEqual(Q.ratioLabel(123456), "12.3万");
  assert.strictEqual(Q.shareLabel(500000, 1.24e9), "0.04％");
  assert.strictEqual(Q.shareLabel(500000, 2e11), "40万分の1");
  assert.strictEqual(Q.shareLabel(12000, 6e24), "5垓分の1");
  assert.strictEqual(Q.shareLabel(0, 6e24), "");
  assert.strictEqual(Q.shareLabel(7e24, 6e24), "");
});

// ---- 目じるし ----

test("次の目じるしまでと、進みぐあい", () => {
  const start = weight.progress(0);
  assert.strictEqual(start.passed, null);
  assert.strictEqual(start.next.name, "パンダ");
  assert.strictEqual(start.toNext, 100);
  assert.strictEqual(start.progress, 0);
  const car = weight.progress(1500);
  assert.strictEqual(car.passed.name, "乗用車");
  assert.strictEqual(car.next.name, "救急車");
  assert.strictEqual(car.passedCount, 2);
  assert.strictEqual(weight.progress(4750).progress, 0.5); // 救急車とゾウのまん中
  assert.strictEqual(weight.progress(4799.5).toNext, 1200.5);
});

test("いちばん上を越えたら「地球 2個分」「3個分」…", () => {
  const over = weight.progress(6e24 * 1.5);
  assert.strictEqual(over.passed.name, "地球");
  assert.strictEqual(over.next.name, "地球 2個分");
  assert.strictEqual(over.next.value, 1.2e25);
  assert.strictEqual(weight.progress(1.2e25).next.name, "地球 3個分");
  assert.strictEqual(weight.marksFor(0).length, WEIGHT.length);
});

test("新しく越えた目じるし（2つ越えたら大きいほう）と、越えたときの見出し", () => {
  assert.strictEqual(weight.newlyPassed(1000, 1400), null);
  assert.strictEqual(weight.newlyPassed(1000, 7000).name, "ゾウ");
  assert.strictEqual(weight.newlyPassed(0, 100).name, "パンダ");
  assert.strictEqual(weight.newlyPassed(6000, 6000), null);
  assert.strictEqual(weight.passedTitle(WEIGHT[3]), "🎉 🐘 ゾウを越えました！");
});

test("1回の分は、1つ分にいちばん近い目じるしでくらべる（「🐘 ゾウ 0.9 頭分」）", () => {
  assert.strictEqual(weight.compareLabel(5400), "🐘 ゾウ 0.9 頭分");
  assert.strictEqual(weight.compareLabel(1600), "🚗 乗用車 1.1 台分");
  assert.strictEqual(weight.compareLabel(50), "🐼 パンダ 0.5 頭分");
  assert.strictEqual(weight.compareLabel(0), "");
  assert.strictEqual(weight.compare(0), null);
});

test("押したときの言い方：越えていれば「いま ◯ 頭分」、まだなら「いま ◯％」「◯分の1」、0 なら「まだ 0 kg」", () => {
  assert.strictEqual(weight.standing(19200, WEIGHT[3]), "いま 3.2 頭分");
  assert.strictEqual(weight.standing(4740, WEIGHT[3]), "いま 79％");
  assert.strictEqual(weight.standing(12000, WEIGHT[9]), "いま 5垓分の1");
  assert.strictEqual(weight.standing(0, WEIGHT[3]), "まだ 0 kg");
  assert.strictEqual(days.standing(0, DAYS[1]), "まだ 0日");
});

test("次までの言い方：近ければ「あと ◯」、とほうもなく遠ければ「いま ◯◯の ◯％」", () => {
  assert.strictEqual(weight.rest(1500, weight.progress(1500)), "あと 2,000 kg");
  const far = weight.progress(3e10);
  assert.strictEqual(far.next.name, "月");
  assert.strictEqual(weight.rest(3e10, far), "いま 月の 2.4兆分の1");
  assert.strictEqual(weight.rest(3e10, far, true), "いま 2.4兆分の1");
});

test("先の並び：big は見せ、あいだの小さい目じるしは1行にまとめる", () => {
  const rows = weight.ahead(0);
  const names = rows.map((r) => (r.mark ? r.mark.name : "🔒" + r.locked));
  assert.deepStrictEqual(names, ["🔒4", "東京タワー", "🔒1", "ギザの大ピラミッド", "月", "地球"]);
  assert.strictEqual(rows.reduce((sum, r) => sum + (r.mark ? 1 : r.locked), 0), WEIGHT.length - 1);
  assert.deepStrictEqual(weight.ahead(6e24 * 1.5), []);
});

test("単位は kg にかぎらない（続けた日数）", () => {
  assert.strictEqual(days.progress(5).next.name, "1週間");
  assert.strictEqual(days.rest(5, days.progress(5)), "あと 2日");
  assert.strictEqual(days.compareLabel(14), "🌿 1週間 2 回分");
  assert.strictEqual(days.progress(800).next.name, "1年 3回分");
});

// ---- 画面（HTML） ----

test("次の目じるしまでの棒：名前は短い呼び名・あと ◯・上に添える1行", () => {
  const html = weight.goalHtml(7000, { lead: "今日 1,000 kg ＝ 🐼 パンダ 10 頭分" });
  assert.match(html, /class="ls-goal-lead">今日 1,000 kg ＝ 🐼 パンダ 10 頭分</);
  assert.match(html, /🦖 ティラノまで/);
  assert.match(html, /style="width:33%"/);
  assert.match(html, /あと 2,000 kg/);
  assert.doesNotMatch(weight.goalHtml(0), /ls-goal-lead/);
});

test("目じるしの表：越えたら ✅（新しい3つ・それより前は開く）、次だけ「あと」、先は big だけ、押すと「いま ◯ 頭分」", () => {
  const html = weight.tableHtml(19200, { title: "🏋️ これまでに持ち上げた重さ", hint: "記録を消しても減りません。" });
  assert.match(html, /aria-label="これまでに持ち上げた重さ"/);
  assert.match(html, /<b>19,200 kg<\/b>/);
  assert.match(html, /✅ ほかに 2 個を越えました/); // パンダ・乗用車
  assert.match(html, /✅ 🐘 ゾウ.*いま 3.2 頭分/);
  assert.match(html, /🎯 🗼 東京タワー/);
  assert.match(html, /いま <b>東京タワーの 0.48％<\/b>/); // 遠いので「あと」の代わりに
  assert.match(html, /🔒 この間に、あと 1 個/);
  assert.match(html, /🌍 地球/);
  assert.match(html, /目じるしを押すと、いまの合計とくらべられます。記録を消しても減りません。/);
  assert.doesNotMatch(html, /タイタニック/); // big でない先の目じるしはかくす
});

test("名前などは HTML として入れない", () => {
  const evil = Q.create({ marks: [{ icon: "<b>", name: "<img src=x>", value: 10, count: "個" }] });
  assert.doesNotMatch(evil.tableHtml(3), /<img/);
  assert.doesNotMatch(evil.goalHtml(3, { lead: "<script>" }), /<script>/);
});
