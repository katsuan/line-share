// トークに送る（/reply/）の入口（reply/index.html が読む）：カードのボタン（投票・チェックリストの完了など）から開かれ、リンクで渡された文をそのトークに送る。
// LIFF で送るカードには URI アクション（リンク）しか付けられないので、押すとこのページが開き、
// liff.sendMessages でテキストを送る（テキストなら送れる）。送ったら閉じる。
// 他人が作ったカードから意図しない文を送らされないよう、送る前に内容を見せて「この内容で送る」を押してもらう。
// 吹き出しはその場で書きかえられる（ひとこと足す・名前を変えるなど）。送るのは書きかえたあとの文。
// sendMessages には LIFF アプリの chat_message.write の権限が要る。権限を外しているときは、
// 権限なしで使える shareTargetPicker で「送り先を選んで送る」にする（このトークを選んでもらう）。
// 投票のボタンからは候補（c）もすべて渡ってくるので、ここで別の候補に選び直せる。
//   ?text=最初の文&title=投票の題&format={c} に投票します&pick=押した候補の番号&c=候補1&c=候補2…
// コピーはどこでも使える。LINE の中ではコピーしたらトークに戻る（入力欄に貼って送る）。
const MAX_LENGTH = 500;
const MAX_CHOICES = 20;
// トークから開いたときだけ送れる（sendMessages はそのトークに送る）
const CHAT_TYPES = ["utou", "group", "room", "square_chat"];

const els = {};
let text = "";
// 送り方。"here"＝このトークに送る / "pick"＝送り先を選んで送る / ""＝送れない（コピーだけ）
let mode = "";
// LINE アプリの中で開いているか（コピーしたらトークに戻る）
let inClient = false;
// 開いたときのクエリ（読み終えたら URL から消すので、「LINE 版で開く」のために覚えておく）
let initialSearch = "";

document.addEventListener("DOMContentLoaded", async () => {
  for (const id of ["replyText", "replyNote", "status", "outsideHelp", "copyButton", "sendButton", "choiceArea", "choiceTitle", "choices"]) {
    els[id] = document.getElementById(id);
  }
  const params = new URLSearchParams(location.search);
  initialSearch = location.search;
  text = clean(params.get("text") || "");
  els.replyText.value = text;
  setupChoices(params);
  window.LineShareLiff.tidyUrl(); // 読み終えたら、長いクエリは URL から消す
  els.replyText.placeholder = "送る内容を入れてください";
  els.replyText.addEventListener("input", () => {
    text = els.replyText.value.trim();
    fit();
    syncButtons();
  });
  fit();
  syncButtons();
  if (!text) setStatus("リンクに送る内容が入っていません。入れてから送れます。");
  els.copyButton.addEventListener("click", copy);
  els.sendButton.addEventListener("click", send);
  await prepare();
});

// 改行以外の制御文字は外し、長さを抑える
function clean(value) {
  return String(value)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_LENGTH);
}

// 投票の候補を並べ、押すとその候補の文に入れかえる
function setupChoices(params) {
  const format = params.get("format") || "";
  const choices = params.getAll("c").map((c) => clean(c).slice(0, 100)).filter(Boolean).slice(0, MAX_CHOICES);
  if (choices.length < 2 || !format.includes("{c}")) return;
  const title = clean(params.get("title") || "").slice(0, 60);
  els.choiceTitle.textContent = title ? `「${title}」候補をえらぶ` : "候補をえらぶ";
  let picked = Number(params.get("pick"));
  const buttons = choices.map((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ls-chip";
    button.textContent = choice;
    button.addEventListener("click", () => {
      picked = index;
      text = clean(format.replaceAll("{c}", choice));
      els.replyText.value = text;
      fit();
      sync();
      syncButtons();
      setStatus("");
    });
    return button;
  });
  // 候補のボタンの押した見た目を、選んでいる候補にそろえる
  const sync = () => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === picked)));
  sync();
  els.choices.replaceChildren(...buttons);
  els.choiceArea.hidden = false;
}

