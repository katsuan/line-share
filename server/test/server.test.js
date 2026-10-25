// 画像のアップロードのサーバー（server/）のテスト。手元でサーバーを立てて確かめる（Render には触らない）。
//   cd server && node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");

process.env.ALLOWED_ORIGIN = "https://katsuan.github.io";
process.env.PUBLIC_BASE_URL = "https://example.onrender.com";
process.env.UPLOADS_PER_MINUTE = "5";
const { app } = require("../index.js");

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ORIGIN = "https://katsuan.github.io";

let server;
let base;
const made = [];
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await Promise.all(made.map((name) => fs.rm(path.join(__dirname, "../uploads", name), { force: true })));
});

let ip = 0;
// 手元のサーバーに画像を送る（接続元は毎回変える。from で決められる）。{ status, data, headers }
async function upload(body, { origin = ORIGIN, from } = {}) {
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": from || `10.0.0.${(ip += 1)}` };
  if (origin) headers.Origin = origin;
  const res = await fetch(`${base}/api/upload`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (data.imageUrl) made.push(data.imageUrl.split("/").pop());
  return { status: res.status, data, headers: res.headers };
}

test("自分のページからの PNG は保存できる", async () => {
  const res = await upload({ imageData: PNG });
  assert.equal(res.status, 201);
  assert.match(res.data.imageUrl, /^https:\/\/example\.onrender\.com\/uploads\/\d+-[0-9a-f-]+\.png$/);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
});

test("ほかのサイトから・Origin なしでは保存できない", async () => {
  assert.equal((await upload({ imageData: PNG }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await upload({ imageData: PNG }, { origin: null })).status, 403);
});

test("PNG・JPEG 以外（名前だけ PNG の中身も）は保存しない", async () => {
  const html = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"); // qcheck-ok: W8 テストの見本の文字
  assert.equal((await upload({ imageData: html })).status, 400);
  assert.equal((await upload({ imageData: "data:image/svg+xml;base64,PHN2Zz4=" })).status, 400);
  assert.equal((await upload({ imageData: 123 })).status, 400);
});

test("大きすぎる本文・読めない本文は、中身を出さずに断る", async () => {
  const big = await upload({ imageData: "data:image/png;base64," + "A".repeat(11 * 1024 * 1024) });
  assert.equal(big.status, 413);
  const broken = await upload("{oops");
  assert.equal(broken.status, 400);
  assert.doesNotMatch(JSON.stringify(broken.data), /SyntaxError|at .*\.js/);
});

test("同じ接続元からの送りすぎは止める", async () => {
  const statuses = [];
  for (let i = 0; i < 7; i += 1) statuses.push((await upload({ imageData: PNG }, { from: "10.9.9.9" })).status);
  assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(statuses[6], 429);
});

test("保存した画像は nosniff を付けて、だれからでも読める", async () => {
  const { data } = await upload({ imageData: PNG });
  const res = await fetch(`${base}/uploads/${data.imageUrl.split("/").pop()}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});
