// tools/qtest/check-code.mjs の、同じまちがいを止める確かめ（V1 ?v= が小さくなった・V2 説明の文の折り返し）のテスト。
//   node --test tools/test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkCode } from "../qtest/check-code.mjs";

// 空のフォルダを作り、files（{ 名前: 中身 }）を書く
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcheck-"));
  write(dir, files);
  return dir;
}

// フォルダにファイルを書く
function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
}

// git のコマンドを動かす（名前とメールはテスト用）
function git(dir, ...args) {
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { stdio: "ignore" });
}

// 見つけたものの番号だけ
const ids = (dir) => checkCode(dir).map((f) => f.id);

test("V2：説明の文（p・li・.ls-hint・○○-lead）に auto-phrase・pretty を付けたら見つける", () => {
  const dir = folder({
    "style.css": ".ls-hint { word-break: auto-phrase; }\np, li { text-wrap: pretty; }\n.hub-lead { word-break: auto-phrase; }\n",
    "index.html": "<style>\n.card .note { text-wrap: pretty; }\n</style>"
  });
  assert.deepEqual(ids(dir), ["V2", "V2", "V2", "V2"]);
});

test("V2：見出し・ラベル・ボタンの auto-phrase・balance と、コメントの中は見ない", () => {
  const dir = folder({
    "style.css": "/* p { text-wrap: pretty } */\nh1, .ls-button, .ls-tip-ok, summary { word-break: auto-phrase; text-wrap: balance; }\np { line-break: strict; }\n"
  });
  assert.deepEqual(ids(dir), []);
});

test("V1：?v= が前のコミットより小さくなったら見つける（手元で直したファイルは HEAD と、ほかは1つ前と比べる）", () => {
  const dir = folder({ "index.html": '<script src="./app.js?v=202610261200"></script><link rel="stylesheet" href="style.css?v=20261026">' });
  git(dir, "init", "-q");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "1");
  // 手元で小さくした（UTC で付けた番号のように）
  write(dir, { "index.html": '<script src="./app.js?v=202610260300"></script><link rel="stylesheet" href="style.css?v=202610261300">' });
  assert.deepEqual(ids(dir), ["V1"]);
  // コミットしたあとも、1つ前と比べて見つける
  git(dir, "commit", "-qam", "2");
  assert.deepEqual(ids(dir), ["V1"]);
  // 大きくすれば出ない
  write(dir, { "index.html": '<script src="./app.js?v=202610261201"></script><link rel="stylesheet" href="style.css?v=202610261300">' });
  assert.deepEqual(ids(dir), []);
});

test("V1：git のないフォルダでは見ない", () => {
  assert.deepEqual(ids(folder({ "index.html": '<script src="app.js?v=1"></script>' })), []);
});

test("おくるん自身に、同じまちがい（V1・V2）がない", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  assert.deepEqual(checkCode(root).filter((f) => ["V1", "V2"].includes(f.id)), []);
});
