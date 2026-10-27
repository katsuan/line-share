// 記録のバックアップ（/backup/）の入口（backup/index.html が読む）：くらぶのツールがこの端末（katsuan.github.io の localStorage）に残した記録を、
// 1つのファイル（または文字）にまとめて保存し、あとで戻す。
// どのツールも katsuan.github.io の下にあるので、保存場所は共通。ここに書いた名前のものだけを扱い、
// LINE のログイン情報など（LIFF_STORE など）は入れない。
(function () {
  "use strict";

  // 記録の名前の頭 → ツールの名前（ConneQt の一覧に出していないツールも入れる）
  const OWNERS = [
    ["line-share:", "おくるん", "oqrn"],
    ["oqrn:", "おくるん", "oqrn"],
    ["flexshare:", "おくるん", "oqrn"],
    ["liff-workout-", "キロっく", "kiloq"],
    ["kiloq:", "キロっく", "kiloq"],
    ["soccer:", "さくせん盤", "saqsen"],
    ["roqga:", "ろくが", "roqga"],
    ["pomodoro:", "ぽもくる", "pomoq"],
    ["qji:", "くじ", "qji"],
    ["countdown:", "くろのす", "qronos"],
    ["gender-reveal:", "ジェンダーリビール", "babyq"],
    ["othello:", "ひっくり", "hiqri"],
    ["shoquji:", "しょくじ", "shoquji"],
    ["suqsuq:", "すくすく", "suqsuq"],
    ["tuzuq:", "つづく", "tuzuq"],
    ["yuqsaki:", "ゆくさき", "yuqsaki"],
    ["soraqru:", "そらくる", "soraqru"],
    ["conneqt:", "Qlove", "conneqt"]
  ];
  // 入れないもの：作り直せる一時的なもの（プランの確認結果・ログイン中の持ち越し）
  const SKIP = ["line-share:plan", "line-share:card-carry"];
  const FORMAT = "conneqt-backup";

  const $ = (id) => document.getElementById(id);
  // 共通の画面部品（shared/ui.js）
  const ui = () => window.LineShareUI;

  // 記録の名前から、どのツールのものか（[名前の頭, ツール名]）
  const ownerOf = (key) => OWNERS.find(([prefix]) => key.startsWith(prefix));
  // バックアップに入れる記録か
  const isOurs = (key) => !!ownerOf(key) && !SKIP.includes(key) && !/debug/i.test(key);

  // この端末のツールの記録を集める（{ 名前: 中身 }）
  function collect() {
    const items = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && isOurs(key)) items[key] = localStorage.getItem(key);
      }
    } catch {
      // 読めない環境
    }
    return items;
  }

  // ツールごとにまとめる（ConneQt 自身の「最近つかった」は数えない）
  function byTool(items) {
    const groups = new Map();
    for (const [key, value] of Object.entries(items)) {
      const [, name, id] = ownerOf(key);
      if (id === "conneqt") continue;
      const row = groups.get(name) || { name, bytes: 0 };
      row.bytes += key.length + String(value).length;
      groups.set(name, row);
    }
    return [...groups.values()];
  }

  // 大きさの文（1KB 未満は「少し」）
  const sizeLabel = (bytes) => (bytes < 1024 ? "少し" : `${Math.round(bytes / 1024)} KB`);

  // ツールごとの記録の数と大きさを並べる
  function render() {
    const rows = byTool(collect());
    $("tools").replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement("li");
        li.append(row.name, Object.assign(document.createElement("small"), { textContent: sizeLabel(row.bytes) }));
        return li;
      })
    );
    $("tools").hidden = !rows.length;
    $("empty").hidden = !!rows.length;
    $("saveFile").disabled = $("copyText").disabled = !rows.length;
  }

  // 記録をバックアップの文字（JSON）にまとめる
  function pack() {
    return JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), items: collect() });
  }

  // 保存するファイルの名前（conneqt-20261025.json）
  function fileName() {
    const d = new Date();
    // 2けたにそろえる
    const pad = (n) => String(n).padStart(2, "0");
    return `conneqt-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  }

  // バックアップをファイルに保存する（共有できる端末では共有のシート）
  async function saveFile() {
    const text = pack();
    const file = new File([text], fileName(), { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Qlove の記録" });
        ui()?.toast("保存しました");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ui()?.toast("ファイルを保存しました");
  }

  // バックアップを文字でコピーする
  async function copyText() {
    try {
      await navigator.clipboard.writeText(pack());
      ui()?.toast("コピーしました。Keep メモなどに貼っておいてください");
    } catch {
      // コピーできないときは、選べる文字の窓で出す（docs/ux.md D3）。「📥 戻す」の欄には入れない（戻すボタンと混ざるため）
      if (ui()?.ask) ui().ask({ title: "長押ししてコピーしてください", input: pack(), readonly: true, ok: "閉じる", cancel: null });
      else {
        $("pasteBox").hidden = false;
        $("pasteText").value = pack();
        $("pasteText").select();
      }
    }
  }

  // バックアップの文字を読む（おくるんのバックアップでなければ null）
  function parse(text) {
    try {
      const data = JSON.parse(String(text || "").trim());
      if (data?.format !== FORMAT || typeof data.items !== "object") return null;
      const items = Object.fromEntries(Object.entries(data.items).filter(([key, value]) => isOurs(key) && typeof value === "string"));
      return { savedAt: data.savedAt, items };
    } catch {
      return null;
    }
  }

  // バックアップから記録を戻す（上書きしてよいか聞いてから）
  async function restore(text) {
    const data = parse(text);
    if (!data || !Object.keys(data.items).length) {
      await ui().ask({ title: "戻せませんでした", text: "Qlove のバックアップではないようです。保存したファイル（または文字）をそのまま選んでください。", ok: "閉じる", cancel: null });
      return;
    }
    const names = byTool(data.items).map((row) => row.name).join("・");
    const when = data.savedAt ? new Date(data.savedAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" }) : "";
    const yes = await ui().ask({
      title: "この記録に戻しますか？",
      text: `${when ? `${when} に保存したもの\n` : ""}${names}\n\nいまこの端末にある同じツールの記録は、上書きされます。`,
      ok: "上書きして戻す",
      danger: true
    });
    if (!yes) return;
    try {
      for (const [key, value] of Object.entries(data.items)) localStorage.setItem(key, value);
    } catch {
      await ui().ask({ title: "戻せませんでした", text: "この端末に保存できませんでした。容量がいっぱいかもしれません。", ok: "閉じる", cancel: null });
      return;
    }
    $("pasteBox").hidden = true;
    $("pasteText").value = "";
    render();
    ui().toast("戻しました。ツールを開き直すと反映されます");
  }

  // 来たツールへ戻るリンク（?from=<key>）
  async function setBack() {
    const from = new URLSearchParams(location.search).get("from");
    if (!from) return;
    try {
      const response = await fetch("../data/hub-links.json", { cache: "no-cache" });
      const data = await response.json();
      const tool = (data.items || []).find((item) => item.key === from);
      if (tool) {
        $("back").href = tool.url;
        $("back").textContent = tool.name;
      }
    } catch {
      // おくるんに戻るまま
    }
  }

  // ブラウザに、記録を消さないようにお願いする（できたら印を出す）
  async function showPersisted() {
    try {
      if (await navigator.storage?.persist?.()) $("persisted").hidden = false;
    } catch {
      // 分からないときは出さない
    }
  }

  $("saveFile").addEventListener("click", saveFile);
  $("copyText").addEventListener("click", copyText);
  $("pasteOpen").addEventListener("click", () => {
    $("pasteBox").hidden = false;
    $("pasteText").focus();
  });
  $("pasteApply").addEventListener("click", () => restore($("pasteText").value));
  $("loadFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) restore(await file.text());
  });

  render();
  setBack();
  showPersisted();
})();
