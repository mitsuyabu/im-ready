/**
 * lib/schoolComparisonGenerator.ts の pure helper（API レスポンス parser / content parser /
 * HTTP status → メッセージ変換）を確認するスクリプト（Step 26）。
 *
 * React UI framework test は行わない。component の state 遷移・confirmation・
 * 「再生成失敗時に旧 body を消さない」等は components/SchoolComparisonGenerator.tsx の
 * コードレビューで確認する。
 *
 * 実行方法: npx tsx scripts/test-school-comparison-generator.ts
 */

import {
  parseSchoolComparisonContent,
  parseSchoolComparisonDocumentResponse,
  schoolComparisonErrorMessageFor,
} from "@/lib/schoolComparisonGenerator";

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

const VALID = {
  document: {
    id: "11111111-1111-1111-1111-111111111111",
    title: "現在の学校候補の比較",
    body: "現在の学校候補の比較\n\n■ 今回比較する学校\nAlpha College\n都市：シドニー\n区分：候補",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

console.log("Case 1: valid document response → parse 成功");
{
  const r = parseSchoolComparisonDocumentResponse(VALID);
  assert(r !== null, "null でない");
  assert(r?.id === VALID.document.id, "id が取れる");
  assert(r?.title === VALID.document.title, "title が取れる");
  assert(r?.body === VALID.document.body, "body が取れる（改行保持）");
  assert(r?.updatedAt === VALID.document.updatedAt, "updatedAt が取れる");
}

console.log("Case 2: document 欠損 / 非 object → invalid");
{
  assert(parseSchoolComparisonDocumentResponse({}) === null, "document キー無しは null");
  assert(parseSchoolComparisonDocumentResponse({ document: null }) === null, "document: null は null");
  assert(parseSchoolComparisonDocumentResponse({ document: "x" }) === null, "document が文字列は null");
  assert(parseSchoolComparisonDocumentResponse(null) === null, "null は null");
  assert(parseSchoolComparisonDocumentResponse("ok") === null, "文字列は null");
}

console.log("Case 3: id 空 → invalid");
{
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, id: "" } }) === null, "空 id は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, id: "  " } }) === null, "空白のみ id は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, id: 1 } }) === null, "非 string id は null");
}

console.log("Case 4: title 空 → invalid");
{
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, title: "" } }) === null, "空 title は null");
  const noTitle = { document: { id: VALID.document.id, body: VALID.document.body, updatedAt: VALID.document.updatedAt } };
  assert(parseSchoolComparisonDocumentResponse(noTitle) === null, "title 欠損は null");
}

console.log("Case 5: body 空 → invalid");
{
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, body: "" } }) === null, "空 body は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, body: "   " } }) === null, "空白のみ body は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, body: 123 } }) === null, "非 string body は null");
}

console.log("Case 6: updatedAt が不正 → invalid");
{
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, updatedAt: "" } }) === null, "空 updatedAt は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, updatedAt: "not-a-date" } }) === null, "日付にならない文字列は null");
  assert(parseSchoolComparisonDocumentResponse({ document: { ...VALID.document, updatedAt: 20260901 } }) === null, "非 string updatedAt は null");
}

console.log("Case 7: valid DB content parse");
{
  assert(parseSchoolComparisonContent({ format: "text", body: "本文" })?.body === "本文", "{format:'text', body} は通る");
}

console.log("Case 8: format != text → invalid");
{
  assert(parseSchoolComparisonContent({ format: "html", body: "x" }) === null, "format が text 以外は null");
  assert(parseSchoolComparisonContent({ body: "x" }) === null, "format 欠損は null");
  assert(parseSchoolComparisonContent(null) === null, "null は null");
  assert(parseSchoolComparisonContent("text") === null, "文字列は null");
}

console.log("Case 9: content body 空 → invalid");
{
  assert(parseSchoolComparisonContent({ format: "text", body: "" }) === null, "空 body は null");
  assert(parseSchoolComparisonContent({ format: "text", body: "  \n " }) === null, "空白のみ body は null");
  assert(parseSchoolComparisonContent({ format: "text", body: 5 }) === null, "非 string body は null");
}

console.log("Case 10: 400 mapping");
assert(schoolComparisonErrorMessageFor(400).includes("リクエストを確認できませんでした"), "400 → リクエスト確認できず");

console.log("Case 11: 401 mapping");
assert(schoolComparisonErrorMessageFor(401).includes("ログイン"), "401 → ログイン案内");

console.log("Case 12: 404 mapping");
assert(schoolComparisonErrorMessageFor(404).includes("対象のPlanを確認できませんでした"), "404 → Plan 確認できず");

console.log("Case 13: 422 mapping");
assert(schoolComparisonErrorMessageFor(422).includes("候補校と比較条件をもう少し整理"), "422 → 候補校・条件が必要");

console.log("Case 14: 500 / 502 mapping");
{
  assert(schoolComparisonErrorMessageFor(500).includes("時間をおいて"), "500 → 時間をおいて再試行");
  assert(schoolComparisonErrorMessageFor(502).includes("時間をおいて"), "502 も同じ汎用メッセージ");
}

console.log("Case 15: unknown status mapping");
{
  assert(schoolComparisonErrorMessageFor(418).includes("時間をおいて"), "未知 status も汎用メッセージ");
  assert(schoolComparisonErrorMessageFor(0).includes("時間をおいて"), "0 も汎用メッセージ");
}

console.log("Case 16: error message に内部用語が漏れていない");
{
  const leaked = [400, 401, 404, 422, 500, 502, 418]
    .map(schoolComparisonErrorMessageFor)
    .some((m) => /Anthropic|upsert|\brow\b|422|token|hash|status|RLS|supabase|not_enough_context|proposal/i.test(m));
  assert(!leaked, "Anthropic / upsert / row / HTTP コード / 実装語 / proposal が出ていない");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
