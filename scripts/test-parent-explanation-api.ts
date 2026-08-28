/**
 * app/api/documents/parent-explanation/route.ts のrequest body validationを確認するスクリプト
 * （Step 5）。Next.jsサーバーを起動せず、routeファイルからexportされているvalidation関数
 * （parseDocumentsKarteView）とlib/parentExplanationPrompt.tsのcanGenerateParentExplanationを
 * 直接importして確認する。Anthropic APIは一切呼ばない。
 *
 * 実行方法: npx tsx scripts/test-parent-explanation-api.ts
 */

import { parseDocumentsKarteView } from "@/app/api/documents/parent-explanation/route";
import { canGenerateParentExplanation } from "@/lib/parentExplanationPrompt";
import type { DocumentsKarteView } from "@/lib/documentsKarteView";

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

function validView(): DocumentsKarteView {
  return {
    stated: [
      {
        block: "motivation",
        key: "statedGoal",
        label: "留学を考えている理由",
        value: "海外で自分の英語力を試したい",
        certainty: "stated",
        source: "chat",
      },
      {
        block: "timing",
        key: "durationWeeks",
        label: "期間",
        value: "24",
        certainty: "stated",
        source: "worksheet",
      },
    ],
    inferred: [
      {
        block: "motivation",
        key: "trueGoalHypothesis",
        label: "本当に求めていそうなこと",
        value: "今の環境から一度離れて自信を取り戻したいのかもしれない",
        certainty: "inferred",
        source: "chat",
      },
    ],
    excludedConflicts: [{ block: "schoolPrefs", key: "preferredCity" }],
    decisionLeaning: "going",
    hasEnoughContext: true,
  };
}

console.log("Case 1: 正常なDocumentsKarteView → validation成功");
{
  const view = validView();
  const parsed = parseDocumentsKarteView(view);
  assert(parsed !== null, "parseDocumentsKarteViewがnullを返さない");
  assert(parsed?.stated.length === 2, "stated 2件が保持される");
  assert(parsed?.inferred.length === 1, "inferred 1件が保持される");
  assert(parsed?.decisionLeaning === "going", "decisionLeaningが保持される");
}

console.log("Case 2: stated配列にcertainty=inferredの項目が混入 → 400相当（null）");
{
  const view = validView();
  view.stated = [
    {
      block: "motivation",
      key: "statedGoal",
      label: "留学を考えている理由",
      value: "海外で自分の英語力を試したい",
      certainty: "inferred", // ← statedであるべき配列にinferredが混入
      source: "chat",
    },
  ];
  const parsed = parseDocumentsKarteView(view);
  assert(parsed === null, "certainty不一致でreject（null）される");
}

console.log("Case 3: invalid decisionLeaning → 400相当（null）");
{
  const view = validView();
  // @ts-expect-error 意図的に不正な値を入れてvalidationを確認する
  view.decisionLeaning = "maybe";
  const parsed = parseDocumentsKarteView(view);
  assert(parsed === null, "許可値以外のdecisionLeaningでreject（null）される");
}

console.log("Case 4: unknown block → 400相当（null）");
{
  const view = validView();
  view.stated = [
    {
      // @ts-expect-error 意図的に存在しないblock名を入れてvalidationを確認する
      block: "unknownBlock",
      key: "someKey",
      label: "テスト",
      value: "テスト値",
      certainty: "stated",
    },
  ];
  const parsed = parseDocumentsKarteView(view);
  assert(parsed === null, "許可されていないblock名でreject（null）される");
}

console.log("Case 5: hasEnoughContext = false → Anthropicを呼ばず422相当");
{
  const view: DocumentsKarteView = {
    ...validView(),
    hasEnoughContext: false,
  };
  const parsed = parseDocumentsKarteView(view);
  assert(parsed !== null, "shapeとしては正常なのでvalidation自体は通る");
  assert(
    parsed !== null && canGenerateParentExplanation(parsed) === false,
    "canGenerateParentExplanationがfalseを返す（route側はここで422を返しAnthropicを呼ばない）",
  );
}

console.log("Case 6: inferredしかないview → 422相当");
{
  const view: DocumentsKarteView = {
    stated: [],
    inferred: [
      {
        block: "motivation",
        key: "statedGoal",
        label: "留学を考えている理由",
        value: "海外で自分の英語力を試したい",
        certainty: "inferred",
        source: "chat",
      },
    ],
    excludedConflicts: [],
    decisionLeaning: undefined,
    hasEnoughContext: false,
  };
  const parsed = parseDocumentsKarteView(view);
  assert(parsed !== null, "shapeとしては正常なのでvalidation自体は通る");
  assert(
    parsed !== null && canGenerateParentExplanation(parsed) === false,
    "canGenerateParentExplanationがfalseを返す",
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
