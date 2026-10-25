// お知らせカードの「前の名前のファイル」（2026-11-25 に消す。README）が、新しいファイルと同じ中身かを確かめる。
// LINE の中のブラウザが前の HTML を覚えているときに読まれるので、片方だけ直すと、古い画面だけ動きがずれる。
//   node --test card/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const CARD = path.join(__dirname, "..");
// 前の名前 → 新しい名前（card/ からの道筋）
const PAIRS = {
  "js/main.js": "app.js",
  "js/core.js": "js/config.js",
  "js/storage.js": "js/store.js",
  "js/flex.js": "js/card.js"
};

// 前の名前のファイルは、1行目の「前の名前（…に消す）」の説明を除けば、新しいファイルと同じ
for (const [oldName, newName] of Object.entries(PAIRS)) {
  test(`card/${oldName} は card/${newName} の写し`, () => {
    const oldPath = path.join(CARD, oldName);
    if (!fs.existsSync(oldPath)) return; // 消したあとは確かめない
    const [head, ...rest] = fs.readFileSync(oldPath, "utf8").split("\n");
    assert.match(head, /前の名前/);
    assert.strictEqual(rest.join("\n"), fs.readFileSync(path.join(CARD, newName), "utf8"), `card/${newName} を直したら card/${oldName} にも写してね`);
  });
}
