/**
 * app/api/documents/study-plan/route.ts の pure helper（request body validation ＋
 * upsert payload builder）を確認するスクリプト（Step 21）。
 *
 * Next.js サーバーを起動せず、route ファイルから export されている pure 関数を直接
 * import して確認する。Server auth・DB・Anthropic を呼ぶ大規模な mock 環境は作らない
 * （それらは実ブラウザでの E2E 確認に委ねる）。
 *
 * 実行方法: npx tsx --env-file=.env.local scripts/test-study-plan-api.ts
 * （route.ts が lib/anthropic.ts 経由で ANTHROPIC_API_KEY を参照するため、素の
 * `npx tsx` では失敗する。--env-file=.env.local が必須。既存 test-my-note-api.ts と同じ）。
 */

import { buildStudyPlanUpsertValues, parsePlanId } from "@/app/api/documents/study-plan/route";
import { STUDY_PLAN_DEFAULT_TITLE } from "@/lib/studyPlanPrompt";

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

console.log("Case 7: buildStudyPlanUpsertValues の形");
{
  const now = "2026-09-01T00:00:00.000Z";
  const v = buildStudyPlanUpsertValues("plan-123", "■ 現在のプラン\n希望する都市：シドニー", now);
  assert(v.plan_id === "plan-123", "plan_id は引数の planId");
  assert(v.updated_at === now, "updated_at は渡した nowIso");
}

console.log("Case 8: type は Server 固定の 'study_plan'");
{
  const v = buildStudyPlanUpsertValues("p", "body", "2026-09-01T00:00:00.000Z");
  assert(v.type === "study_plan", "type === 'study_plan'（Client からも AI からも受け取らない）");
}

console.log("Case 9: title は固定タイトル '現在の留学プラン'");
{
  const v = buildStudyPlanUpsertValues("p", "body", "2026-09-01T00:00:00.000Z");
  assert(v.title === STUDY_PLAN_DEFAULT_TITLE && v.title === "現在の留学プラン", "title は STUDY_PLAN_DEFAULT_TITLE");
}

console.log("Case 10: content は { format: 'text', body } 形");
{
  const v = buildStudyPlanUpsertValues("p", "本文テキスト……", "2026-09-01T00:00:00.000Z");
  assert(v.content.format === "text" && v.content.body === "本文テキスト……", "content shape");
}

console.log("Case 11: updated_at は指定値そのまま");
{
  const now = "2027-03-15T12:34:56.000Z";
  assert(buildStudyPlanUpsertValues("p", "b", now).updated_at === now, "updated_at = 指定値");
}

console.log("Case 12: payload に id を含めない");
{
  const v = buildStudyPlanUpsertValues("p", "b", "2026-09-01T00:00:00.000Z") as Record<string, unknown>;
  assert(!("id" in v), "id を payload に入れない（INSERT 時は DB default、UPDATE 時は維持）");
}

console.log("Case 13: payload に created_at を含めない");
{
  const v = buildStudyPlanUpsertValues("p", "b", "2026-09-01T00:00:00.000Z") as Record<string, unknown>;
  assert(!("created_at" in v), "created_at を payload に入れない（同上）");
}

console.log("Case 14: payload の列は必要最小限（plan_id / type / title / content / updated_at のちょうど 5 つ）");
{
  const v = buildStudyPlanUpsertValues("p", "b", "2026-09-01T00:00:00.000Z") as Record<string, unknown>;
  assert(
    JSON.stringify(Object.keys(v).sort()) ===
      JSON.stringify(["content", "plan_id", "title", "type", "updated_at"]),
    "5 列ちょうど",
  );
}

console.log("Case 15: body が変わっても title / type は固定");
{
  const a = buildStudyPlanUpsertValues("p", "本文A", "2026-09-01T00:00:00.000Z");
  const b = buildStudyPlanUpsertValues("p", "# 見出し\n本文B", "2026-09-01T00:00:00.000Z");
  assert(a.title === b.title && a.title === STUDY_PLAN_DEFAULT_TITLE, "body が変わっても title は固定");
  assert(a.type === b.type && a.type === "study_plan", "body が変わっても type は固定");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
