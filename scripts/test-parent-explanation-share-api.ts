/**
 * app/api/documents/parent-explanation/share/route.ts のrequest body validation
 * （parsePlanId）を確認するスクリプト（Step 10）。
 *
 * Next.jsサーバーを起動せず、routeファイルからexportされているparsePlanIdを直接
 * importして確認する。Server auth・DB・token生成が絡む部分は、実ブラウザでの
 * E2E確認に委ねる（大規模なmock環境は作らない）。
 *
 * 実行方法: npx tsx --env-file=.env.local scripts/test-parent-explanation-share-api.ts
 * （route.tsが最終的に lib/anthropic.ts を経由する依存関係は無いが、他のAPI test
 *  scriptと実行コマンドを揃えるため同様の起動方法を案内する。実際には
 *  --env-file無しでも動く可能性が高いが、念のため揃えている）。
 */

import { parsePlanId } from "@/app/api/documents/parent-explanation/share/route";

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

console.log("Case 2: missing（undefined） → null（400相当）");
{
  assert(parsePlanId(undefined) === null, "undefinedはnull");
}

console.log("Case 3: 空文字 → null（400相当）");
{
  assert(parsePlanId("") === null, "空文字はnull");
}

console.log("Case 4: 空白のみ → null（trim後に空、400相当）");
{
  assert(parsePlanId("   ") === null, "空白のみはnull");
}

console.log("Case 5: 型違い（number/null/object/array） → null（400相当）");
{
  assert(parsePlanId(12345) === null, "numberはnull");
  assert(parsePlanId(null) === null, "nullはnull");
  assert(parsePlanId({ planId: "x" }) === null, "objectはnull");
  assert(parsePlanId(["x"]) === null, "arrayはnull");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
