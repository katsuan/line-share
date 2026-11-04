// data/pressure-level.json の見本が、手本の決め方（tools/qtest/pressure-level.mjs）と合っているか
const test = require("node:test");
const assert = require("node:assert");

test("気圧の目安：見本の答えは、手本の決め方と同じ", async () => {
  const { SPEC, pressureLevel, checkPressureLevels } = await import("../../tools/qtest/pressure-level.mjs");
  assert.ok(SPEC.cases.length >= 5);
  assert.equal(checkPressureLevels(pressureLevel), SPEC.version);
});

test("気圧の目安：上がるだけのときは数えない・6時間で 4 hPa 下がれば警戒", async () => {
  const { pressureLevel } = await import("../../tools/qtest/pressure-level.mjs");
  const flatThenRise = Array.from({ length: 48 }, (_, t) => 1010 + Math.max(0, t - 12));
  assert.equal(pressureLevel(flatThenRise, 24), 0);
  const drop = Array.from({ length: 48 }, (_, t) => (t < 24 ? 1015 : 1011));
  assert.equal(pressureLevel(drop, 24), 4);
});

test("気圧の目安：決め方がちがえば、どこがちがうかを書いて落ちる", async () => {
  const { checkPressureLevels } = await import("../../tools/qtest/pressure-level.mjs");
  // 前の決め方（3時間前とくらべた変化）
  const old = (hpa, i) => {
    const ch = Math.abs(hpa[i] - hpa[Math.max(0, i - 3)]);
    return ch < 1 ? 0 : ch < 2 ? 2 : ch < 3 ? 3 : 4;
  };
  assert.throws(() => checkPressureLevels(old), /data\/pressure-level\.json/);
});
