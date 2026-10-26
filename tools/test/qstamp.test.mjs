// tools/qstamp.py（?v= を付けなおす道具）のテスト：付ける番号は、今ある番号より必ず大きい。
//   node --test tools/test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const QSTAMP = path.join(path.dirname(fileURLToPath(import.meta.url)), "../qstamp.py");

// フォルダに HTML と読むファイルを置いて qstamp.py を動かし、付いた HTML を返す
function stamp(html, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qstamp-"));
  for (const [name, text] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.writeFileSync(path.join(dir, "app.js"), "");
  fs.writeFileSync(path.join(dir, "style.css"), "");
  execFileSync("python3", [QSTAMP, "index.html"], { cwd: dir, stdio: "ignore" });
  return fs.readFileSync(path.join(dir, "index.html"), "utf8");
}

// HTML の中の ?v= の数
const versions = (html) => [...html.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));

test("今ある番号が時刻より大きくても（先の日時・手で付けた番号）、それより大きい番号を付ける", () => {
  const out = versions(stamp('<script src="app.js?v=209912312359"></script><link rel="stylesheet" href="style.css?v=1">'));
  assert.deepEqual(out, [209912312360, 209912312360]);
});

test("ふだんは日本時間の年月日時分（今ある番号より大きい）", () => {
  const out = versions(stamp('<script src="app.js?v=202001010000"></script>'));
  const now = new Date(Date.now() + 9 * 3600e3).toISOString().replace(/\D/g, "").slice(0, 12);
  assert.ok(out[0] >= Number(now) - 1, `${out[0]} は ${now} ぐらい`);
});

test("テスト・道具の中の見本の番号は数えない", () => {
  const out = versions(stamp('<script src="app.js?v=202001010000"></script>', { "test/a.test.js": '"app.js?v=209912312359"', "tools/x.js": '"a.js?v=209912312359"' }));
  assert.ok(out[0] < 209912312359, String(out[0]));
});
