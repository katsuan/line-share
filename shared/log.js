// 利用状況とエラーの記録（どの道具・形式が使われているか、LINE の中で何が起きているかを知るため）。
// 記録するのは「開いた」「送った」「エラー」だけで、LINE のユーザーIDなど個人がわかるものは入れない。
// どの記録にも、流入口（from：どこから来たか）と足跡（step：そのタブで何ページ目か・prev：直前のページ）を付ける。
//   from はタブで最初に開いたページで決め、以後は引き継ぐ。リンクの ?from=home などの目印 → 直前のサイト → direct の順
// いくつかためて、ページが隠れる・閉じるときに GAS（gas/ の action: "log"）へまとめて送る。
// config.js の logging を false にすると何も送らない。
//
// 使い方: LineShareLog.track("send", { tool: "card", kind: "vote", count: 2 })
(function () {
  const config = window.LINE_SHARE_CONFIG || {};
  // LINE で開くと、まず HOME に liff.state 付きで届き、そこから各ツールへ移る。この中継は数えない
  const relaying = new URLSearchParams(location.search).has("liff.state");
  // 手元で確かめているとき（localhost など）は、本番の記録に混ぜない
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/.test(location.hostname) || location.protocol === "file:";
  const enabled = config.logging !== false && Boolean(config.gasWebAppUrl) && !relaying && !local;
  const MAX_PER_PAGE = 40; // 1ページで送る上限（エラーが続いても送りすぎない）
  const FLUSH_AT = 10;
  const TOOL = location.pathname.replace(/\/(index\.html)?$/, "").split("/").filter(Boolean).pop() || "home";

  let queue = [];
  let sentCount = 0;
  const seenErrors = new Set();

  const read = (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // 覚えられなくても、このページの記録はできる
    }
  };

  // そのタブの間だけの番号（同じ人が何回開いたかを数えるためではなく、1回の利用の中の出来事をまとめるため）
  const session = read("line-share:session") || Math.random().toString(36).slice(2, 10);
  write("line-share:session", session);

  // 流入口：最初のページで決めて、そのタブの間は引き継ぐ
  const from = (() => {
    const saved = read("line-share:from");
    if (saved || relaying) return saved || "";
    const tag = new URLSearchParams(location.search).get("from");
    let value = tag ? tag.replace(/[^\w-]/g, "").slice(0, 20) : "";
    if (!value && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        // 同じサイトの中の移動は流入口にしない。katsuan.github.io はほかのツール（countdown など）と同じホストなので、
        // パスの先頭（リポジトリ名）まで同じときだけ同じサイトとみなす
        const top = (url) => url.pathname.split("/")[1] || "";
        const sameSite = ref.host === location.host && (location.host !== "katsuan.github.io" || top(ref) === top(location));
        if (!sameSite) value = `${ref.host}/${top(ref)}`.replace(/\/$/, "").slice(0, 20);
      } catch {
        // 読めなければ direct
      }
    }
    value ||= "direct";
    write("line-share:from", value);
    return value;
  })();

  // 足跡：このタブで何ページ目か・直前のページ（LIFF の入口からの中継は数えない）
  const prev = read("line-share:last-page") || "";
  const step = Number(read("line-share:step") || 0) + (relaying ? 0 : 1);
  if (!relaying) {
    write("line-share:step", String(step));
    write("line-share:last-page", TOOL);
  }

  const inClient = () => {
    try {
      return Boolean(window.liff?.isInClient?.());
    } catch {
      return false;
    }
  };

  function track(event, { tool = TOOL, kind = "", count = "", message = "" } = {}) {
    if (!enabled || sentCount + queue.length >= MAX_PER_PAGE) return;
    queue.push({
      at: new Date().toISOString(),
      event: String(event).slice(0, 20),
      tool: String(tool).slice(0, 20),
      kind: String(kind).slice(0, 20),
      count: count === "" ? "" : Number(count) || 0,
      message: String(message).slice(0, 200),
      inClient: inClient(),
      session,
      from,
      prev: event === "open" ? prev : "",
      step: event === "open" ? step : ""
    });
    if (queue.length >= FLUSH_AT) flush();
  }

  // GAS へまとめて送る。ページを閉じるときでも届くよう sendBeacon を使う（text/plain なので事前確認は起きない）
  function flush() {
    if (!queue.length) return;
    const events = queue;
    queue = [];
    sentCount += events.length;
    const body = JSON.stringify({ action: "log", events });
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    if (!(navigator.sendBeacon && navigator.sendBeacon(config.gasWebAppUrl, blob))) {
      fetch(config.gasWebAppUrl, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, keepalive: true }).catch(() => {});
    }
  }

  function trackError(message, source) {
    const text = `${message}${source ? ` @${source}` : ""}`;
    if (seenErrors.has(text)) return; // 同じエラーは1ページで1回だけ
    seenErrors.add(text);
    track("error", { message: text });
  }

  if (enabled) {
    window.addEventListener("error", (event) => {
      const file = String(event.filename || "").split("/").slice(-2).join("/").replace(/\?.*$/, "");
      trackError(event.message || "error", file ? `${file}:${event.lineno}` : "");
    });
    window.addEventListener("unhandledrejection", (event) => {
      trackError(String(event.reason?.message || event.reason || "unhandledrejection"), "promise");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    track("open");
  }

  window.LineShareLog = { track, flush, error: trackError, from };
})();
