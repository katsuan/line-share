// shared/liff.js（全ツール共通の LIFF の準備・送る・URL の片づけ）のテスト。LIFF は偽物を使う。
//   node --test shared/test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../liff.js"), "utf8");

function load(href, liff = {}) {
  const location = new URL(href);
  const history = {
    state: null,
    replaceState(state, _title, url) {
      const next = new URL(String(url), location.href);
      location.href = next.href;
      this.replaced = next.href;
    }
  };
  // location は URL のように読めて、href を書きかえられるもの
  const ctx = {
    window: { LINE_SHARE_CONFIG: { liffId: "1-abc" } },
    location,
    history,
    console,
    URL,
    setTimeout,
    Promise
  };
  ctx.window.liff = liff;
  ctx.liff = liff;
  vm.runInNewContext(SOURCE, ctx);
  return { api: ctx.window.LineShareLiff, location, history };
}

test("tidyUrl：渡された中身のクエリは消し、LIFF とログインの戻りの印・keep・# は残す", () => {
  const { api, location: page } = load(
    "https://katsuan.github.io/line-share/plan/?title=a&tab=calendar&liff.state=%2Fx&code=c1&state=s1&liffClientId=9&error=e&friendship_status_changed=true&from=home#frag"
  );
  api.tidyUrl(["tab"]);
  const params = new URL(page.href).searchParams;
  assert.deepEqual([...params.keys()].sort(), ["code", "error", "friendship_status_changed", "liff.state", "liffClientId", "state", "tab"].sort());
  assert.equal(new URL(page.href).hash, "#frag");
});

test("tidyUrl：消すものがなければ履歴を書きかえない。同じ名前が2つあってもまとめて消す", () => {
  const plain = load("https://katsuan.github.io/line-share/card/");
  plain.api.tidyUrl();
  assert.equal(plain.history.replaced, undefined);
  const twice = load("https://katsuan.github.io/line-share/card/?badge=a&badge=b&item=x");
  twice.api.tidyUrl();
  assert.equal(new URL(twice.location.href).search, "");
});

test("tidyUrl：code や state に似た名前（codeX・states）は消す（印だけ残す）", () => {
  const { api, location: page } = load("https://katsuan.github.io/line-share/card/?codeX=1&states=2&errorish=3");
  api.tidyUrl();
  assert.deepEqual([...new URL(page.href).searchParams.keys()], ["errorish"]);
});

test("share：送り先選びが開いている間にもう一度押されても、2つ目は開かない", async () => {
  let opened = 0;
  let finish;
  const liff = {
    isApiAvailable: () => true,
    shareTargetPicker: () => {
      opened += 1;
      return new Promise((resolve) => (finish = resolve));
    }
  };
  const { api } = load("https://katsuan.github.io/line-share/card/", liff);
  const first = api.share([{ type: "text", text: "a" }]);
  const second = api.share([{ type: "text", text: "a" }]);
  finish({ status: "success" });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(opened, 1);
  // 閉じたあとは、また開ける
  const third = api.share([{ type: "text", text: "b" }]);
  finish(null);
  assert.equal(await third, false);
  assert.equal(opened, 2);
});

test("share：LINE の外（送り先選びが使えない）ではやさしい言葉の例外", async () => {
  const { api } = load("https://katsuan.github.io/line-share/card/", { isApiAvailable: () => false });
  await assert.rejects(api.share([]), /LINEアプリ内で開くと送れます/);
});
