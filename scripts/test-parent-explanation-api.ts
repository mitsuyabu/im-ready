/**
 * app/api/documents/parent-explanation/route.ts のrequest body validationを確認する
 * スクリプト（Step 5で作成、Step 7でrequest shapeが`{ view }`から`{ planId }`へ
 * 変わったことに合わせて更新）。
 *
 * Step 7以降、生成に使うDocumentsKarteViewはClientから送らず、Server側で
 * loadPlanKarte()・buildDocumentsKarteView()を使って作り直すため、旧来の
 * DocumentsKarteView request parser（stated/inferred/block validation等）は不要になった
 * （DocumentsKarteView自体の検証はscripts/test-documents-karte-view.tsで引き続き行う）。
 * ここではrequest body側の`parsePlanId`のみを確認する。
 *
 * Next.jsサーバーを起動せず、routeファイルからexportされている`parsePlanId`を直接
 * importして確認する。Server auth・DB・Anthropicを呼ぶ大規模なmock環境は作らない
 * （認証・DB・Anthropicが絡む部分は、実ブラウザでのE2E確認に委ねる）。
 *
 * 実行方法: npx tsx --env-file=.env.local scripts/test-parent-explanation-api.ts
 * （route.tsが lib/anthropic.ts を経由してANTHROPIC_API_KEYを参照するため、
 * 素の`npx tsx`では失敗する。--env-file=.env.local が必須）。
 */

import { parsePlanId } from "@/app/api/documents/parent-explanation/route";

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

console.log("Case 1: 正常なplanId文字列 → そのまま返る");
{
  const result = parsePlanId("11111111-1111-1111-1111-111111111111");
  assert(result === "11111111-1111-1111-1111-111111111111", "文字列がそのまま返る");
}

console.log("Case 2: 前後に空白があるplanId → trimされる");
{
  const result = parsePlanId("  11111111-1111-1111-1111-111111111111  ");
  assert(result === "11111111-1111-1111-1111-111111111111", "trimされた値が返る");
}

console.log("Case 3: 空文字 → null（400相当）");
{
  assert(parsePlanId("") === null, "空文字はnull");
  assert(parsePlanId("   ") === null, "空白のみもnull（trim後に空）");
}

console.log("Case 4: 非string値 → null（400相当）");
{
  assert(parsePlanId(undefined) === null, "undefinedはnull");
  assert(parsePlanId(null) === null, "nullはnull");
  assert(parsePlanId(12345) === null, "numberはnull");
  assert(parsePlanId({ planId: "x" }) === null, "objectはnull");
  assert(parsePlanId(["x"]) === null, "arrayはnull");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
