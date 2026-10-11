import { MAX_URI_LENGTH } from "./config.js?v=202610111222";

export const app = {
  liffReady: false
};

/**
 * 利用者にそのまま見せてよいエラー。
 * それ以外の例外は内容をログにだけ出し、画面には汎用メッセージを出す。
 */
export class UserError extends Error {}

export function toUserMessage(error, fallback = "時間をおいてもう一度お試しください。") {
  if (error instanceof UserError) {
    return error.message;
  }
  console.error(error);
  return fallback;
}

export function setMessage(element, message, tone = "default") {
  element.textContent = message;
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-success", tone === "success");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isGoogleMapsUrl(value) {
  return (
    isHttpUrl(value) &&
    (value.includes("google.com/maps") ||
      value.includes("maps.app.goo.gl") ||
      value.includes("goo.gl/maps"))
  );
}

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

/**
 * 送信先を選んで Flex Message を送る。送信したら true、閉じられたら false。
 */
export async function shareFlex(message) {
  if (!app.liffReady || !liff.isApiAvailable("shareTargetPicker")) {
    throw new UserError("この環境では送信機能を利用できません。LINEアプリ内で開いてください。");
  }
  const result = await liff.shareTargetPicker([window.LineShareCredit.withCredit(message)]);
  return result?.status === "success";
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

export function formatPlaceLocation(place) {
  const title = (place.title || "").trim();
  const address = (place.address || "").trim().replace(/^日本、\s*/, "");
  if (!title) return address;
  if (!address || address.includes(title)) return title;
  return `${title} ${address}`;
}

/**
 * プレビューの部分に付ける属性。タップすると id の設定を開き、入力欄（空白区切りで候補）に移る（shared/ui.js）。
 */
export function jumpAttrs(id, focusIds = "") {
  return `data-jump="${id}"${focusIds ? ` data-jump-focus="${focusIds}"` : ""} role="button" tabindex="0"`;
}

/** 入力に合わせて textarea の高さを伸ばす（プレビューで直接編集する欄） */
export function autoGrow(element) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
