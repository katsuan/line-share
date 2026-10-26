#!/usr/bin/env node
// 危ない書き方を探す（Q のツール共通。docs/security.md の番号で出す）。コードを読むだけで、何も送らない。
//
//   node ../q-oqrn/tools/qtest/check-code.mjs [フォルダ]        … 見つけたものを出す（見つからなければ何も出さない）
//   node ../q-oqrn/tools/qtest/check-code.mjs [フォルダ] --json  … 機械向け
//
// 見つけたものは「ここを見てね」の目印。すべてが穴とはかぎらない（esc() を通している、など）。
// 確かめて問題ないものは、その行に `// qcheck-ok: <番号> <理由>` と書くと出なくなる。
//
// 同じまちがいを止める確かめ（docs/ux.md・docs/structure.md の決まり。見つけたら止める＝終わりのコードが 1）
//   V1 … HTML・import の ?v= が、git の前の版より小さくなった（古い JS が残って画面が出なくなる。tools/qstamp.py を使う）
//   V2 … 説明の文（p・li・.ls-hint など）に word-break: auto-phrase か text-wrap: pretty（右に大きな余白ができる）
//
// テストから呼ぶとき：const { checkCode } = await import("…/q-oqrn/tools/qtest/check-code.mjs"); checkCode(フォルダ) → 見つけたものの一覧
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "output", "fonts", "DerivedData", ".claude", "tools"]);

