// ConneQt（くらぶ）のツール共通の service worker の中身（電波がなくても、一度開いたツールは開けるようにする）。
// 各ツールの sw.js（ツールのいちばん上の階層）が、ツールの名前を決めてから読み込む：
//   self.CONNEQT_TOOL = "qji";
//   importScripts("/line-share/shared/sw-core.js");
// やり方：まずネットから取る（新しい版をすぐ出すため）。取れない・遅いとき（5秒）だけ、前に保存したものを出す。
// 扱うのは同じサイト（katsuan.github.io）のファイルと Google Fonts だけ。LINE・Firebase・画像サーバーなどには触らない。
// 同じサイトのファイルは、クエリ（?deck=… ・ ?v=…）を外した URL で1つだけ保存する（GitHub Pages はクエリで中身が変わらない）。
// クエリごとに保存すると、開いたカードや版の数だけ保存が増え続けるため。
(function () {
  "use strict";

  const tool = self.CONNEQT_TOOL || "tool";
  const PREFIX = `conneqt-${tool}-`;
  // v1 はクエリごとに保存していた。v2 にしたときに、v1 の保存は activate で消える
  const CACHE = `${PREFIX}v2`;
  const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
  const TIMEOUT_MS = 5000;

  self.addEventListener("install", (event) => {
    self.skipWaiting();
    // ツールのトップだけ先に入れておく（ほかは開いたときに入る）
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) => cache.add(new Request("./", { cache: "reload" })))
        .catch(() => {})
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
        await self.clients.claim();
      })()
    );
  });

  // 保存に使う名前：クエリと # を外した URL
  function keyOf(request) {
    const url = new URL(request.url);
    return url.origin + url.pathname;
  }

  // 保存してあるもの（クエリを外した URL で探す）
  async function fromCache(request) {
    const cache = await caches.open(CACHE);
    return (await cache.match(keyOf(request))) || (await cache.match(keyOf(request), { ignoreSearch: true }));
  }

  // まずネットから取り、保存しなおす。取れない・遅いときだけ保存したものを出す
  async function networkFirst(event) {
    const { request } = event;
    const cache = await caches.open(CACHE);
    const network = fetch(request).then((response) => {
      if (response.ok && response.type === "basic") return cache.put(keyOf(request), response.clone()).then(() => response, () => response);
      return response;
    });
    // 保存し終えるまで service worker を止めない（遅いときに先に古いものを出しても、新しいものは保存される）
    event.waitUntil(network.catch(() => {}));
    // 遅いときは、保存してあるものがあればそれを先に出す（ネットの分は裏で保存だけする）
    const slow = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS)).then(() => fromCache(request));
    try {
      const first = await Promise.race([network, slow]);
      if (first) return first;
      return await network;
    } catch (error) {
      const hit = await fromCache(request);
      if (hit) return hit;
      // ページそのものが無いときは、ツールのトップを出す
      if (request.mode === "navigate") {
        const top = await cache.match("./", { ignoreSearch: true });
        if (top) return top;
      }
      throw error;
    }
  }

  // 保存してあるものを先に使い、なければネットから取って保存する（フォント）
  async function cacheFirst(event) {
    // フォントはクエリ（family=…）で中身が変わるので、URL のまま保存する
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok || response.type === "opaque") {
      await cache.put(event.request, response.clone()).catch(() => {});
    }
    return response;
  }

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (FONT_HOSTS.includes(url.hostname)) {
      event.respondWith(cacheFirst(event));
      return;
    }
    if (url.origin !== self.location.origin) return;
    event.respondWith(networkFirst(event));
  });
})();
