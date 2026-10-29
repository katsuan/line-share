// 場所・予定：リンクの確かめ・地図のリンク・外で開く
import { MAX_URI_LENGTH } from "./config.js?v=202610291712";
import { app, UserError } from "./page.js?v=202610291712";

// http か https の URL か
export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// https の URL か
export function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Google Maps の URL か
export function isGoogleMapsUrl(value) {
  return (
    isHttpUrl(value) &&
    (value.includes("google.com/maps") ||
      value.includes("maps.app.goo.gl") ||
      value.includes("goo.gl/maps"))
  );
}

// LINE のボタンに入る長さ（1000字）をこえたら、やさしい言葉の UserError を投げる
export function assertUriLength(uri, label) {
  if (uri.length > MAX_URI_LENGTH) {
    throw new UserError(`${label}が長すぎてLINEで送れません。詳細などを短くしてください。`);
  }
}

/**
 * Google Maps の URL から場所名を読み取る（/maps/place/<名前>/ や ?q=<名前> の形式のみ）。
 * 短縮URL（maps.app.goo.gl）はブラウザから展開できないため空文字を返す。
 */
export function titleFromMapUrl(url) {
  try {
    const parsed = new URL(url);
    const place = parsed.pathname.match(/\/maps\/place\/([^/]+)/);
    const raw = place ? place[1] : parsed.searchParams.get("q") || parsed.searchParams.get("query") || "";
    return decodeURIComponent(raw.replace(/\+/g, " ")).split(",")[0].trim();
  } catch {
    return "";
  }
}

// 場所名から Google Maps の検索リンクを作る（アプリがあれば地図アプリで開く）
export function mapSearchUrl(name) {
  const query = String(name || "").trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

// LINE 内では外部ブラウザ（地図アプリ）で開き、それ以外は新しいタブで開く
export function openExternal(url) {
  if (app.liffReady && window.liff?.openWindow) {
    liff.openWindow({ url, external: true });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
