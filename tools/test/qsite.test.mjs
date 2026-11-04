// tools/qpublish.py の --site（Pages に出す写し）と --check-clean のテスト：テスト・作る道具・手元の設定・お試しの画面は出さない。
//   node --test tools/test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const QPUBLISH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../qpublish.py");

function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qsite-"));
  for (const name of files) {
    fs.mkdirSync(path.dirname(path.join(dir, "tool", name)), { recursive: true });
    fs.writeFileSync(path.join(dir, "tool", name), name.endsWith(".html") ? "<html></html>" : "x");
  }
  return dir;
}
const list = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();

test("写しには、出してよいものだけ入る", () => {
  const dir = tree([
    "index.html", "app.js", "js/link.js", "js/tools/pick.js", "shared/ui.css", ".nojekyll",
    "test/a.test.mjs", "shared/test/b.test.js", "js/c.test.js", "tools/icon.py", ".claude/settings.json",
    "AGENTS.md", "CLAUDE.md", "package.json", ".gitignore", ".github/workflows/pages.yml"
  ]);
  execFileSync("python3", [QPUBLISH, path.join(dir, "tool"), "--site", path.join(dir, "_site")], { encoding: "utf8" });
  assert.deepStrictEqual(list(path.join(dir, "_site")), [".nojekyll", "app.js", "index.html", "js/link.js", "js/tools/pick.js", "qpublish.json", "shared/ui.css"]);
});

test("--check-clean：出してはいけないもの（お試しの画面も）があれば止める。フォルダは名前だけ出す", () => {
  const dir = tree(["index.html", "test/a.test.mjs", "test/b.test.mjs", "mock/index.html", "preview-mock.html"]);
  const r = spawnSync("python3", [QPUBLISH, "--check-clean", path.join(dir, "tool")], { encoding: "utf8" });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /mock・preview-mock\.html・test$/m);
  const ok = tree(["index.html", "js/app.js"]);
  assert.strictEqual(spawnSync("python3", [QPUBLISH, "--check-clean", path.join(ok, "tool")]).status, 0);
});
