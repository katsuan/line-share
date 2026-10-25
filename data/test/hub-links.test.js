// ツールの一覧（data/hub-links.json）の言葉のテスト。HOME・くらぶのページ・紹介のシートにそのまま出る。
//   node --test data/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "../hub-links.json"), "utf8"));
const SHOWN = ["name", "copy", "desc", "lead", "intro", "lineWhy"]; // 画面に出る欄

// 画面の言葉に仕組みの言葉を出さない（docs/ux.md E2・G5）
test("画面に出る言葉に、仕組みの言葉（GAS・API・LIFF など）がない", () => {
  for (const item of DATA.items) {
    for (const key of SHOWN) {
      const text = item[key] || "";
      assert.doesNotMatch(text, /\b(GAS|API|LIFF|JSON|webhook)\b/i, `${item.key}.${key}：${text}`);
    }
  }
});

// LINE 版のよさ（lineWhy）は、紹介のシートで文として出るので「。」で終える
test("lineWhy は「。」で終わる", () => {
  for (const item of DATA.items.filter((it) => it.lineWhy)) {
    assert.match(item.lineWhy, /。$/, item.key);
  }
});

// 兼部（also）は、ある部の key だけ。元の部と同じにしない
test("兼部（also）は、ほかの部の key", () => {
  const groups = new Set(DATA.groups.map((g) => g.key));
  for (const item of DATA.items.filter((it) => it.also)) {
    for (const key of item.also) {
      assert.ok(groups.has(key), `${item.key} の also「${key}」がない`);
      assert.notStrictEqual(key, item.group, `${item.key} の also が元の部と同じ`);
    }
  }
});
