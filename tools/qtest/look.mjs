#!/usr/bin/env node
// 見た目の点検（Q のツール共通。docs/ux.md の「見た目」の決まり L1〜L6）。コードを読んで、直す候補の数を出すだけ（止めない）。
//
//   node ../q-oqrn/tools/qtest/look.mjs [フォルダ]          … 決まりごとの数
//   node ../q-oqrn/tools/qtest/look.mjs [フォルダ] --list   … どのファイルの何行目か
//
//   L1 グラデ … 背景のグラデーション（透明を表す市松・端をぼかす mask は数えない）
//   L2 余白   … padding・margin・gap が 8 の倍数でない（1・2・4px は細かい所なので数えない）
//   L3 中央   … text-align: center・justify-items: center（数字だけの大きな表示など、中央が自然な所は残してよい）
//   L4 絵文字 … 画面の文字・HTML の中の絵文字（線アイコン <span class="ls-icon" data-icon="…"> にする。カードの中身・ゲームの絵は別に決める）
//   L5 色     … ツールの色（--ls-accent・-soft・-ink）を使っている所（いちばん大事な1か所だけにする）
//   L6 見出し … h2・h3・.ls-panel-title・.ls-sheet-title（説明のくり返し・中身が1つだけの見出しは外す）
//   L7 アイコンの色 … .ls-icon に currentColor でない色・大きさを付けている（1行に書いた所だけ見る）
// 数は「見るところ」の目安。全部を直すとはかぎらない。
import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "output", "fonts", "DerivedData", ".claude", "tools", "test", "tests", "data", "gas", "server", "backup-old"]);
const EXT = new Set([".html", ".css", ".js", ".mjs"]);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;

const RULES = [
  { id: "L1", name: "グラデ", test: (line) => /(linear|radial|conic)-gradient\(/.test(line) && !/mask/.test(line) && !/45deg, (#[0-9a-f]+ 25%, transparent 25%|transparent 75%)/i.test(line) },
  {
    id: "L2",
    name: "余白",
    test: (line) => {
      const m = line.match(/^\s*(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?\s*:\s*([^;]+)/);
      if (!m) return false;
      return [...m[3].matchAll(/(-?\d+(?:\.\d+)?)px/g)].some(([, n]) => {
        const v = Math.abs(Number(n));
        return v > 4 && v % 8 !== 0;
      });
    }
  },
  { id: "L3", name: "中央", test: (line) => /text-align:\s*center|justify-items:\s*center/.test(line) },
  { id: "L4", name: "絵文字", test: (line, ext) => ext !== ".css" && EMOJI.test(line) },
  { id: "L5", name: "色", test: (line) => /var\(--ls-accent(-soft|-ink)?\)/.test(line) },
  { id: "L7", name: "アイコンの色", test: (line, ext) => ext !== ".js" && /\.ls-icon[^{]*\{[^}]*\b(color|background|width)\s*:\s*(?!currentColor|inherit)/.test(line) },
  { id: "L6", name: "見出し", test: (line, ext) => ext !== ".css" && /<h[23][\s>]|class="[^"]*\b(ls-panel-title|ls-sheet-title)\b/.test(line) }
];

// コメントだけの行は数えない
const isComment = (line) => /^\s*(\/\/|\/\*|\*|<!--)/.test(line);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry.name)) && !/\.(min|test)\.|^sw\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function look(root) {
  const found = [];
  for (const file of walk(root)) {
    const ext = path.extname(file);
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (isComment(line)) return;
        for (const rule of RULES) if (rule.test(line, ext)) found.push({ id: rule.id, file: path.relative(root, file), line: i + 1, text: line.trim().slice(0, 120) });
      });
  }
  return found;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
  const found = look(root);
  const counts = RULES.map((rule) => `${rule.id} ${rule.name} ${found.filter((f) => f.id === rule.id).length}`);
  console.log(`${path.basename(root)}：${counts.join("・")}`);
  if (args.includes("--list")) for (const f of found) console.log(`  ${f.id} ${f.file}:${f.line}  ${f.text}`);
}
