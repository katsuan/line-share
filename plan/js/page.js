// 場所・予定：画面の状態・知らせの出し方・送る（2つのタブで共通）

export const app = {
  liffReady: false,
  // 送り先を選んで送れるか（LIFF の準備ができていて、shareTargetPicker が使えるとき）
  canSend: false
};

/**
 * 利用者にそのまま見せてよいエラー。
 * それ以外の例外は内容をログにだけ出し、画面には汎用メッセージを出す。
 */
export class UserError extends Error {}

// 画面に出す言葉：UserError ならその言葉、ほかはログに出して fallback
export function toUserMessage(error, fallback = "時間をおいてもう一度お試しください。") {
  if (error instanceof UserError) {
    return error.message;
  }
  console.error(error);
  return fallback;
}

// 案内の欄に文を出す（tone："error" で赤・"success" で緑）
export function setMessage(element, message, tone = "default") {
  element.textContent = message;
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-success", tone === "success");
}

// HTML に入れる文字を、タグとして動かないようにする
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 送れたときのひとこと（ときどき季節の絵文字。shared/season.js がなくてもそのまま）
export function sentMessage() {
  const text = window.LineShareLiff.MESSAGES.sent;
  return window.QSeason?.decorate(text) ?? text;
}

/** 送り先を選んで Flex Message を送る。送れたら true、閉じられたら false */
export async function shareFlex(message) {
  if (!app.canSend) {
    throw new UserError("LINE 版で開くと送れます。");
  }
  // 送り先は複数選べる。送れたら、続けて別のトークにも送るか・閉じるかを選んでもらう（shared/ui.js）
  const messages = [window.LineShareCredit.withCredit(message)];
  const sent = await window.LineShareLiff.share(messages);
  if (sent) window.LineShareUI.afterSent({ resend: () => window.LineShareLiff.share(messages) });
  return sent;
}

// 場所名と住所を1つの文にする（住所に場所名が入っていれば場所名だけ）
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
  // 隠れているあいだは高さを測れない（0 になって潰れる）ので、表示されてから測る
  if (!element.getClientRects().length) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
