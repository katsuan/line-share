// tools/sync-copies.mjs（共通の部品の写しをそろえる道具）のテスト。本物のリポジトリには触らず、一時フォルダで確かめる。
//   node --test tools/test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COPIES, checkCopies, writeCopies } from "../sync-copies.mjs";

// 一時フォルダに「元」の q-oqrn と、写し先のリポジトリを作る（写しは1つだけ古く、1つはない）
function world() {
  const github = fs.mkdtempSync(path.join(os.tmpdir(), "copies-"));
  const oqrn = path.join(github, "q-oqrn");
  for (const { from, to } of COPIES) {
    fs.mkdirSync(path.dirname(path.join(oqrn, from)), { recursive: true });
    fs.writeFileSync(path.join(oqrn, from), `元 ${from}\n`);
    to.forEach((copy, i) => {
      const file = path.join(github, copy);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (i === 1) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, i === 0 ? "古い中身\n" : `元 ${from}\n`);
    });
  }
  return { github, oqrn };
}

test("ちがう写し・ない写しを見つけ、--write で元と同じにする", () => {
  const dirs = world();
  const states = checkCopies(dirs).map((row) => row.state);
  assert.ok(states.includes("diff") && states.includes("missing"));
  const written = writeCopies(dirs);
  assert.equal(written.length, COPIES.length * 2);
  assert.ok(checkCopies(dirs).every((row) => row.state === "same"));
});

test("リポジトリがない写しは、書かずに知らせるだけ", () => {
  const dirs = world();
  const gone = COPIES[0].to[2].split("/")[0];
  fs.rmSync(path.join(dirs.github, gone), { recursive: true, force: true });
  writeCopies(dirs);
  assert.ok(checkCopies(dirs).some((row) => row.state === "no-repo"));
  assert.ok(!fs.existsSync(path.join(dirs.github, gone)));
});
