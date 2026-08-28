/**
 * lib/myNoteGenerator.ts の pure helper（API レスポンス parser / content parser /
 * HTTP status → メッセージ変換）を確認するスクリプト（Step 18）。
 *
 * React UI framework test は行わない（§41）。component の state 遷移・confirmation・
 * 「再生成失敗時に旧 body を消さない」等は components/MyNoteGenerator.tsx のコードレビューで確認する。
 *
 * 実行方法: npx tsx scripts/test-my-note-generator.ts
 */

import {
  myNoteErrorMessageFor,
  parseMyNoteContent,
  parseMyNoteDocumentResponse,
} from "@/lib/myNoteGenerator";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
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
    title: "いまの自分の考え",
    body: "いまの自分の考え\n\n■ 今考えていること\n英語力を伸ばしたいと考えている。",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

console.log("Case 1: valid document response → parse 成功");
{
  const r = parseMyNoteDocumentResponse(VALID);
  assert(r !== null, "null でない");
  assert(r?.id === VALID.document.id, "id が取れる");
  assert(r?.title === VALID.document.title, "title が取れる");
  assert(r?.body === VALID.document.body, "body が取れる（改行保持）");
  assert(r?.updatedAt === VALID.document.updatedAt, "updatedAt が取れる");
}

console.log("Case 2: document 欠損 / 非 object → invalid");
{
  assert(parseMyNoteDocumentResponse({}) === null, "document キー無しは null");
  assert(parseMyNoteDocumentResponse({ document: null }) === null, "document: null は null");
  assert(parseMyNoteDocumentResponse({ document: "x" }) === null, "document が文字列は null");
  assert(parseMyNoteDocumentResponse(null) === null, "null は null");
  assert(parseMyNoteDocumentResponse("ok") === null, "文字列は null");
}

console.log("Case 3: body が空 / 非 string → invalid");
{
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, body: "" } }) === null, "空 body は null");
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, body: "   " } }) === null, "空白のみ body は null");
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, body: 123 } }) === null, "非 string body は null");
  const noBody = { document: { id: VALID.document.id, title: VALID.document.title, updatedAt: VALID.document.updatedAt } };
  assert(parseMyNoteDocumentResponse(noBody) === null, "body 欠損は null");
}

console.log("Case 3b: id / title 欠損 → invalid");
{
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, id: "" } }) === null, "空 id は null");
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, title: "" } }) === null, "空 title は null");
}

console.log("Case 4: updatedAt が不正 → invalid");
{
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, updatedAt: "" } }) === null, "空 updatedAt は null");
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, updatedAt: "not-a-date" } }) === null, "日付にならない文字列は null");
  assert(parseMyNoteDocumentResponse({ document: { ...VALID.document, updatedAt: 20260901 } }) === null, "非 string updatedAt は null");
}

console.log("Case 5: 400 mapping");
{
  const m = myNoteErrorMessageFor(400);
  assert(m.includes("リクエストを確認できませんでした"), "400 → リクエスト確認できず");
}

console.log("Case 6: 401 mapping");
{
  const m = myNoteErrorMessageFor(401);
  assert(m.includes("ログイン"), "401 → ログイン案内");
}

console.log("Case 7: 404 mapping");
{
  const m = myNoteErrorMessageFor(404);
  assert(m.includes("対象のPlanを確認できませんでした"), "404 → Plan 確認できず");
}

console.log("Case 8: 422 mapping");
{
  const m = myNoteErrorMessageFor(422);
  assert(m.includes("もう少し考えを整理"), "422 → 情報がもう少し必要");
}

console.log("Case 9: 500 / その他 mapping");
{
  assert(myNoteErrorMessageFor(500).includes("時間をおいて"), "500 → 時間をおいて再試行");
  assert(myNoteErrorMessageFor(502).includes("時間をおいて"), "502 も同じ汎用メッセージ");
  assert(myNoteErrorMessageFor(418).includes("時間をおいて"), "未知 status も汎用メッセージ");
}

console.log("Case 10: error message に内部用語が漏れていない");
{
  const leaked = [400, 401, 404, 422, 500, 502]
    .map(myNoteErrorMessageFor)
    .some((m) => /Anthropic|upsert|row|422|token|hash|status|RLS|supabase/i.test(m));
  assert(!leaked, "内部用語・HTTP コード・実装語が出ていない");
}

console.log("Case 11: parseMyNoteContent（DB content の shape 検証）");
{
  assert(parseMyNoteContent({ format: "text", body: "本文" })?.body === "本文", "{format:'text', body} は通る");
  assert(parseMyNoteContent({ format: "text", body: "" }) === null, "空 body は null");
  assert(parseMyNoteContent({ format: "html", body: "x" }) === null, "format が text 以外は null");
  assert(parseMyNoteContent({ body: "x" }) === null, "format 欠損は null");
  assert(parseMyNoteContent(null) === null, "null は null");
  assert(parseMyNoteContent("text") === null, "文字列は null");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