// LIFF を用意して、送り方（このトークに送る・送り先を選ぶ・コピーだけ）を決める
async function prepare() {
  const { MESSAGES } = window.LineShareLiff;
  setStatus(MESSAGES.connecting);
  // つなぎ込みが終わらないとき（通信の不調など）も、コピーはできるようにする
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ready: false }), 8000));
  const { ready } = await Promise.race([window.LineShareLiff.init({ login: "none" }), timeout]);
  if (!ready || !liff.isInClient()) {
    setStatus("トークから開くと送れます。ここではコピーだけできます。");
    els.replyNote.hidden = true;
    // ブラウザで開いたとき：同じ候補のまま LINE アプリで開き直せるようにする（返事はトークを選ぶので、ログインでは送れない）
    const helped = window.LineShareLiff.outsideHelp(els.outsideHelp, {
      appUrl: () => window.LineShareLiff.appUrl(`/reply/${initialSearch}`),
      canLogin: false
    });
    if (helped) setStatus("ここではコピーだけできます。");
    return;
  }
  inClient = true;
  els.copyButton.textContent = "コピーして戻る";
  const context = liff.getContext() || {};
  const canWrite = (context.scopes || []).includes("chat_message.write");
  if (canWrite && CHAT_TYPES.includes(context.type)) {
    mode = "here";
  } else if (window.LineShareLiff.canShare()) {
    mode = "pick";
    els.sendButton.textContent = "送り先を選んで送る";
    els.replyNote.textContent = "吹き出しはタップで書きかえられます。次の画面で、返事をするトークを選んでください。";
  } else {
    setStatus("この画面からは送れません。コピーしてトークに貼り付けてください。");
    els.replyNote.hidden = true;
    return;
  }
  if (text) setStatus("");
  syncButtons();
  if (text) els.sendButton.focus();
}

// 空のときは送れない・コピーできない
function syncButtons() {
  els.copyButton.disabled = !text;
  els.sendButton.disabled = !mode || !text;
}

// 吹き出しの高さを中身に合わせる（field-sizing に対応していないブラウザ向け）
function fit() {
  els.replyText.style.height = "auto";
  els.replyText.style.height = `${els.replyText.scrollHeight}px`;
}

// 文を送る（このトークか、選んだ送り先に）。送れたら閉じる
async function send() {
  els.sendButton.disabled = true;
  setStatus(mode === "here" ? "送っています…" : "");
  try {
    const message = { type: "text", text };
    if (mode === "here") {
      await liff.sendMessages([message]);
    } else {
      const result = await liff.shareTargetPicker([message]);
      // 送り先を選ばずに閉じたときは、そのまま選び直せるようにする
      if (!result) {
        syncButtons();
        return;
      }
    }
    setStatus(window.QSeason?.decorate(window.LineShareLiff.MESSAGES.sent) ?? window.LineShareLiff.MESSAGES.sent, "success"); // ときどき季節の絵文字
    window.LineShareLog?.track("send", { kind: mode });
    setTimeout(() => liff.closeWindow(), 700);
  } catch (error) {
    console.error(error);
    setStatus("送れませんでした。もう一度お試しください。", "error");
    syncButtons();
  }
}

// 文をコピーする（LINE 版ではコピーしたらトークに戻る）
async function copy() {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("コピーしました。トークの入力欄に貼り付けて送ってください。", "success");
    // LINE の中ではトークに戻って、そのまま貼れるようにする
    if (inClient) setTimeout(() => liff.closeWindow(), 900);
  } catch {
    setStatus("コピーできませんでした。吹き出しの文を長押ししてコピーしてください。", "error");
  }
}

// 案内の欄に文を出す（tone："error"・"success"）
function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `ls-status${tone ? ` is-${tone}` : ""}`;
}
