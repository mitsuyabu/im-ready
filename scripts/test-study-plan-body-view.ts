/**
 * lib/studyPlanBodyView.ts の pure parser を確認するスクリプト（Step 27）。
 *
 * 確認する契約:
 * - generic outline を使って section 化し、各行を「ラベル：値」or freeText へ振り分ける
 * - 全角 ： の最初の 1 個だけで分割 / 半角 : は分割しない
 * - section 順・見出し語・値は body のまま（並べ替え・補完しない）
 * - outline が取れなければ null（元 body へ fallback）
 * - 非空テキスト行を失わない / deterministic
 *
 * 実行方法: npx tsx scripts/test-study-plan-body-view.ts
 */

import { parseStudyPlanBodyView } from "@/lib/studyPlanBodyView";

let pass = 0;
let fail = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

const STANDARD = [
  "留学プラン",
  "",
  "■ 現在のプラン",
  "希望する都市：シドニー",
  "渡航時期：来年の春ごろ",
  "期間：24週間",
  "",
  "■ 目的",
  "英語を実務で使えるレベルにしたい。",
  "帰国後は外資系の仕事に挑戦したい。",
  "",
  "■ 予算",
  "総予算：200万円",
  "予算の融通：多少は上げられる",
].join("\n");

console.log("Case 1: section parse");
{
  const v = parseStudyPlanBodyView(STANDARD);
  assert(v !== null, "null でない");
  assert(v?.sections.length === 3, "セクション 3 個");
  assert(v?.sections.map((s) => s.heading).join(",") === "現在のプラン,目的,予算", "見出しは出現順");
}

console.log("Case 2: ラベル：値");
{
  const v = parseStudyPlanBodyView(STANDARD);
  const first = v?.sections[0];
  assert(first?.items.length === 3, "現在のプランは 3 items");
  assert(first?.items[0].label === "希望する都市" && first?.items[0].value === "シドニー", "1 個目の item");
  assert(first?.freeText.length === 0, "現在のプランに freeText は無い");
}

console.log("Case 3: free text");
{
  const v = parseStudyPlanBodyView(STANDARD);
  const purpose = v?.sections[1];
  assert(purpose?.items.length === 0, "目的セクションに items は無い");
  assert(purpose?.freeText.length === 2, "prose 2 行が freeText");
  assert(purpose?.freeText[0] === "英語を実務で使えるレベルにしたい。", "prose 内容そのまま");
}

console.log("Case 4: value 内の URL コロンを保持");
{
  const v = parseStudyPlanBodyView(["■ 参考", "参照先：https://example.com/path"].join("\n"));
  assert(v?.sections[0].items[0].value === "https://example.com/path", "https:// の : はそのまま");
}

console.log("Case 5: value 内に追加の全角 ： があっても最初だけ split");
{
  const v = parseStudyPlanBodyView(["■ x", "メモ：A：B：C"].join("\n"));
  assert(v?.sections[0].items[0].label === "メモ", "label は最初の ： まで");
  assert(v?.sections[0].items[0].value === "A：B：C", "value に残りの ： を保持");
}

console.log("Case 6: empty label → freeText");
{
  const v = parseStudyPlanBodyView(["■ x", "：値だけ"].join("\n"));
  assert(v?.sections[0].items.length === 0, "item にならない");
  assert(v?.sections[0].freeText[0] === "：値だけ", "freeText に落ちる（テキストを捨てない）");
}

console.log("Case 7: empty value → freeText");
{
  const v = parseStudyPlanBodyView(["■ x", "ラベルだけ："].join("\n"));
  assert(v?.sections[0].items.length === 0, "item にならない");
  assert(v?.sections[0].freeText[0] === "ラベルだけ：", "freeText に落ちる");
}

console.log("Case 8: half-width colon → freeText");
{
  const v = parseStudyPlanBodyView(["■ x", "note: this is not a key value"].join("\n"));
  assert(v?.sections[0].items.length === 0, "半角 : は item にしない");
  assert(v?.sections[0].freeText[0] === "note: this is not a key value", "freeText に落ちる");
}

console.log("Case 9: section order を保持");
{
  const body = ["計画", "", "■ 予算", "総予算：100万円", "", "■ 目的", "英語のため。", "", "■ 渡航時期・期間", "期間：12週間"].join("\n");
  const v = parseStudyPlanBodyView(body);
  assert(v?.sections.map((s) => s.heading).join(",") === "予算,目的,渡航時期・期間", "body の順のまま（想定見出し順に並べ替えない）");
}

console.log("Case 10: preamble");
{
  const v = parseStudyPlanBodyView(STANDARD);
  assert(v?.preamble.join("") === "留学プラン", "タイトル行が preamble");
}

console.log("Case 11: outline failure → null");
{
  assert(parseStudyPlanBodyView("見出しの無いテキスト\nラベル：値") === null, "■ 見出しが無ければ null");
  assert(parseStudyPlanBodyView("") === null, "空 body は null");
}

console.log("Case 12: text loss なし");
{
  const v = parseStudyPlanBodyView(STANDARD);
  const seen = new Set<string>();
  for (const s of v!.sections) {
    seen.add(s.heading);
    for (const it of s.items) seen.add(`${it.label}：${it.value}`);
    for (const t of s.freeText) seen.add(t);
  }
  for (const line of [
    "現在のプラン",
    "希望する都市：シドニー",
    "期間：24週間",
    "目的",
    "英語を実務で使えるレベルにしたい。",
    "帰国後は外資系の仕事に挑戦したい。",
    "予算",
    "総予算：200万円",
    "予算の融通：多少は上げられる",
  ]) {
    assert(seen.has(line), `"${line}" が保持されている`);
  }
}

console.log("Case 13: deterministic");
{
  const a = JSON.stringify(parseStudyPlanBodyView(STANDARD));
  const b = JSON.stringify(parseStudyPlanBodyView(STANDARD));
  assert(a === b, "同じ body なら同じ view");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
