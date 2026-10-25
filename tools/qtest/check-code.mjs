#!/usr/bin/env node
// 危ない書き方を探す（Q のツール共通。docs/security.md の番号で出す）。コードを読むだけで、何も送らない。
//
//   node ../q-oqrn/tools/qtest/check-code.mjs [フォルダ]        … 見つけたものを出す（見つからなければ何も出さない）
//   node ../q-oqrn/tools/qtest/check-code.mjs [フォルダ] --json  … 機械向け
//
// 見つけたものは「ここを見てね」の目印。すべてが穴とはかぎらない（esc() を通している、など）。
// 確かめて問題ないものは、その行に `// qcheck-ok: <番号> <理由>` と書くと出なくなる。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const asJson = process.argv.includes("--json");
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

const files = walk(root, []);
// GAS のファイルか（.gs か、GAS のサービスを使っているもの）
const isGas = (f, text) => /\.gs$/.test(f) || /\b(SpreadsheetApp|PropertiesService|UrlFetchApp|ContentService)\b/.test(text);
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
process.exitCode = findings.some((f) => ["W2", "W4", "S1"].includes(f.id)) ? 1 : 0;
