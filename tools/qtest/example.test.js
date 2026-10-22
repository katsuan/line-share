// テストの書き方の見本（Q のツール共通）。各リポジトリの test/ にコピーして、名前と中身を合わせる。
//   node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { createGas, checkMessages } = require(path.join(__dirname, "fake-gas.js"));

// 見本の GAS（本当は createGas({ dir: path.join(__dirname, "../gs") }) のように、リポジトリの GAS を読む）
const SOURCE = `
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.events) {
    if (e.parameter.key !== PropertiesService.getScriptProperties().getProperty('WEBHOOK_KEY')) return out({ ok: true });
    body.events.forEach(function (ev) {
      var name = ev.message.text;
      SpreadsheetApp.getActive().getSheetByName('logs').appendRow([new Date(), safeCell(name)]);
      reply(ev.replyToken, [{ type: 'text', text: '記録しました' }]);
    });
    return out({ ok: true });
  }
  if (!body.idToken) return out({ ok: false, error: 'LINE で開きなおしてね' });
  return out({ ok: true });
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function reply(token, messages) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ replyToken: token, messages: messages }) });
}
function safeCell(v) { return typeof v === 'string' && /^[=+\\-@]/.test(v) ? "'" + v : v; }
`;

const make = () => {
  const gas = createGas({ source: SOURCE, properties: { WEBHOOK_KEY: "secret" } });
  gas.seed("logs", [["at", "name"]]);
  return gas;
};

test("画面から：本人確認の印がない呼び出しは断る", () => {
  const gas = make();
  assert.equal(gas.doPost({ action: "x" }).ok, false);
  assert.equal(gas.doPost({ action: "x", idToken: "t" }).ok, true);
});

test("LINE から：合言葉がちがう知らせは何もしない", () => {
  const gas = make();
  gas.lineEvent({ type: "message", replyToken: "r", message: { type: "text", text: "パン" } }, { key: "wrong" });
  assert.equal(gas.rows("logs").length, 1);
  assert.equal(gas.replies().length, 0);
});

test("LINE から：外の文字は式のままシートに入らない", () => {
  const gas = make();
  gas.lineEvent({ type: "message", replyToken: "r", message: { type: "text", text: '=HYPERLINK("https://example.com","x")' } }, { key: "secret" });
  assert.deepEqual(gas.formulaCells(), []);
  assert.equal(gas.rows("logs")[1][1], '\'=HYPERLINK("https://example.com","x")');
});

test("返事のカードは LINE が受けつける形", () => {
  const gas = make();
  gas.lineEvent({ type: "message", replyToken: "r", message: { type: "text", text: "パン" } }, { key: "secret" });
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
  // 断られる形の見本
  const bad = checkMessages([{ type: "flex", altText: "x", contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "a", color: "red" }] } } }]);
  assert.equal(bad[0].level, "error");
});
