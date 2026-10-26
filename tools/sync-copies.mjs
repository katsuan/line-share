#!/usr/bin/env node
// 共通の部品の写しを、元と同じ中身にそろえる道具（Q のツール共通）。
// GAS のボットは URL で読めないので、元のファイルをそれぞれのリポジトリに写して使う。元を直したら、写しもそろえる。
// 写しの一覧は COPIES（リポジトリは ~/GitHub の下。このファイルのある q-oqrn の隣）。
//
//   node tools/sync-copies.mjs          … ちがう写し・ない写しを出す（あれば終わりのコードが 1）
//   node tools/sync-copies.mjs --write  … 写しを元と同じ中身にする（コミットと GAS への反映は、それぞれのリポジトリで）
//
// 新しく写したら COPIES に足す。各ボットのテストも「元と同じ中身か」を確かめる（docs/structure.md）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OQRN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GITHUB = path.dirname(OQRN);

// 元（q-oqrn の中）と、写し（~/GitHub からの道筋）
export const COPIES = [
  {
    from: "shared/season.js",
    to: [
      "q-kazoq/season.gs",
      "q-qlove-bot/lib/season.gs",
      "q-qurukana/gas/season.js",
      "line-meal-project/gs/02_core/season.gs",
      "GAS_LINE_QA_Bot/50_message/season.gs",
      "GAS_Github_v2-main/04_line/season.gs"
    ]
  },
  {
    from: "tools/qtest/selfcheck.gs",
    to: [
      "q-oqrn/gas/selfcheck.gs",
      "q-kazoq/selfcheck.gs",
      "q-qurukana/gas/selfcheck.js",
      "line-meal-project/gs/10_selfcheck/selfcheck.gs",
      "line-investment/src/selfcheck.gs",
      "line-learning-platform/services/gas/src/00_run/selfcheck.js",
      "line-video-to-drive/selfcheck.js",
      "GAS_LINE_QA_Bot/00_run/selfcheck.gs",
      "GAS_Github_v2-main/09_check/selfcheck.gs",
      "GAS_Github_v2-main/entry/09_check/selfcheck.js"
    ]
  }
];

/** 写しを1つずつ確かめる。[{ from, to, state: "same" | "diff" | "missing" | "no-repo" }] を返す */
export function checkCopies({ github = GITHUB, oqrn = OQRN } = {}) {
  const out = [];
  for (const { from, to } of COPIES) {
    const want = fs.readFileSync(path.join(oqrn, from), "utf8");
    for (const copy of to) {
      const file = path.join(github, copy);
      const repo = path.join(github, copy.split("/")[0]);
      let state = "same";
      if (!fs.existsSync(repo)) state = "no-repo";
      else if (!fs.existsSync(file)) state = "missing";
      else if (fs.readFileSync(file, "utf8") !== want) state = "diff";
      out.push({ from, to: copy, state });
    }
  }
  return out;
}

/** ちがう写し・ない写しを、元と同じ中身にする（リポジトリのないものは飛ばす）。書いた写しの一覧を返す */
export function writeCopies({ github = GITHUB, oqrn = OQRN } = {}) {
  const written = [];
  for (const row of checkCopies({ github, oqrn })) {
    if (row.state !== "diff" && row.state !== "missing") continue;
    fs.writeFileSync(path.join(github, row.to), fs.readFileSync(path.join(oqrn, row.from), "utf8"));
    written.push(row.to);
  }
  return written;
}

// ---- コマンドとして動かしたとき ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes("--write")) {
    const written = writeCopies();
    console.log(written.length ? `そろえた写し：\n${written.map((f) => `  ${f}`).join("\n")}\n（それぞれのリポジトリでコミットし、GAS は次に出すときに clasp push）` : "そろえる写しはありません");
  } else {
    const rows = checkCopies();
    const mark = { same: "✅", diff: "❌ ちがう", missing: "❌ ない", "no-repo": "－ リポジトリがない" };
    for (const row of rows) console.log(`${mark[row.state]}  ${row.to}  ← ${row.from}`);
    process.exitCode = rows.some((row) => row.state === "diff" || row.state === "missing") ? 1 : 0;
  }
}
