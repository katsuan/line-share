import { CONFIG, MAX_URI_LENGTH } from "./config.js";

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
 * GAS 経由で Google Maps URL から場所名・住所・写真を取得する。
 */
export async function resolveMapInfo(url) {
  if (!isGoogleMapsUrl(url)) {
    throw new UserError("Google MapsのURLを入力してください。");
  }

  let data;
  try {
    const res = await fetch(`${CONFIG.gasApiUrl}?action=resolveMap&url=${encodeURIComponent(url)}`);
    data = await res.json();
  } catch (error) {
    console.error(error);
    throw new UserError("地図情報の取得に失敗しました。時間をおいてもう一度お試しください。");
  }

  if (!data.ok) {
    console.error("resolveMap failed", data);
    throw new UserError("地図情報を取得できませんでした。場所名は手動で入力してください。");
  }

  return {
    mapUrl: url,
    title: data.title || "",
    address: data.address || "",
    photoUrl: isHttpsUrl(data.photoUrl) ? data.photoUrl : ""
  };
}

/**
 * 送信先を選んで Flex Message を送る。送信したら true、閉じられたら false。
 */
export async function shareFlex(message) {
  if (!app.liffReady || !liff.isApiAvailable("shareTargetPicker")) {
    throw new UserError("この環境では送信機能を利用できません。LINEアプリ内で開いてください。");
  }
  const result = await liff.shareTargetPicker([message]);
  return result?.status === "success";
}

export function formatPlaceLocation(place) {
  const title = (place.title || "").trim();
  const address = (place.address || "").trim();
  if (!title) return address;
  if (!address || address.includes(title)) return title;
  return `${title} ${address}`;
}
