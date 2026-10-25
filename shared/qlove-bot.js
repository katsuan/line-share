// くらぶボット（仮）の URL（Q ツール共通）。使う人が自分で作った「くらぶボット」（配布用シートのコピー）の受け口の URL を、
// この端末に1つだけ残す（localStorage の qlove:bot）。同じ katsuan.github.io のツールなら、どれで入れてもほかのツールも読める。
// LINE の中（LIFF）と Safari などのブラウザは、別の保存場所なので、それぞれで入れる（案内にもそう書く）。
//
// 残すのは URL だけ（合言葉・ID トークンは残さない。docs/security.md の W7）。URL を知られても、
// くらぶボットは LINE に確かめた本人（つなぐ番号でひもづけた人）の呼び出ししか受けない。
//
// 使い方：自分の script より前に
//   <script src="https://katsuan.github.io/line-share/shared/qlove-bot.js"></script> → window.QloveBotLink
//   QloveBotLink.get()               … 入れてある URL（なければ ""）
//   QloveBotLink.set(text)           … URL を確かめて残す → { ok: true, url } / { ok: false, error: "url" | "save" }
//   QloveBotLink.clear()             … 消す
//   QloveBotLink.call(tool, action, payload)  … くらぶボットを呼ぶ（Promise。{ ok, … }。つながらなければ { ok: false, error: "net" }）
//     payload に liffId・idToken を入れる（LIFF のツールだけ。くらぶボットの lib/05_tool_api.gs）。ここには残さない
//   QloveBotLink.ping(url?)          … URL が合っているか（{ ok, bot, version, modules }）。入れる前の確かめに
var QloveBotLink = (function () {
  "use strict";

  var KEY = "qlove:bot";
  // GAS のウェブアプリの URL（…/exec）だけ。?key= などは付けない（Webhook の合言葉を入れてしまわないように）
  var URL_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/[A-Za-z0-9.-]+\/)?macros\/s\/[A-Za-z0-9_-]{20,120}\/exec$/;
  var TIMEOUT_MS = 15000;

  // 使う保存場所（テストでは opts.storage）
  function storage(opts) {
    if (opts && opts.storage) return opts.storage;
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  // くらぶボットの URL として使える形なら整えた URL、ほかは空
  function clean(text) {
    var url = String(text == null ? "" : text).trim();
    return URL_PATTERN.test(url) ? url : "";
  }

  // 形を確かめて読む（{ v: 1, url, at }）。壊れていたら ""
  function get(opts) {
    try {
      var saved = JSON.parse(storage(opts).getItem(KEY) || "null");
      return saved && saved.v === 1 ? clean(saved.url) : "";
    } catch (e) {
      return "";
    }
  }

  // くらぶボットの URL を端末に残す。{ ok, error }
  function set(text, opts) {
    var url = clean(text);
    if (!url) return { ok: false, error: "url" };
    try {
      storage(opts).setItem(KEY, JSON.stringify({ v: 1, url: url, at: Date.now() }));
      return { ok: true, url: url };
    } catch (e) {
      return { ok: false, error: "save" };
    }
  }

  // くらぶボットの URL を消す
  function clear(opts) {
    try {
      storage(opts).removeItem(KEY);
    } catch (e) {
      // 消せない端末では、何もしない
    }
  }

  // text/plain で送る（GAS は CORS の下見（preflight）に答えられないため）
  function post(url, body, opts) {
    var f = (opts && opts.fetch) || (typeof fetch !== "undefined" ? fetch : null);
    if (!url || !f) return Promise.resolve({ ok: false, error: url ? "net" : "nourl" });
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return f(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (res) { return res.json(); })
      .then(function (json) { return json && typeof json === "object" && typeof json.ok === "boolean" ? json : { ok: false, error: "bad" }; })
      .catch(function () { return { ok: false, error: "net" }; })
      .then(function (out) {
        if (timer) clearTimeout(timer);
        return out;
      });
  }

  // くらぶボットに、ツールの出来事を送る
  function call(tool, action, payload, opts) {
    var body = { app: "qlove", v: 1, tool: String(tool), action: String(action) };
    Object.keys(payload || {}).forEach(function (k) {
      if (!(k in body)) body[k] = payload[k];
    });
    return post(get(opts), body, opts);
  }

  // くらぶボットにつながるか確かめる
  function ping(url, opts) {
    return post(url ? clean(url) : get(opts), { app: "qlove", v: 1, tool: "core", action: "ping" }, opts);
  }

  return { KEY: KEY, get: get, set: set, clear: clear, call: call, ping: ping };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QloveBotLink;
else if (typeof window !== "undefined") window.QloveBotLink = QloveBotLink;
