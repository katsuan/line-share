// 線アイコン（shared/icons/ と ui.css の .ls-icon）のテスト
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SHARED = path.join(__dirname, "..");
const names = fs.readdirSync(path.join(SHARED, "icons")).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
const css = fs.readFileSync(path.join(SHARED, "ui.css"), "utf8");

test("ui.css の線アイコンは shared/icons/ と合っている（tools/icons.py --check）", () => {
  execFileSync("python3", [path.join(SHARED, "..", "tools", "icons.py"), "--check"], { stdio: "pipe" });
});

test("線の太さ・大きさ・角は全部そろっている（Lucide の 24・2・round）", () => {
  for (const name of names) {
    const svg = fs.readFileSync(path.join(SHARED, "icons", `${name}.svg`), "utf8");
    assert.match(svg, /viewBox="0 0 24 24"/, name);
    assert.match(svg, /stroke-width="2"/, name);
    assert.match(svg, /stroke-linecap="round"/, name);
    assert.match(svg, /fill="none"/, name);
  }
});

test("ライセンスの表記がある（Lucide・ISC）", () => {
  const license = fs.readFileSync(path.join(SHARED, "icons", "LICENSE"), "utf8");
  assert.match(license, /Lucide/);
  assert.match(license, /ISC License/);
});

test("キットの中で使っているアイコンの名前は、全部ある", () => {
  const used = new Set();
  for (const file of fs.readdirSync(SHARED).filter((f) => /\.(js|css|html)$/.test(f))) {
    const text = fs.readFileSync(path.join(SHARED, file), "utf8");
    for (const m of text.matchAll(/data-icon="([a-z-]+)"/g)) used.add(m[1]);
    for (const m of text.matchAll(/\bicon\("([a-z-]+)"\)|iconHtml\("([a-z-]+)"\)|iconEl\("([a-z-]+)"\)/g)) used.add(m[1] || m[2] || m[3]);
    for (const m of text.matchAll(/var\(--ls-i-([a-z-]+)\)/g)) used.add(m[1]);
    for (const m of text.matchAll(/iconName: "([a-z-]+)"/g)) used.add(m[1]);
  }
  used.delete("i"); // .ls-icon の var(--ls-i)
  const missing = [...used].filter((name) => !names.includes(name));
  assert.deepStrictEqual(missing, []);
  assert.ok(used.size >= 15, `使っている数 ${used.size}`);
});

test("背景にグラデーションを使わない（透明を表す市松模様だけはよい）", () => {
  const lines = css.split("\n").filter((line) => /gradient\(/.test(line));
  assert.ok(lines.every((line) => /linear-gradient\((-?45deg), (#e9e7e1 25%, transparent 25%|transparent 75%, #e9e7e1 75%)\)/.test(line)), lines.join("\n"));
});
