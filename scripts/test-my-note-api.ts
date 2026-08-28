/**
 * app/api/documents/my-note/route.ts の pure helper（request body validation ＋
 * upsert payload builder）を確認するスクリプト（Step 17）。
 *
 * Next.js サーバーを起動せず、route ファイルから export されている pure 関数を直接
 * import して確認する。Server auth・DB・Anthropic を呼ぶ大規模な mock 環境は作らない
 * （それらは実ブラウザでの E2E 確認に委ねる）。
 *
 * 実行方法: npx tsx --env-file=.env.local scripts/test-my-note-api.ts
 * （route.ts が lib/anthropic.ts 経由で ANTHROPIC_API_KEY を参照するため、素の
 * `npx tsx` では失敗する。--env-file=.env.local が必須。既存 test-parent-explanation-api.ts と同じ）。
 */

import { buildMyNoteUpsertValues, parsePlanId } from "@/app/api/documents/my-note/route";
import { MY_NOTE_DEFAULT_TITLE } from "@/lib/myNotePrompt";

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

console.log("Case 1: 正常な planId 文字列 → そのまま返る");
{
  assert(
    parsePlanId("11111111-1111-1111-1111-111111111111") === "11111111-1111-1111-1111-111111111111",
    "文字列がそのまま返る",
  );
}

console.log("Case 2: missing（undefined / null / キー無し）→ null");
{
  assert(parsePlanId(undefined) === null, "undefined は null");
  assert(parsePlanId(null) === null, "null は null");
  assert(parsePlanId(({} as { planId?: unknown }).planId) === null, "キーが無ければ null");
}

console.log("Case 3: 空文字 → null");
{
  assert(parsePlanId("") === null, "空文字は null");
}

console.log("Case 4: 空白のみ → null（trim 後に空）");
{
  assert(parsePlanId("   ") === null, "空白のみは null");
  assert(parsePlanId("\t\n ") === null, "タブ・改行のみも null");
}

console.log("Case 5: 文字列以外の型 → null");
{
  assert(parsePlanId(12345) === null, "number は null");
  assert(parsePlanId({ planId: "x" }) === null, "object は null");
  assert(parsePlanId(["x"]) === null, "array は null");
  assert(parsePlanId(true) === null, "boolean は null");
}

console.log("Case 6: 前後空白のある planId → trim される");
{
  assert(
    parsePlanId("  11111111-1111-1111-1111-111111111111  ") ===
      "11111111-1111-1111-1111-111111111111",
    "trim された値が返る",
  );
}

console.log("Case 7: buildMyNoteUpsertValues の形");
{
  const now = "2026-09-01T00:00:00.000Z";
  const v = buildMyNoteUpsertValues("plan-123", "今考えていること……", now);
  assert(v.plan_id === "plan-123", "plan_id は引数の planId");
  assert(v.type === "my_note", "type は Server 固定の 'my_note'");
  assert(v.title === MY_NOTE_DEFAULT_TITLE && v.title === "いまの自分の考え", "title は固定タイトル");
  assert(
    v.content.format === "text" && v.content.body === "今考えていること……",
    "content は { format: 'text', body } 形",
  );
  assert(v.updated_at === now, "updated_at は渡した nowIso");
}

console.log("Case 8: buildMyNoteUpsertValues は id / created_at を含めない");
{
  const v = buildMyNoteUpsertValues("plan-123", "body", "2026-09-01T00:00:00.000Z") as Record<string, unknown>;
  assert(!("id" in v), "id を payload に入れない（INSERT 時は DB default、UPDATE 時は維持）");
  assert(!("created_at" in v), "created_at を payload に入れない（同上）");
  assert(
    JSON.stringify(Object.keys(v).sort()) ===
      JSON.stringify(["content", "plan_id", "title", "type", "updated_at"]),
    "payload の列は plan_id / type / title / content / updated_at のちょうど 5 つ",
  );
}

console.log("Case 9: title は body の内容に依存しない（AI/Client から受け取らない）");
{
  const a = buildMyNoteUpsertValues("p", "本文A", "2026-09-01T00:00:00.000Z");
  const b = buildMyNoteUpsertValues("p", "# 見出し\n本文B", "2026-09-01T00:00:00.000Z");
  assert(a.title === b.title && a.title === MY_NOTE_DEFAULT_TITLE, "body が変わっても title は固定");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
