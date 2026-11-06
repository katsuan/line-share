# 気圧の変化の目安（Q のツールで1つの決め方）

頭痛ーる（zutool）が取れないときや、頭痛ーるを使わないツールで、Open-Meteo の気圧（`pressure_msl`）から頭痛ーるに近い段階（通常・やや注意・注意・警戒）を出す決め方です。
使っているツールは、どれも同じ答えになるようにします。

| 使っているツール | ところ |
|---|---|
| SQriptable（q-sqriptable） | `SQriptable.js` の `meteoPressureLevel`（pressure カードの目安） |
| そらくる（q-soraqru） | `js/meteo.js` の `levelOf` |
| KAZOQ（q-kazoq） | `03_27_zutool_gateway_meteo.js` の `getOpenMeteoPressureLevel_`（頭痛ーるの予備） |
| KAZOQ の天気の知らせ（q-kazoq） | `03_43_weather_notice_rules.js`（そらくるの `levelOf`・`dropAt` を写したもの） |
| くらぶボット（q-qlove-bot） | `lib/50_weather_forecast.gs` の `soraqruDropAt_`・`soraqruLevelOf_`（天気のカード） |

## 決め方

- 頭痛ーると同じく、3時間ごとのかたまり（0〜2時・3〜5時…）で段階を決める
- 見るのは下がるほうだけ（上がるのは数えない）
- かたまりの頭の9時間前から頭までに始まる「6時間で下がった幅」のいちばん大きいもの（drop）で：
  - 2 hPa 未満 → 通常（0）
  - 3.5 未満 → やや注意（2）
  - 4 未満 → 注意（3）
  - それ以上 → 警戒（4）
- 明日の夜の段階には、あさっての朝までの気圧が要る（`forecast_days=3`）。今日の朝には、前の日の夜が要る（`past_days=1`）
- 色は 通常 `#7FA7D9`・やや注意 `#E8B931`・注意 `#F08A24`・警戒 `#E5534B`

数字（9時間・6時間・区切り）は `data/pressure-level.json` の `rule` にある。手本の式は `tools/qtest/pressure-level.mjs` の `pressureLevel`。

## どうやって決めたか（2026-11-04）

- 87 の市で、頭痛ーるの今日・明日の段階と、Open-Meteo の気圧をくらべた（半分の市で区切りを決め、残りの半分でも確かめた）
- 気圧の値そのものは、Open-Meteo と頭痛ーるで平均 0.2 hPa しかずれない（気象庁のモデルを選んでも同じくらい）。ずれは段階の決め方にあった

| 決め方 | 頭痛ーると同じ段階 | 1段ちがいまで |
|---|---|---|
| 3時間前とくらべた変化（上がりも下がりも）。1/2/3 hPa（前の決め方） | 32% | 68% |
| かたまりの頭の3時間前〜12時間後の上下の幅。4/5/6 hPa | 62% | 81% |
| **いまの決め方** | **72%** | **87%** |

- 調べたのは1日ぶん（翌日に低気圧が来る日）だけ。ほかの天気の日も集めてくらべれば、区切りをもっと確かにできる

## そろえ方（相互に確かめる）

- 見本は `data/pressure-level.json` の `cases`（ありがちな気圧の動きと、実際の値）。それぞれの `expect` が、手本の答え
- 各ツールは自分のテストで、隣の q-oqrn の見本を読んでくらべる（GitHub Actions でも q-oqrn を隣に取るので、そのまま動く）

  ```js
  import { checkPressureLevels } from "../../q-oqrn/tools/qtest/pressure-level.mjs";
  test("気圧の目安は Q の決め方と同じ", () => {
    checkPressureLevels((hpa, i) => myLevel(hpa, i)); // hpa は0時からの1時間ごと、i % 24 が時
  });
  ```

- 決め方を変えるときは：
  1. `data/pressure-level.json` の `rule` と `version` を変え、`expect` を手本の式で作り直す（`node --test data/test/` が見本と手本のずれを見る）
  2. 上の表のツールのテストが落ちるので、すべて同じに直す（そらくるの `dropAt` を写しているもの（KAZOQ の天気の知らせ・くらぶボット）は、そらくるとくらべるテストで落ちる）。直したツールの README の説明もそろえる
  3. このページの表と「どうやって決めたか」を書き足す
- 1つのツールだけで決め方を変えない。変えたくなったら、このページと見本から変える
