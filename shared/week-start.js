// カレンダーの週のはじまり（Q ツール共通）。1＝月曜（既定）、0＝日曜。
// この端末に1つだけ残す（localStorage の qlove:weekStart）。同じ katsuan.github.io のツールなら、どれで変えてもほかのツールも同じになる。
//
// 使い方：自分の script より前に
//   <script src="https://katsuan.github.io/line-share/shared/week-start.js"></script> → window.QWeekStart
//   QWeekStart.get(fallback) … 共通の設定。まだない・読めない・変な値なら fallback（ツールが前から持っている自分の設定。0 か 1）、それもなければ月曜
//   QWeekStart.set(value)    … 0 なら日曜、それ以外は月曜として残す。残せない端末でも、開いているあいだは各ツールの値で動く
// 読めなかったとき（電波がなく、まだ保存もないなど）に備えて、各ツールは window.QWeekStart がなくても動くようにしておく
var QWeekStart = (function () {
  "use strict";

  var KEY = "qlove:weekStart";
  var MONDAY = 1;

  // 0・1（数でも文字でも）なら数、ほかは null
  function normal(value) {
    return value === 0 || value === "0" ? 0 : value === 1 || value === "1" ? 1 : null;
  }

  // 使う保存場所（テストでは opts.storage）
  function storage(opts) {
    if (opts && opts.storage) return opts.storage;
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  // opts.storage はテスト用（getItem・setItem を持つもの）
  function get(fallback, opts) {
    var own = normal(fallback);
    try {
      var saved = normal(storage(opts).getItem(KEY));
      if (saved !== null) return saved;
    } catch (e) {
      // 読めない端末では、ツールの値か月曜
    }
    return own === null ? MONDAY : own;
  }

  // 週のはじまりを端末に残す（0 なら日曜、ほかは月曜）。残した値を返す
  function set(value, opts) {
    var v = normal(value) === 0 ? 0 : 1;
    try {
      storage(opts).setItem(KEY, String(v));
    } catch (e) {
      // 残せない端末でも、開いているあいだは使える
    }
    return v;
  }

  return { KEY: KEY, get: get, set: set };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QWeekStart;
else if (typeof window !== "undefined") window.QWeekStart = QWeekStart;
