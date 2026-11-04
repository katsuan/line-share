// 気圧の変化の目安（Open-Meteo の pressure_msl から頭痛ーるに近い段階を出す）の手本と、見本でくらべる道具。
// 決め方と見本は data/pressure-level.json、説明は docs/pressure.md。
// 使っているツール（SQriptable・そらくる・KazoQ）は、自分のテストで checkPressureLevels を呼んで、手本と同じ答えになるかを確かめる。
//
//   import { checkPressureLevels } from "../../q-oqrn/tools/qtest/pressure-level.mjs";
//   checkPressureLevels((hpa, i) => myLevel(hpa, i));   // 合わなければ投げる
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC = JSON.parse(fs.readFileSync(path.join(here, "../../data/pressure-level.json"), "utf8"));

/**
 * 手本の決め方。hpa … 0時からの1時間ごとの気圧、i … 段階を知りたい時刻の番号（hpa の中の位置。i % 24 が時）。
 * 返すのは 0 通常・2 やや注意・3 注意・4 警戒
 */
export function pressureLevel(hpa, i, rule = SPEC.rule) {
  const start = i - ((i % 24) % rule.block);
  let drop = 0;
  for (let j = Math.max(0, start - rule.from); j <= start && j + rule.span < hpa.length; j++) {
    drop = Math.max(drop, hpa[j] - hpa[j + rule.span]);
  }
  const [a, b, c] = rule.cuts;
  return drop < a ? rule.levels[0] : drop < b ? rule.levels[1] : drop < c ? rule.levels[2] : rule.levels[3];
}

/**
 * levelAt(hpa, i) が、見本（data/pressure-level.json の cases）と同じ答えを返すか。
 * ちがえば、どの見本の何時がちがうかを書いて投げる
 */
export function checkPressureLevels(levelAt) {
  const wrong = [];
  for (const c of SPEC.cases) {
    const got = c.expect.map((_, k) => levelAt(c.hpa, c.from + k));
    c.expect.forEach((want, k) => {
      if (got[k] !== want) wrong.push(`${c.name}：${c.from + k}番目（${(c.from + k) % 24}時）は ${want} のはずが ${got[k]}`);
    });
  }
  if (wrong.length) {
    throw new Error(`気圧の目安の決め方が、q-oqrn の data/pressure-level.json（${SPEC.version}）と合いません。docs/pressure.md を見て直してね\n${wrong.slice(0, 10).join("\n")}${wrong.length > 10 ? `\n…ほか ${wrong.length - 10} か所` : ""}`);
  }
  return SPEC.version;
}