const RULES = [
  // ---- 画面（HTML・JS） ----
  { id: "W1", kind: "web", re: /\.innerHTML\s*[+]?=\s*`[^`]*\$\{(?![^}]*\b(esc|escapeHtml|escape|escHtml|h)\()/, why: "innerHTML に、文字を esc しないで入れている（外からの文字なら XSS）" },
  { id: "W1", kind: "web", re: /insertAdjacentHTML\([^)]*`[^`]*\$\{(?![^}]*\b(esc|escapeHtml|escape)\()/, why: "insertAdjacentHTML に、esc しない文字" },
  { id: "W2", kind: "web", re: /\b(eval|new Function)\s*\(/, why: "eval・new Function（文字をプログラムとして動かす）" },
  { id: "W3", kind: "web", re: /target=["']_blank["'](?![^>]*rel=["'][^"']*noopener)/, why: "target=_blank に rel=noopener がない" },
  { id: "W4", kind: "web", re: /<script[^>]+src=["']http:\/\//, why: "http の script（https にする）" },
  { id: "W4", kind: "web", re: /<script[^>]+src=["']https:\/\/(?!(katsuan\.github\.io|static\.line-scdn\.net|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|www\.gstatic\.com|apis\.google\.com|maps\.googleapis\.com|js\.stripe\.com))/, why: "知らないところから読む script（決めた所だけにする）" },
  { id: "W5", kind: "web", re: /\b(location\.href|location\.assign|location\.replace|window\.open)\s*\(?\s*=?\s*[^;]*\b(params|searchParams|query|getParam|get\()\b/, why: "URL の中身で別のページへ飛ばしている（行き先を決めた所だけにする）" },
  { id: "W6", kind: "web", re: /addEventListener\(\s*["']message["']/, why: "postMessage を受けている（送り主 origin を確かめる）" },
  { id: "W7", kind: "web", re: /localStorage\.setItem\([^)]*(token|idToken|accessToken|password|secret)/i, why: "端末に鍵・トークンを残している" },
  { id: "W8", kind: "web", re: /\b(confirm|alert|prompt)\s*\(/, why: "ブラウザの小窓（LineShareUI.ask にする。ux.md の D3）" },
  // ---- GAS ----
  { id: "G1", kind: "gas", re: /\.appendRow\(|\.setValues?\(/, why: "シートに書いている：外からの文字なら、= + - @ で始まるとき式にならないよう ' を付ける（safeCell）", needs: /safeCell|sanitizeCell|escapeFormula|toSheetText/ },
  { id: "G2", kind: "gas", re: /error\.message|err\.message|e\.message/, why: "エラーの中身を返事に入れていないか（画面・LINE に出すのはやさしい言葉だけ）", context: /(jsonOutput|createTextOutput|replyLine|pushLine|text:|message:)/ },
  { id: "G3", kind: "gas", re: /\bfunction\s+doPost\s*\(/, why: "doPost：だれが呼べるか（本人確認・Webhook の合言葉・管理者だけの操作）を確かめる" },
  { id: "G4", kind: "gas", re: /payload\.userId|request\.userId|body\.userId|params\.userId/, why: "画面から送られた userId を信じていないか（ID トークンを LINE に確かめた本人だけ）" },
  // ---- どちらも ----
  { id: "S1", kind: "any", re: /(AIza[0-9A-Za-z_-]{30,}|sk_live_[0-9A-Za-z]{10,}|rk_live_[0-9A-Za-z]{10,}|ghp_[0-9A-Za-z]{30,}|xox[abp]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)/, why: "鍵・トークンのような文字（Script Properties か、制限つきの公開してよい鍵だけ）" },
  { id: "S1", kind: "any", re: /(channel(Access)?Token|CHANNEL_ACCESS_TOKEN|client_secret|CHANNEL_SECRET)\s*[:=]\s*["'][A-Za-z0-9+/=]{30,}["']/, why: "LINE の鍵をコードに書いている（Script Properties に）" },
];

// フォルダの中のコードのファイルを集める（見ないフォルダは飛ばす）
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|js|mjs|gs|css)$/.test(name) && !/\.min\./.test(name) && st.size < 2_000_000) out.push(p);
  }
  return out;
}

// GAS のファイルか（.gs か、GAS のサービスを使っているもの）
const isGas = (f, text) => /\.gs$/.test(f) || /\b(SpreadsheetApp|PropertiesService|UrlFetchApp|ContentService)\b/.test(text);
/** フォルダの中を確かめて、見つけたものの一覧 [{ id, file, line, why, code }] を返す */
export function checkCode(root) {
  const files = walk(root, []);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const gas = isGas(file, text);
    const lines = text.split("\n");
    const fileNeeds = {};
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const rule of RULES) {
        if (rule.kind === "gas" && !gas) continue;
        if (rule.kind === "web" && gas && !/\.(html)$/.test(file)) continue;
        if (!rule.re.test(line)) continue;
        if (new RegExp(`qcheck-ok:\\s*${rule.id}\\b`).test(line) || new RegExp(`qcheck-ok:\\s*${rule.id}\\b`).test(lines[i - 1] || "")) continue;
        if (rule.context && !rule.context.test(lines.slice(Math.max(0, i - 3), i + 4).join("\n"))) continue;
        if (rule.needs) {
          fileNeeds[rule.id] ??= rule.needs.test(text);
          if (fileNeeds[rule.id]) continue;
        }
        findings.push({ id: rule.id, file: path.relative(root, file), line: i + 1, why: rule.why, code: line.trim().slice(0, 140) });
      }
    });
  }
  findings.push(...checkTextWrap(root, files), ...checkVersions(root, files));
  return findings;
}

// ---- V2：説明の文の折り返し ----
// 説明の文に当たるセレクター（見出し・ラベル・ボタンは入れない。balance・auto-phrase を使ってよい）
const TEXT_SELECTOR = /(^|[\s>+~(])(p|li|dd|small|figcaption|blockquote)(?=$|[\s.:#[>+~,)])|\.(ls-(hint|empty|tip|ask-text|panel-note)|[\w-]*(lead|hint|note|desc|intro|caption|empty))(?![\w-])/;
const BAD_WRAP = /word-break\s*:\s*auto-phrase|text-wrap\s*:\s*pretty/;

/** CSS（.css と HTML の <style>）で、説明の文に auto-phrase・pretty を付けているところを探す */
function checkTextWrap(root, files) {
  const found = [];
  for (const file of files.filter((f) => /\.(css|html)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    // コメントを同じ長さの空白にして、行の番号をずらさずに外す
    const css = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!BAD_WRAP.test(m[2])) continue;
      const selectors = m[1].split(",").map((part) => part.trim()).filter((part) => TEXT_SELECTOR.test(part));
      if (!selectors.length) continue;
      const start = m.index + m[0].indexOf(m[1].trim());
      const line = css.slice(0, start).split("\n").length;
      const block = text.slice(m.index, m.index + m[0].length);
      if (/qcheck-ok:\s*V2\b/.test(block)) continue;
      found.push({ id: "V2", file: path.relative(root, file), line, why: "説明の文に word-break: auto-phrase か text-wrap: pretty（右に大きな余白ができる。見出し・ラベル・ボタンだけにする）", code: selectors.join(", ").slice(0, 140) });
    }
  }
  return found;
}

// ---- V1：?v= が前の版より小さくなっていないか ----
// 読むファイルごとの ?v=（"js/app.js" → "202610261200"）
function versionsIn(text) {
  const out = new Map();
  for (const m of text.matchAll(/["'(]([^"'()\s?]+\.(?:js|css|mjs))\?v=([0-9]+)[A-Za-z]*/g)) out.set(m[1], m[2]);
  return out;
}

// 比べるための数（8けたの年月日は 12けたの年月日時分にそろえる）
function versionNumber(v) {
  return Number(v.length >= 8 && v.length < 12 ? v.padEnd(12, "0") : v);
}

// git の中身を読む（なければ null）
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** HTML・JS・CSS の ?v= が、前の版（手元で直したファイルは HEAD、直していないファイルは1つ前のコミット）より小さくなったところを探す */
function checkVersions(root, files) {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top) return [];
  const changed = new Set((git(root, ["diff", "--name-only", "HEAD"]) || "").split("\n").filter(Boolean));
  const found = [];
  for (const file of files.filter((f) => /\.(html|js|mjs|css)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("?v=")) continue;
    // 一時フォルダなどは /var と /private/var のように見え方がちがうので、どちらも実際の場所で比べる
    const rel = path.relative(fs.realpathSync(top.trim()), fs.realpathSync(file)).split(path.sep).join("/");
    const before = git(root, ["show", `${changed.has(rel) ? "HEAD" : "HEAD~1"}:${rel}`]);
    if (!before) continue;
    const old = versionsIn(before);
    for (const [ref, v] of versionsIn(text)) {
      if (!old.has(ref) || versionNumber(v) >= versionNumber(old.get(ref))) continue;
      const line = text.split("\n").findIndex((l) => l.includes(`${ref}?v=${v}`)) + 1;
      found.push({ id: "V1", file: path.relative(root, file), line, why: "?v= が前の版より小さくなった（古いファイルが残って画面が出なくなる。tools/qstamp.py で付けなおす）", code: `${ref}?v=${old.get(ref)} → ${v}` });
    }
  }
  return found;
}

// ---- コマンドとして動かしたとき ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.argv[2] || ".");
  const asJson = process.argv.includes("--json");
  const findings = checkCode(root);
  if (asJson) {
    console.log(JSON.stringify(findings, null, 1));
  } else {
    const byId = {};
    for (const f of findings) (byId[f.id] ||= []).push(f);
    for (const id of Object.keys(byId).sort()) {
      console.log(`\n${id}  ${byId[id][0].why}（${byId[id].length}）`);
      for (const f of byId[id].slice(0, 30)) console.log(`  ${f.file}:${f.line}  ${f.code}`);
      if (byId[id].length > 30) console.log(`  …ほか ${byId[id].length - 30}`);
    }
    if (!findings.length) console.log("見つかりませんでした");
  }
  process.exitCode = findings.some((f) => ["W2", "W4", "S1", "V1", "V2"].includes(f.id)) ? 1 : 0;
}
