// カードのボタン（投票・チェックリストの完了など）から開かれ、リンクで渡された文をそのトークに送る。
// LIFF で送るカードには URI アクション（リンク）しか付けられないので、押すとこのページが開き、
// liff.sendMessages でテキストを送る（テキストなら送れる）。送ったら閉じる。
// 他人が作ったカードから意図しない文を送らされないよう、送る前に内容を見せて「この内容で送る」を押してもらう。
const MAX_LENGTH = 500;
// トークから開いたときだけ送れる（sendMessages はそのトークに送る）
const CHAT_TYPES = ["utou", "group", "room", "square_chat"];

const els = {};
let text = "";

document.addEventListener("DOMContentLoaded", async () => {
  for (const id of ["replyText", "replyNote", "status", "copyButton", "sendButton"]) {
    els[id] = document.getElementById(id);
  }
  // 改行以外の制御文字は外し、長さを抑える
  text = (new URLSearchParams(location.search).get("text") || "")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_LENGTH);
  if (!text) {
    els.replyText.textContent = "（送る内容がありません）";
    setStatus("リンクに送る内容が入っていません。", "error");
    els.copyButton.disabled = true;
    return;
  }
  els.replyText.textContent = text;
  els.copyButton.addEventListener("click", copy);
  els.sendButton.addEventListener("click", send);
  await prepare();
});

async function prepare() {
  const { MESSAGES } = window.LineShareLiff;
  setStatus(MESSAGES.connecting);
  // つなぎ込みが終わらないとき（通信の不調など）も、コピーはできるようにする
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ready: false }), 8000));
  const { ready } = await Promise.race([window.LineShareLiff.init({ login: "none" }), timeout]);
  if (!ready || !liff.isInClient()) {
    setStatus("LINEアプリのトークから開くと送れます。ここではコピーだけできます。");
    els.replyNote.hidden = true;
    return;
  }
  const type = liff.getContext()?.type;
  if (!CHAT_TYPES.includes(type)) {
    setStatus("トークの中のボタンから開くと送れます。ここではコピーだけできます。");
    els.replyNote.hidden = true;
    return;
  }
  setStatus("");
  els.sendButton.disabled = false;
  els.sendButton.focus();
}

async function send() {
  els.sendButton.disabled = true;
  setStatus("送っています…");
  try {
    await liff.sendMessages([{ type: "text", text }]);
    setStatus("送りました。", "success");
    setTimeout(() => liff.closeWindow(), 700);
  } catch (error) {
    console.error(error);
    setStatus("送れませんでした。もう一度お試しください。", "error");
    els.sendButton.disabled = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("コピーしました。トークに貼り付けて送れます。", "success");
  } catch {
    setStatus("コピーできませんでした。文を長押ししてコピーしてください。", "error");
  }
}

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `ls-status${tone ? ` is-${tone}` : ""}`;
}
