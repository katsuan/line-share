// 送るカード（Flex）の末尾に「Created by」を付け、タップでこの LIFF のツール一覧を開く。
// 受け取った人が「どうやって作ったんだろう？」と思ったときに辿れるようにする。
//
// 消し方（自分用）
//   1. URL に ?credit=off を付けて一度開く → その端末では以後消える（?credit=on で戻る）
//   2. config.js の creditFreeUsers に自分の LINE ユーザーIDのハッシュを入れる → LINE でログインすると自動で消える
//      ハッシュは ?credit=whoami を付けて LINE で開くと表示される
//   3. 「Created by を消せる」プラン（shared/plan.js の hideCredit）の人 → プランが決まると消せるようになる
//   消せる人の画面には送信バーに「Created by を付ける」スイッチが出て、送るごとに選べる（初期は付けない）
(function () {
  const LABEL = "Created by おくるん ›";
  const STORAGE_KEY = "line-share:credit";
  // クレジットを消せる人が「付ける / 付けない」を選んだ結果
  const CHOICE_KEY = "line-share:credit-choice";
  const config = window.LINE_SHARE_CONFIG || {};
  const param = new URLSearchParams(location.search).get("credit");

  // ?credit=off / on をこの端末に覚えておく
  if (param === "off" || param === "on") {
    try {
      if (param === "off") {
        localStorage.setItem(STORAGE_KEY, "off");
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(CHOICE_KEY);
      }
    } catch {
      // 保存できない環境ではこのページを開いている間だけ反映する
    }
  }

  // クレジットを消せる人（端末で ?credit=off 済み・全体で OFF・creditFreeUsers に入っている人）
  let privileged = config.showCredit === false || param === "off" || readStored(STORAGE_KEY) === "off";
  // 消せる人は、自分で「付ける」を選んだときだけ付く
  let enabled = privileged ? readStored(CHOICE_KEY) === "on" : true;

  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function grantPrivilege() {
    if (privileged) return;
    privileged = true;
    enabled = readStored(CHOICE_KEY) === "on";
    applyToPage();
    renderToggle();
  }

  // 消せる人だけに、送信バーへ「Created by を付ける」スイッチを出す
  function renderToggle() {
    if (!privileged) return;
    const bar = document.querySelector(".ls-sendbar-inner");
    if (!bar) return;

    let toggle = bar.querySelector(".ls-credit-toggle");
    if (!toggle) {
      toggle = document.createElement("label");
      toggle.className = "ls-credit-toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        enabled = input.checked;
        try {
          localStorage.setItem(CHOICE_KEY, enabled ? "on" : "off");
        } catch {
          // 保存できなくても、このページの間は反映する
        }
        applyToPage();
      });
      toggle.append(input, document.createTextNode("Created by を付ける"));
      bar.prepend(toggle);
    }
    toggle.querySelector("input").checked = enabled;
  }

  function applyToPage() {
    document.documentElement.dataset.credit = enabled ? "on" : "off";
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    applyToPage();
  }

  function isEnabled() {
    return enabled;
  }

  /**
   * LIFF の初期化後に、ログイン中の LINE ユーザーのハッシュを渡して呼ぶ（shared/liff.js が呼ぶ）。
   * creditFreeUsers に入っていれば消す。?credit=whoami のときは、config.js に書くためのハッシュを表示する。
   */
  function checkUser(hash) {
    if (!hash) return;
    if (param === "whoami") {
      const text = "config.js の creditFreeUsers（Created by を消す）や premiumUsers（有償プラン）に追加して使います。";
      if (window.LineShareUI?.ask) window.LineShareUI.ask({ title: "あなたのハッシュ", text, input: hash, readonly: true, ok: "閉じる", cancel: null });
      else console.info(`あなたのハッシュ：${hash}（${text}）`);
    }

    const allowList = Array.isArray(config.creditFreeUsers) ? config.creditFreeUsers : [];
    if (allowList.includes(hash)) grantPrivilege();
  }

  function topUrl() {
    return config.liffId ? `https://liff.line.me/${config.liffId}` : "https://katsuan.github.io/line-share/";
  }

  function creditBox() {
    return {
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        {
          type: "text",
          text: LABEL,
          size: "xxs",
          color: "#9AA0A6",
          align: "center",
          // from=credit：受け取ったカードから来た人を数える（shared/log.js）
          action: { type: "uri", label: "おくるん", uri: `${topUrl()}?from=credit` }
        }
      ]
    };
  }

  // Flex のバブルにだけ付ける（画像メッセージはリンクを持てないのでそのまま）
  function withCredit(message) {
    if (!enabled || !message || message.type !== "flex" || message.contents?.type !== "bubble") {
      return message;
    }
    const bubble = message.contents;
    const footer = bubble.footer
      ? { ...bubble.footer, contents: [...bubble.footer.contents, creditBox()] }
      : { type: "box", layout: "vertical", paddingAll: "8px", contents: [creditBox()] };
    return { ...message, contents: { ...bubble, footer } };
  }

  // プランで消せるようになったとき（shared/plan.js が知らせる）
  document.addEventListener("lineshare:plan", (event) => {
    if (event.detail?.features?.hideCredit) grantPrivilege();
  });

  applyToPage();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderToggle);
  } else {
    renderToggle();
  }
  window.LineShareCredit = { LABEL, topUrl, withCredit, enabled: isEnabled, setEnabled, checkUser };
})();
