// tools/qtest/selfcheck.gs（共通の自己点検）のテスト：今月の送信数の点検。LINE は偽物の返事を使う（何も送らない）。
//   node --test tools/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createGas, response } = require("../qtest/fake-gas.js");

const SOURCE = fs.readFileSync(path.join(__dirname, "../qtest/selfcheck.gs"), "utf8");

// 自己点検を、LINE の返事（quota・consumption）を決めて動かし、送信数の行を返す
function quotaRows({ quota = { type: "limited", value: 200 }, used = { totalUsage: 10 }, quotaCode = 200, usedCode = 200, token = "tok", throws = false } = {}) {
  const fetched = [];
  const gas = createGas({
    source: SOURCE + "\nvar Q_SELF_CHECK = { lineTokenProperty: 'MY_TOKEN' };",
    properties: token ? { MY_TOKEN: token } : {},
    fetch(url, opt) {
      fetched.push({ url, method: opt.method || "get", auth: opt.headers && opt.headers.Authorization });
      if (throws && /quota/.test(url)) throw new Error("DNS error");
      if (/\/v2\/bot\/message\/quota\/consumption$/.test(url)) return response(usedCode, used);
      if (/\/v2\/bot\/message\/quota$/.test(url)) return response(quotaCode, quota);
      if (/\/v2\/bot\/info$/.test(url)) return response(200, { displayName: "テストボット" });
      return response(404, {});
    }
  });
  const result = gas.call("qCheckAll");
  return { rows: result.results.filter((r) => r.area === "送信数"), fetched, logs: JSON.stringify(gas.logs || []) };
}

test("8割までは ✅ で「今月 ◯ 通 ／ 上限 ◯ 通（のこり ◯）」", () => {
  const { rows } = quotaRows({ quota: { type: "limited", value: 1000 }, used: { totalUsage: 120 } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].level, "✅");
  assert.equal(rows[0].text, "今月 120 通 ／ 上限 1,000 通（のこり 880）");
});

test("8割をこえたら ⚠️、上限に着いたら ❌", () => {
  assert.equal(quotaRows({ used: { totalUsage: 161 } }).rows[0].level, "⚠️");
  const full = quotaRows({ used: { totalUsage: 200 } }).rows[0];
  assert.equal(full.level, "❌");
  assert.match(full.text, /のこり 0/);
});

test("上限なし（従量のプラン）は ✅ で「上限なし」", () => {
  const row = quotaRows({ quota: { type: "none" }, used: { totalUsage: 5000 } }).rows[0];
  assert.equal(row.level, "✅");
  assert.equal(row.text, "今月 5,000 通（上限なし）");
});

test("鍵がないとき・読めないとき・つながらないときは ⚠️ と理由（点検は止めない）", () => {
  assert.match(quotaRows({ token: "" }).rows[0].text, /鍵がない/);
  assert.match(quotaRows({ usedCode: 401 }).rows[0].text, /読めませんでした（401）/);
  const broken = quotaRows({ throws: true });
  assert.equal(broken.rows[0].level, "⚠️");
  assert.match(broken.rows[0].text, /読めませんでした/);
});

test("読むだけ（GET を1回ずつ）。鍵は行に出さない", () => {
  const { rows, fetched } = quotaRows();
  const quotaCalls = fetched.filter((f) => /quota/.test(f.url));
  assert.equal(quotaCalls.length, 2);
  assert.ok(quotaCalls.every((f) => f.method === "get" && f.auth === "Bearer tok"));
  assert.ok(!JSON.stringify(rows).includes("tok"));
  assert.ok(!fetched.some((f) => /\/message\/(push|reply|multicast|broadcast)/.test(f.url)));
});

test("quota: false なら見ない", () => {
  const gas = createGas({ source: SOURCE + "\nvar Q_SELF_CHECK = { lineTokenProperty: 'T', quota: false };", properties: { T: "x" }, fetch: () => response(200, {}) });
  assert.deepEqual(gas.call("qCheckAll").results.filter((r) => r.area === "送信数"), []);
});
