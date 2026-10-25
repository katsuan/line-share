// お知らせカード：リンクの確かめ（送ってよいリンクか）。card/index.html が順に読む（同じ範囲の変数を使う）。

// ---- URL ----

// protocols のどれかで始まる URL なら整えた URL、ほかは空
function parseUrl(value, protocols) {
  try {
    const url = new URL(String(value || "").trim());
    return protocols.includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

// https の URL か
function isHttpsUrl(value) {
  return Boolean(parseUrl(value, ["https:"]));
}

// 送ってよい行き先か（katsuan.github.io と、自分たちの LIFF だけ）
function isAllowedHost(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "liff.line.me") return ALLOWED_LIFF_IDS.includes(pathname.split("/")[1] || "");
    return ALLOWED_ACTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// リンクで渡された URL で、送ってよい行き先でないもの（送るときに外す）か
function isBlockedQueryUrl(value) {
  const url = String(value || "").trim();
  return Boolean(url) && queryUrls.has(url) && !isAllowedHost(url);
}

// 送信に使えるリンク。不正な形式やクエリ由来の未許可ドメインは空文字
function getSendableUrl(value) {
  if (isBlockedQueryUrl(value)) return "";
  return parseUrl(value, ACTION_PROTOCOLS);
}
