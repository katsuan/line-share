// LINE 版の「わたし」（Q キット）：LINE 版（LIFF）で開いたとき、見出しの右に本人の LINE のアイコン（なければ名前の頭の字）を出す。
// 押すと小さなシートで、だれでログインしているか・ボットとつながっているか・まだ送っていない記録・ブラウザ版との記録のちがいがわかる。
// まだ送っていない記録があるときは、アイコンの右上に数の印。電波がもどったら（online）、ツールの retry を呼んで送りなおす。
// つづく・しょくじが使う（キロっくは自分の js/liff.js・user-avatar-button で同じ見た目。あとでこの部品に寄せられる）。
//
// 中にあるもの（window.QLineMe）
//   mount(opts) → { update() } / null（ブラウザ版では何も出さない）
//     opts：{ liffId, host（アイコンを入れる場所。既定は .ls-brand）, botName（例「くらぶボット」）,
//             connected()（ボットとつながっているか）, pending()（まだ送っていない記録の数）,
//             retry()（電波がもどったとき・「いま送る」で呼ぶ。Promise でもよい）, onSettings()（「⚙️ ○○とつなぐ」を押したとき） }
//     ボットにつながないツール（キロっく）向け：
//       bot: false … 「ボットとつながっているか」「まだ送っていない数」の行と数の印を出さない
//       show: true … ブラウザ版でも出す（灰色のふち。キロっくはアイコンから設定を開くため）
//       ready … LIFF を起こした約束（ツールが自分で起こすとき。なければ botlink.js の liffReady）
//       initial … 前にツールが覚えていた名前とアイコン（{ name, picture }。qlove:me がまだないときに使う）
//       onOpen(handle) … 押したときにツールのシートを開く（部品のシートは出さない）。handle.status() で { me, loggedIn }
//     → { update(), status() }
//   describe(state) … シートに出す行（テストで中身を確かめる）
//   readMe(storage)・saveMe(profile, storage) … 端末に残した名前とアイコンの URL
//   initial(name) … 名前の頭の字（アイコンがないとき）
//
// 守ること（q-oqrn/docs/security.md）
//   - 端末に残すのは、表示に使う名前とアイコンの URL だけ（localStorage の qlove:me。LINE の ID・ID トークンは残さない。W7）
//   - アイコンの URL は https の画像だけ使う。名前は文字として入れる（textContent。HTML にしない）
//   - 開いてすぐ出す（B1）：前に残した名前・アイコンで先に描き、LIFF の答えが来たら描きなおす
//
// 使い方：ツールの HTML で、自分の script より前に botlink.js のあとで
//   <script src="https://katsuan.github.io/line-share/shared/line-me.js?v=…" defer></script> → window.QLineMe
// LIFF を起こすのは shared/botlink.js の liffReady（ボットとのつなぎと同じ約束を待つ）
// テストは shared/test/line-me.test.js
var QLineMe = (function () {
  "use strict";

  var KEY = "qlove:me";
  var PICTURE = /^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>()]{1,500}$/;

  /** 端末の保存場所（テストでは渡す） */
  function store(storage) {
    if (storage) return storage;
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch (e) {
      return null;
    }
  }

  /** 名前とアイコンの URL を、表示に使える形にそろえる（ほかのものは捨てる） */
  function clean(profile) {
    var p = profile && typeof profile === "object" ? profile : {};
    var name = String(p.name == null ? (p.displayName == null ? "" : p.displayName) : p.name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
    var picture = String(p.picture == null ? (p.pictureUrl == null ? "" : p.pictureUrl) : p.picture).trim();
    return { name: name, picture: PICTURE.test(picture) ? picture : "" };
  }

  /** 前に残した名前とアイコン（なければ null） */
  function readMe(storage) {
    try {
      var saved = JSON.parse(store(storage).getItem(KEY) || "null");
      if (!saved || saved.v !== 1) return null;
      var me = clean(saved);
      return me.name || me.picture ? me : null;
    } catch (e) {
      return null;
    }
  }

  /** 名前とアイコンの URL だけを残す */
  function saveMe(profile, storage) {
    var me = clean(profile);
    try {
      store(storage).setItem(KEY, JSON.stringify({ v: 1, name: me.name, picture: me.picture, at: Date.now() }));
    } catch (e) {
      // 残せなくても、いまの表示はする
    }
    return me;
  }

  /** 名前の頭の字（絵文字も1つ）。名前がなければ 👤 */
  function initial(name) {
    var text = String(name || "").trim();
    if (!text) return "👤";
    try {
      var seg = new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)[Symbol.iterator]().next().value;
      return seg ? seg.segment : text.charAt(0);
    } catch (e) {
      return Array.from(text)[0] || "👤";
    }
  }

  /**
   * シートに出す行（文字だけ）
   * state：{ me（{ name, picture } か null）, loggedIn, connected, pending, botName, online, bot（false ならボットの行を出さない）, moveHint（記録のうつし方。既定は「🔒 記録の控え」） }
   */
  function describe(state) {
    var s = state || {};
    var bot = String(s.botName || "ボット");
    var n = Math.max(0, Number(s.pending) || 0);
    var rows = [];
    rows.push(s.loggedIn
      ? { icon: "✅", text: (s.me && s.me.name ? s.me.name + " さん" : "LINE") + "でログインしています" }
      : { icon: "👤", text: "まだ LINE にログインしていません。記録はこの端末に残ります" });
    if (s.bot !== false) {
      rows.push(s.connected
        ? { icon: "🤖", text: bot + "とつながっています" }
        : { icon: "🤖", text: bot + "とはつながっていません（つながなくても、記録はこの端末に残ります）" });
    }
    if (s.bot === false) n = 0;
    if (n) rows.push({ icon: "📮", text: "まだ" + bot + "に送っていない記録が " + n + " 件。" + (s.online === false ? "電波がもどったら送ります" : s.connected ? "すぐ送りなおします" : "つながったら送ります"), pending: true });
    else if (s.connected && s.bot !== false) rows.push({ icon: "📮", text: "送っていない記録はありません" });
    if (s.online === false) rows.push({ icon: "📶", text: "いまは電波がありません。記録はこの端末に残っています" });
    rows.push({ icon: "📱", text: "LINE 版の記録は、Safari などのブラウザ版とは別に、この端末に残ります（" + (s.moveHint || "「🔒 記録の控え」でうつせます") + "）" });
    return rows;
  }

  // 見た目（ツールの CSS に書かなくてよいように、ここで1回だけ入れる。色は Q キットの ui.css の変数）
  var CSS =
    ".qme-button{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:44px;height:44px;margin:0 -4px 0 -6px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
    ".ls-brand .ls-brand-logo{margin-left:auto}" +
    ".qme-avatar{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;overflow:hidden;border-radius:999px;background:var(--ls-accent-soft);color:var(--ls-accent-ink);font-size:15px;font-weight:800;box-shadow:0 0 0 2px var(--ls-surface,#fff),0 0 0 3.5px #06c755}" +
    ".qme-button.is-out .qme-avatar{box-shadow:0 0 0 2px var(--ls-surface,#fff),0 0 0 3.5px var(--ls-line-strong,#b4bccb)}" +
    ".qme-avatar img{width:100%;height:100%;object-fit:cover}" +
    ".qme-badge{position:absolute;top:0;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ec8a16;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;box-shadow:0 0 0 2px var(--ls-surface,#fff)}" +
    ".qme-head{display:flex;align-items:center;gap:12px}" +
    ".qme-head .qme-avatar{width:48px;height:48px;font-size:20px}" +
    ".qme-rows{display:grid;gap:8px;margin:0;padding:0;list-style:none}" +
    ".qme-rows li{display:grid;grid-template-columns:1.6em minmax(0,1fr);gap:4px;font-size:14px;line-height:1.6;overflow-wrap:anywhere}" +
    ".qme-rows li.is-pending{color:#b35f00;font-weight:700}" +
    ".qme-actions{display:grid;gap:8px}";

  /** 見た目を1回だけ入れる */
  function addCss() {
    if (document.getElementById("qmeCss")) return;
    var style = document.createElement("style");
    style.id = "qmeCss";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /** アイコン（img か頭の字）を作る */
  function avatarEl(me) {
    var box = document.createElement("span");
    box.className = "qme-avatar";
    box.setAttribute("aria-hidden", "true");
    if (me && me.picture) {
      var img = document.createElement("img");
      img.src = me.picture;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () { box.replaceChildren(document.createTextNode(initial(me.name))); });
      box.appendChild(img);
    } else {
      box.textContent = initial(me && me.name);
    }
    return box;
  }

  /** LINE 版で開いたとき、見出しにアイコンを出す。ブラウザ版では何もしない（null） */
  function mount(opts) {
    var o = opts || {};
    var B = typeof window !== "undefined" ? window.QBotLink : null;
    var inLine = B ? B.inLineApp() : /\bLine\//i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
    if (!o.liffId || !(inLine || o.show)) return null;
    var ready = o.ready || (B ? B.liffReady(o.liffId) : null);
    if (!ready) return null;
    var host = o.host || document.querySelector(".ls-brand");
    if (!host) return null;
    addCss();
    var me = readMe() || (o.initial ? clean(o.initial) : null);
    if (me && !me.name && !me.picture) me = null;
    var loggedIn = !!me; // 前にログインした名前があれば、まずはそれで出す（あとで LIFF の答えで直す）
    var button = document.createElement("button");
    button.type = "button";
    button.className = "qme-button";
    host.appendChild(button);
    var sheet = null;

    function state() {
      return {
        me: me,
        loggedIn: loggedIn,
        connected: o.bot !== false && !!(o.connected && o.connected()),
        pending: o.bot === false ? 0 : Number(o.pending && o.pending()) || 0,
        bot: o.bot !== false,
        botName: o.botName,
        online: typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true
      };
    }

    function drawButton() {
      var st = state();
      button.classList.toggle("is-out", !st.loggedIn);
      button.setAttribute("aria-label", (st.loggedIn && me && me.name ? me.name + " さん（LINE 版）" : inLine ? "LINE 版" : "ブラウザ版") + (st.pending ? "。まだ送っていない記録 " + st.pending + " 件" : "") + (o.onOpen ? "。押すと、あなたの記録と設定" : "。押すとくわしく"));
      var parts = [avatarEl(me)];
      if (st.pending) {
        var badge = document.createElement("span");
        badge.className = "qme-badge";
        badge.textContent = st.pending > 99 ? "99+" : String(st.pending);
        parts.push(badge);
      }
      button.replaceChildren.apply(button, parts);
      if (sheet) drawSheet();
    }

    function close() {
      if (!sheet) return;
      sheet.remove();
      sheet = null;
      document.removeEventListener("keydown", onKey);
      button.focus({ preventScroll: true });
    }
    function onKey(event) {
      if (event.key === "Escape") close();
    }

    function drawSheet() {
      var st = state();
      var card = document.createElement("div");
      card.className = "ls-sheet-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-labelledby", "qmeTitle");
      var head = document.createElement("div");
      head.className = "qme-head";
      var title = document.createElement("p");
      title.className = "ls-sheet-title";
      title.id = "qmeTitle";
      title.textContent = st.loggedIn && me && me.name ? me.name + " さん" : "LINE 版";
      head.append(avatarEl(me), title);
      var list = document.createElement("ul");
      list.className = "qme-rows";
      describe(st).forEach(function (row) {
        var li = document.createElement("li");
        if (row.pending) li.className = "is-pending";
        var icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = row.icon;
        var text = document.createElement("span");
        text.textContent = row.text;
        li.append(icon, text);
        list.appendChild(li);
      });
      var actions = document.createElement("div");
      actions.className = "qme-actions";
      if (st.pending && st.connected && st.online && o.retry) {
        var again = document.createElement("button");
        again.type = "button";
        again.className = "ls-button is-block";
        again.textContent = "📮 いま送る";
        again.addEventListener("click", function () {
          again.disabled = true;
          Promise.resolve(o.retry()).then(drawButton, drawButton);
        });
        actions.appendChild(again);
      }
      if (o.onSettings) {
        var settings = document.createElement("button");
        settings.type = "button";
        settings.className = "ls-button is-block";
        settings.textContent = "⚙️ " + String(o.botName || "ボット") + "とつなぐ";
        settings.addEventListener("click", function () {
          close();
          o.onSettings();
        });
        actions.appendChild(settings);
      }
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ls-sheet-cancel";
      cancel.textContent = "閉じる";
      cancel.addEventListener("click", close);
      actions.appendChild(cancel);
      card.append(head, list, actions);
      if (!sheet) {
        sheet = document.createElement("div");
        sheet.className = "ls-sheet qme-sheet";
        sheet.addEventListener("click", function (event) {
          if (event.target === sheet) close();
        });
        document.body.appendChild(sheet);
        document.addEventListener("keydown", onKey);
        sheet.replaceChildren(card);
        cancel.focus({ preventScroll: true });
      } else {
        sheet.replaceChildren(card);
      }
    }

    var handle = {
      update: drawButton,
      status: function () {
        return { me: me, loggedIn: loggedIn };
      }
    };
    button.addEventListener("click", function () {
      if (o.onOpen) return o.onOpen(handle);
      if (sheet) close();
      else drawSheet();
    });

    // 電波がもどったら送りなおす。切れたら印を描きなおす
    window.addEventListener("online", function () {
      Promise.resolve(o.retry ? o.retry() : null).then(drawButton, drawButton);
    });
    window.addEventListener("offline", drawButton);

    drawButton();
    // LIFF の答えで、名前とアイコンを直す（電波がないときは、残した名前のまま）
    Promise.resolve(ready)
      .then(function () {
        loggedIn = !!(window.liff && window.liff.isLoggedIn && window.liff.isLoggedIn());
        if (!loggedIn) return null;
        return window.liff.getProfile().then(function (profile) {
          me = saveMe(profile);
        });
      })
      .catch(function () {
        // 起こせない・プロフィールを読めない（scope に profile がないなど）ときは、残した名前のまま
      })
      .then(drawButton);

    return handle;
  }

  return { KEY: KEY, mount: mount, describe: describe, readMe: readMe, saveMe: saveMe, initial: initial, clean: clean };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QLineMe;
else if (typeof window !== "undefined") window.QLineMe = QLineMe;
