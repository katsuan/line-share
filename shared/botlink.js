// ボットとつなぐ（Q キット）：LINE 版（LIFF）で開いたツールを、使う人が自分で作ったボット（GAS）とつなぐための共通の部品。
// つづく（記録ボット＝LOgBOT）・しょくじ（食事記録ボット）が使う。中身は1か所で、ツールごとの違い（つなぎ先の名前・送る中身・
// 案内の文）は、呼ぶときの設定で渡す。
//
// 中にあるもの（window.QBotLink）
//   cleanUrl(text)                 … GAS のウェブアプリの URL（…/exec）なら整えた URL、ほかは ""（?key= などは受けない）
//   inLineApp(ua?)                 … LINE のアプリの中か（ブラウザでは LIFF の SDK も読まない）
//   target({ own, tool })          … つなぎ先を決める（Promise）→ { url, legacy } / null（下の「つなぎ先の決め方」）
//   start({ liffId, url, tool, legacyApp }) … LINE 版でログインしていれば、送る口（client）を返す（Promise）。ほかは null
//   makeClient(url, getIdToken, opts)       … 送る口を作る（テストでは fetch・ID トークンを差しかえる）
//   body(tool, action, payload, opts)       … ボットに送る中身（下の「送る形」）
//   outbox(key, opts)              … 送れなかったものを端末に覚えて、次に開いたときに送りなおすための箱
//   guide(opts)                    … 「📱 LINE 版で使う」の案内と4コマ（ブラウザ版で、閉じていなければ）
//   reopenHidden({ client, url, ua }) … 「LINE 版で開きなおす」を隠すか（ボットにつないだ人が、LINE のふつうのブラウザで開いたときだけ出す）
//
// 送る形（ボットとのやりとり）
//   くらぶボットの形：{ app: "qlove", v: 1, tool, action, liffId, idToken, … }（くらぶボットの lib/03_tool_api.gs）
//   前の形（legacyApp を渡したとき）：{ app: legacyApp, v: 1, op: action, tool, action, liffId, idToken, … }
//     記録ボット（LOgBOT）のすでに配ったコピーが受けるのは app: "tuzuq" と op だけなので、ツールごとの自分のボットには前の形で送る。
//     新しい LOgBOT・食事記録ボットは、どちらの形も受ける
//   返事は { ok: true, … } / { ok: false, error }。送れなかったときは error: "net"、ID トークンがないときは "auth"
//
// つなぎ先の決め方（target）
//   1. そのツールに自分で入れた URL（own。つづくの「⚙️ 記録ボットとつなぐ」など）があれば、それ（前の形で送る）
//   2. なければ、くらぶボットの URL（shared/qlove-bot.js の qlove:bot）。ただし、くらぶボットに聞いて（ping の modules）、
//      そのツールの機能があるときだけ（くらぶボットの形で送る）。答えは1時間、このタブに覚える
//   ツールごとの URL を先にするのは、くらぶボットに合流する前から使っている人のつなぎ先を、知らないうちに変えないため。
//   くらぶボットに機能があるかを確かめるのは、まだ合流していないうちに送って、毎回「うまくいかない」と出さないため
//
// 守ること（q-oqrn/docs/security.md）
//   - ボットに送るのは LIFF の ID トークンだけ（だれかはボットが LINE に確かめる）。トークンは端末に残さない（W7）
//   - つなぎ先は、使う人が自分で入れた URL か、ツールに書いた決まった URL だけ（ページの URL の ?〜 からは受けとらない。W5・W9）
//   - 送れなかったものの箱（outbox）に残すのは、ツールが渡した中身だけ（ID トークンは入れない）
//
// 使い方：ツールの HTML で、自分の script より前に
//   <script src="https://katsuan.github.io/line-share/shared/qlove-bot.js"></script>（くらぶボットにつなぐときだけ。なければ 2 を飛ばす）
//   <script src="https://katsuan.github.io/line-share/shared/botlink.js"></script> → window.QBotLink
// テストは shared/test/botlink.test.js。つづく・しょくじのテストも、この部品を読んで動かす
var QBotLink = (function () {
  "use strict";

  var SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var TIMEOUT_MS = 15000;
  var INIT_TIMEOUT_MS = 10000;
  var URL_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/[A-Za-z0-9.-]+\/)?macros\/s\/[A-Za-z0-9_-]{10,120}\/exec$/;
  var TOOL_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
  var PING_CACHE_MS = 3600000;

  /** GAS のウェブアプリの URL（…/exec）なら整えた URL、ほかは "" */
  function cleanUrl(text) {
    var url = String(text == null ? "" : text).trim();
    return URL_PATTERN.test(url) ? url : "";
  }

  /** LINE のアプリの中か（LIFF でなくても、LINE のふつうのブラウザなら true） */
  function inLineApp(ua) {
    var text = ua == null ? (typeof navigator !== "undefined" ? navigator.userAgent : "") : ua;
    return /\bLine\//i.test(String(text || ""));
  }

  /** ボットに送る中身（くらぶボットの形。legacyApp を渡すと前の形も入れる） */
  function body(tool, action, payload, opts) {
    var o = opts || {};
    var out = o.legacyApp
      ? { app: String(o.legacyApp), v: 1, op: String(action), tool: String(tool), action: String(action) }
      : { app: "qlove", v: 1, tool: String(tool), action: String(action) };
    if (o.liffId) out.liffId = String(o.liffId);
    if (o.idToken) out.idToken = String(o.idToken);
    Object.keys(payload || {}).forEach(function (k) {
      if (!(k in out)) out[k] = payload[k];
    });
    return out;
  }

  /**
   * 送る口を作る。client.call(action, payload, { keepalive }) → Promise<{ ok, … }>
   * opts：{ tool, liffId, legacyApp, fetch, mapError(error) }（mapError：ボットの error をツールの短い印にする）
   */
  function makeClient(url, getIdToken, opts) {
    var o = opts || {};
    var f = o.fetch || (typeof fetch !== "undefined" ? function (a, b) { return fetch(a, b); } : null);
    var target = cleanUrl(url);
    function call(action, payload, callOpts) {
      var idToken = "";
      try {
        idToken = String(getIdToken() || "");
      } catch (e) {
        idToken = "";
      }
      if (!idToken) return Promise.resolve({ ok: false, error: "auth" });
      if (!target || !f) return Promise.resolve({ ok: false, error: "net" });
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
      var sent = body(o.tool, action, payload, { legacyApp: o.legacyApp, liffId: o.liffId, idToken: idToken });
      // text/plain なら、GAS に前もっての問い合わせ（preflight）がいらない
      return Promise.resolve()
        .then(function () {
          return f(target, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(sent),
            keepalive: !!(callOpts && callOpts.keepalive),
            signal: ctrl ? ctrl.signal : undefined,
            credentials: "omit",
            referrerPolicy: "no-referrer"
          });
        })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (!json || typeof json !== "object") return { ok: false, error: "net" };
          if (json.ok === true) return json;
          var error = typeof o.mapError === "function" ? o.mapError(json.error) : json.error;
          return Object.assign({}, json, { ok: false, error: String(error || "fail") });
        })
        .catch(function () { return { ok: false, error: "net" }; })
        .then(function (out) {
          if (timer) clearTimeout(timer);
          return out;
        });
    }
    return { call: call, url: target, legacy: !!o.legacyApp };
  }

  /** LIFF の SDK を読みこむ（もう読んでいれば、そのまま） */
  function loadSdk() {
    if (typeof window !== "undefined" && window.liff) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = SDK;
      s.charset = "utf-8";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("sdk")); };
      document.head.appendChild(s);
    });
  }

  /**
   * LINE 版（LIFF）でログインしていれば、送る口を返す。ブラウザ・URL がない・つながらないときは null
   * opts：{ liffId, url, tool, legacyApp, mapError }
   */
  function start(opts) {
    var o = opts || {};
    var liffId = String(o.liffId || "");
    if (!liffId || !cleanUrl(o.url) || !inLineApp()) return Promise.resolve(null);
    return loadSdk()
      .then(function () {
        return Promise.race([
          window.liff.init({ liffId: liffId }),
          new Promise(function (_, no) { setTimeout(function () { no(new Error("timeout")); }, INIT_TIMEOUT_MS); })
        ]);
      })
      .then(function () {
        if (!window.liff.isInClient() || !window.liff.isLoggedIn()) return null;
        return makeClient(o.url, function () { return window.liff.getIDToken() || ""; }, { tool: o.tool, liffId: liffId, legacyApp: o.legacyApp, mapError: o.mapError });
      })
      .catch(function (error) {
        if (typeof console !== "undefined") console.error(error);
        return null;
      });
  }

  /** このタブに覚えた ping の答え（くらぶボットに、そのツールの機能があるか） */
  function pingMemo(opts) {
    if (opts && opts.session) return opts.session;
    try {
      return typeof sessionStorage !== "undefined" ? sessionStorage : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * つなぎ先を決める（上の「つなぎ先の決め方」）。→ Promise<{ url, legacy } | null>
   * opts：{ own（ツールに入れた URL）, tool, qlove（テスト用：QloveBotLink の代わり）, session, fetch }
   */
  function target(opts) {
    var o = opts || {};
    var own = cleanUrl(o.own);
    if (own) return Promise.resolve({ url: own, legacy: true });
    var Q = o.qlove || (typeof window !== "undefined" ? window.QloveBotLink : null);
    var tool = String(o.tool || "");
    if (!Q || !TOOL_PATTERN.test(tool)) return Promise.resolve(null);
    var url = cleanUrl(Q.get());
    if (!url) return Promise.resolve(null);
    var memo = pingMemo(o);
    var memoKey = "qbotlink:ping:" + url;
    try {
      var saved = memo && JSON.parse(memo.getItem(memoKey) || "null");
      if (saved && Date.now() - saved.at < PING_CACHE_MS && Array.isArray(saved.modules)) {
        return Promise.resolve(saved.modules.indexOf(tool) >= 0 ? { url: url, legacy: false } : null);
      }
    } catch (e) {
      // 覚えた答えが読めなければ、聞きなおす
    }
    return Promise.resolve(Q.ping(url, o.fetch ? { fetch: o.fetch } : undefined))
      .then(function (res) {
        var modules = res && res.ok && Array.isArray(res.modules) ? res.modules.map(String) : null;
        if (!modules) return null;
        try {
          if (memo) memo.setItem(memoKey, JSON.stringify({ at: Date.now(), modules: modules }));
        } catch (e) {
          // 覚えられなくても、つなぎ先は返す
        }
        return modules.indexOf(tool) >= 0 ? { url: url, legacy: false } : null;
      })
      .catch(function () { return null; });
  }

  /**
   * 送れなかったものの箱（端末に残す。ID トークンは入れない）。
   * box.put(id, item)・box.drop(id)・box.all() → [{ id, item, at }]（古い順）。max をこえたら古いものから捨てる
   * opts：{ storage, max（既定 100）, days（既定 14。これより古いものは捨てる） }
   */
  function outbox(key, opts) {
    var o = opts || {};
    var max = Number(o.max) || 100;
    var keepMs = (Number(o.days) || 14) * 86400000;
    function store() {
      if (o.storage) return o.storage;
      try {
        return typeof localStorage !== "undefined" ? localStorage : null;
      } catch (e) {
        return null;
      }
    }
    function read() {
      try {
        var list = JSON.parse(store().getItem(key) || "[]");
        var now = Date.now();
        return Array.isArray(list) ? list.filter(function (x) { return x && typeof x.id === "string" && now - Number(x.at) < keepMs; }) : [];
      } catch (e) {
        return [];
      }
    }
    function write(list) {
      try {
        if (list.length) store().setItem(key, JSON.stringify(list.slice(-max)));
        else store().removeItem(key);
      } catch (e) {
        // 残せない端末では、いま送れなかった分はあきらめる（画面の記録は残っている）
      }
    }
    return {
      put: function (id, item) {
        var list = read().filter(function (x) { return x.id !== String(id); });
        list.push({ id: String(id), item: item, at: Date.now() });
        write(list);
      },
      drop: function (id) {
        write(read().filter(function (x) { return x.id !== String(id); }));
      },
      all: function () {
        return read();
      }
    };
  }

  /** 「LINE 版で開きなおす」を隠すか（ボットにつないだ人が、LINE のふつうのブラウザで開いて、つながらなかったときだけ出す） */
  function reopenHidden(opts) {
    var o = opts || {};
    return !!o.client || !cleanUrl(o.url) || !inLineApp(o.ua);
  }

  /**
   * 「📱 LINE 版で使う」の案内と4コマ（ブラウザ版で、閉じていなければ出す。閉じたらその端末では出さない）
   * opts：{ key（閉じたかを覚えるキー）, openUrl（LINE 版の URL）, say(text), closedText（閉じたときの知らせ）,
   *         panel = "lineGuidePanel", outside = "lineOutside" }（ページには [data-close-line-guide]・[data-show-line-guide] のボタン）
   */
  function guide(opts) {
    var o = opts || {};
    var panel = document.getElementById(o.panel || "lineGuidePanel");
    var outside = document.getElementById(o.outside || "lineOutside");
    if (!panel) return;
    var inside = inLineApp();
    var off = false;
    try {
      off = localStorage.getItem(o.key) === "1";
    } catch (e) {
      off = false;
    }
    function show(open) {
      panel.hidden = inside || !open;
    }
    function remember(value) {
      try {
        if (value) localStorage.setItem(o.key, "1");
        else localStorage.removeItem(o.key);
      } catch (e) {
        // 残せなくても、いまは閉じる・開く
      }
    }
    show(!off);
    // 「LINE 版で開く」は、おくるんの共通の案内に（読みこめなければ、ふつうのリンク）
    if (!inside && outside) {
      var shown = window.LineShareLiff && window.LineShareLiff.outsideHelp && window.LineShareLiff.outsideHelp(outside, { appUrl: function () { return o.openUrl; }, canLogin: false });
      if (!shown) {
        var a = document.createElement("a");
        a.className = "ls-button line is-block";
        a.href = String(o.openUrl || "");
        a.textContent = "📱 LINE 版で開く";
        outside.replaceChildren(a);
      }
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-close-line-guide]"), function (b) {
      b.addEventListener("click", function () {
        show(false);
        remember(true);
        if (typeof o.say === "function" && o.closedText) o.say(o.closedText);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-show-line-guide]"), function (b) {
      b.addEventListener("click", function () {
        remember(false);
        panel.hidden = false; // LINE 版の中でも見られるように
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  return { cleanUrl: cleanUrl, inLineApp: inLineApp, body: body, makeClient: makeClient, start: start, target: target, outbox: outbox, reopenHidden: reopenHidden, guide: guide };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QBotLink;
else if (typeof window !== "undefined") window.QBotLink = QBotLink;
