/**
 * lib/documentRoles.ts の presentation metadata を確認するスクリプト（Step 27）。
 *
 * 確認する契約:
 * - 本人向け 3 種 ＋ 親向け 1 種のちょうど 4 type
 * - 各 type に role / title / description / createLabel が揃っている
 * - agent_summary など他の internal type を勝手に含めない
 * - getDocumentRoleDefinition は未知 type に null
 *
 * 実行方法: npx tsx scripts/test-document-roles.ts
 */

import {
  DOCUMENT_ROLE_DEFINITIONS,
  getDocumentRoleDefinition,
} from "@/lib/documentRoles";

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

console.log("Case 1: ちょうど 4 type");
{
  const keys = Object.keys(DOCUMENT_ROLE_DEFINITIONS).sort();
  assert(
    keys.join(",") === ["my_note", "parent_explanation", "school_comparison", "study_plan"].sort().join(","),
    "my_note / study_plan / school_comparison / parent_explanation のみ",
  );
  assert(!("agent_summary" in DOCUMENT_ROLE_DEFINITIONS), "agent_summary を含めない");
}

console.log("Case 2: 各 type のフィールドが揃っている");
{
  for (const [key, def] of Object.entries(DOCUMENT_ROLE_DEFINITIONS)) {
    assert(typeof def.role === "string" && def.role.length > 0, `${key}.role`);
    assert(typeof def.title === "string" && def.title.length > 0, `${key}.title`);
    assert(typeof def.description === "string" && def.description.length > 0, `${key}.description`);
    assert(typeof def.createLabel === "string" && def.createLabel.length > 0, `${key}.createLabel`);
    assert(!("updateLabel" in def), `${key} に updateLabel を置かない（Step 28 で扱う）`);
  }
}

console.log("Case 3: role ラベルが「考える→整理する→比べる→伝える」に対応");
{
  assert(DOCUMENT_ROLE_DEFINITIONS.my_note.role === "考える", "my_note = 考える");
  assert(DOCUMENT_ROLE_DEFINITIONS.study_plan.role === "整理する", "study_plan = 整理する");
  assert(DOCUMENT_ROLE_DEFINITIONS.school_comparison.role === "比べる", "school_comparison = 比べる");
  assert(DOCUMENT_ROLE_DEFINITIONS.parent_explanation.role === "伝える", "parent_explanation = 伝える");
}

console.log("Case 4: title は現行の表示名を維持");
{
  assert(DOCUMENT_ROLE_DEFINITIONS.my_note.title === "My Note", "My Note");
  assert(DOCUMENT_ROLE_DEFINITIONS.study_plan.title === "Study Plan", "Study Plan");
  assert(DOCUMENT_ROLE_DEFINITIONS.school_comparison.title === "School Comparison", "School Comparison を維持");
  assert(DOCUMENT_ROLE_DEFINITIONS.parent_explanation.title === "親向け説明資料", "親向け説明資料");
}

console.log("Case 5: createLabel は役割を含むが長すぎない");
{
  assert(DOCUMENT_ROLE_DEFINITIONS.my_note.createLabel === "My Noteを作る", "my_note");
  assert(DOCUMENT_ROLE_DEFINITIONS.study_plan.createLabel === "Study Planを作る", "study_plan");
  assert(DOCUMENT_ROLE_DEFINITIONS.school_comparison.createLabel === "学校を比較する", "school_comparison");
  assert(DOCUMENT_ROLE_DEFINITIONS.parent_explanation.createLabel === "親向け資料を作る", "parent_explanation");
  for (const def of Object.values(DOCUMENT_ROLE_DEFINITIONS)) {
    assert(def.createLabel.length <= 16, `"${def.createLabel}" は 16 文字以内（ボタンに収まる長さ）`);
  }
}

console.log("Case 6: School Comparison の description が「候補校を比較する」意味を補助");
{
  const d = DOCUMENT_ROLE_DEFINITIONS.school_comparison.description;
  assert(d.includes("候補校") && (d.includes("比較") || d.includes("違い")), "候補校の比較である旨が description にある");
}

console.log("Case 7: getDocumentRoleDefinition");
{
  assert(getDocumentRoleDefinition("study_plan")?.title === "Study Plan", "既知 type は定義を返す");
  assert(getDocumentRoleDefinition("agent_summary") === null, "未知 type は null");
  assert(getDocumentRoleDefinition("") === null, "空文字は null");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
