// お知らせカード：リンクの確かめ（送ってよいリンクか）

// ---- URL ----

function parseUrl(value, protocols) {
  try {
    const url = new URL(String(value || "").trim());
    return protocols.includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isHttpsUrl(value) {
  return Boolean(parseUrl(value, ["https:"]));
}

function isAllowedHost(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_ACTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function isBlockedQueryUrl(value) {
  const url = String(value || "").trim();
  return Boolean(url) && queryUrls.has(url) && !isAllowedHost(url);
}

// 送信に使えるリンク。不正な形式やクエリ由来の未許可ドメインは空文字
function getSendableUrl(value) {
  if (isBlockedQueryUrl(value)) return "";
  return parseUrl(value, ACTION_PROTOCOLS);
}
