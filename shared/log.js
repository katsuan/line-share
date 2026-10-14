// 利用状況とエラーの記録（どの道具・形式が使われているか、LINE の中で何が起きているかを知るため）。
// 記録するのは「開いた」「送った」「エラー」だけで、LINE のユーザーIDなど個人がわかるものは入れない。
// いくつかためて、ページが隠れる・閉じるときに GAS（gas/ の action: "log"）へまとめて送る。
// config.js の logging を false にすると何も送らない。
//
// 使い方: LineShareLog.track("send", { tool: "card", kind: "vote", count: 2 })
(function () {
  const config = window.LINE_SHARE_CONFIG || {};
  const enabled = config.logging !== false && Boolean(config.gasWebAppUrl);
  const MAX_PER_PAGE = 40; // 1ページで送る上限（エラーが続いても送りすぎない）
  const FLUSH_AT = 10;
  const TOOL = location.pathname.replace(/\/(index\.html)?$/, "").split("/").filter(Boolean).pop() || "home";

  let queue = [];
  let sentCount = 0;
  const seenErrors = new Set();

  // そのタブの間だけの番号（同じ人が何回開いたかを数えるためではなく、1回の利用の中の出来事をまとめるため）
  const session = (() => {
    try {
      let id = sessionStorage.getItem("line-share:session");
      if (!id) {
        id = Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("line-share:session", id);
      }
      return id;
    } catch {
      return "";
    }
  })();

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
      session
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

  window.LineShareLog = { track, flush, error: trackError };
})();
