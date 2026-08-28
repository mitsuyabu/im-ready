/**
 * lib/documentsKarteView.ts の動作確認用スクリプト（Step 2）。
 * 既存プロジェクトに新しいtest frameworkを導入しないため、既に devDependency にある tsx で
 * 直接実行するだけの、DB・Anthropicに一切触れないスクリプト。
 *
 * 実行方法: npx tsx scripts/test-documents-karte-view.ts
 */

import { createEmptyKarte, type Karte } from "@/lib/karte";
import { buildDocumentsKarteView } from "@/lib/documentsKarteView";

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

function has(items: { block: string; key: string }[], block: string, key: string): boolean {
  return items.some((i) => i.block === block && i.key === key);
}

function freshKarte(): Karte {
  return createEmptyKarte("test-karte");
}

console.log("Case 1: statedのみ → statedへ入る");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "留学して英語力を伸ばしたい", certainty: "stated", source: "chat" };
  const view = buildDocumentsKarteView(karte);
  assert(has(view.stated, "motivation", "statedGoal"), "stated配列にmotivation.statedGoalがある");
  assert(!has(view.inferred, "motivation", "statedGoal"), "inferred配列には入らない");
}

console.log("Case 2: inferred → inferredへ入る");
{
  const karte = freshKarte();
  karte.motivation.desiredOutcome = { value: "自立したい", certainty: "inferred", source: "chat" };
  const view = buildDocumentsKarteView(karte);
  assert(has(view.inferred, "motivation", "desiredOutcome"), "inferred配列にmotivation.desiredOutcomeがある");
  assert(!has(view.stated, "motivation", "desiredOutcome"), "stated配列には入らない");
}

console.log("Case 3: unknown → どちらにも入らない");
{
  const karte = freshKarte(); // language.selfLevel は空カルテのままunknown
  const view = buildDocumentsKarteView(karte);
  assert(!has(view.stated, "language", "selfLevel"), "stated配列に入らない");
  assert(!has(view.inferred, "language", "selfLevel"), "inferred配列にも入らない");
}

console.log("Case 4: trueGoalHypothesis → 必ずinferred（statedとして保存されていても強制する）");
{
  const karte = freshKarte();
  // 意図的にstatedとして設定し、防御ロジックが機能するか確認する
  karte.motivation.trueGoalHypothesis = {
    value: "本当は自立したいのかもしれない",
    certainty: "stated",
    source: "chat",
  };
  const view = buildDocumentsKarteView(karte);
  assert(has(view.inferred, "motivation", "trueGoalHypothesis"), "inferred配列に入る");
  assert(!has(view.stated, "motivation", "trueGoalHypothesis"), "statedとして保存されていてもstated配列には入らない");
}

console.log("Case 5: conflict対象field → stated/inferredから除外、excludedConflictsへ");
{
  const karte = freshKarte();
  karte.budget.totalCap = { value: 1000000, certainty: "stated", source: "chat" };
  karte.handoff.conflicts = [
    {
      block: "budget",
      key: "totalCap",
      existingValue: 800000,
      existingSource: "worksheet",
      incomingValue: 1000000,
      incomingSource: "chat",
    },
  ];
  const view = buildDocumentsKarteView(karte);
  assert(!has(view.stated, "budget", "totalCap"), "stated配列から除外される");
  assert(!has(view.inferred, "budget", "totalCap"), "inferred配列にも入らない");
  assert(
    view.excludedConflicts.some((c) => c.block === "budget" && c.key === "totalCap"),
    "excludedConflictsに記録される",
  );
}

console.log("Case 6: stated Whyあり + stated条件あり → hasEnoughContext = true");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "留学して英語力を伸ばしたい", certainty: "stated", source: "chat" };
  karte.timing.durationWeeks = { value: 24, certainty: "stated", source: "worksheet" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === true, "hasEnoughContext = true");
}

console.log("Case 7: Whyだけ → false");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "留学して英語力を伸ばしたい", certainty: "stated", source: "chat" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === false, "hasEnoughContext = false");
}

console.log("Case 8: 条件だけ → false");
{
  const karte = freshKarte();
  karte.timing.durationWeeks = { value: 24, certainty: "stated", source: "worksheet" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === false, "hasEnoughContext = false");
}

console.log("Case 9: inferredのみ（Why・条件とも）→ false");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "留学して英語力を伸ばしたい", certainty: "inferred", source: "chat" };
  karte.timing.durationWeeks = { value: 24, certainty: "inferred", source: "worksheet" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === false, "hasEnoughContext = false（inferredだけでは真にならない）");
}

console.log("Case 10: decision.leaning = not_going → 値をそのまま保持");
{
  const karte = freshKarte();
  karte.decision.leaning = { value: "not_going", certainty: "stated", source: "chat" };
  const view = buildDocumentsKarteView(karte);
  assert(view.decisionLeaning === "not_going", "decisionLeaning === 'not_going'（書き換えられない）");
}

console.log("\n--- sample: 現実的な複合ケースの出力例（Step 3のprompt入力データの参考） ---");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = {
    value: "海外で自分の英語力を試し、視野を広げたい",
    certainty: "stated",
    source: "chat",
  };
  karte.motivation.trueGoalHypothesis = {
    value: "今の環境から一度離れて自信を取り戻したいのかもしれない",
    certainty: "inferred",
    source: "chat",
  };
  karte.timing.departureTiming = { value: "来年の春頃", certainty: "stated", source: "worksheet" };
  karte.timing.durationWeeks = { value: 12, certainty: "stated", source: "worksheet" };
  karte.budget.totalCap = { value: 1500000, certainty: "stated", source: "chat" };
  karte.budget.fundingSource = { value: "自己資金と親の支援", certainty: "inferred", source: "chat" };
  karte.decision.leaning = { value: "going", certainty: "stated", source: "chat" };
  karte.decision.topConcern = { value: "英語力がまだ不安", certainty: "stated", source: "worksheet" };
  karte.schoolPrefs.preferredCity = { value: "シドニー", certainty: "stated", source: "chat" };
  // 未解決conflict: worksheet側は「オークランド」と回答していた、という想定
  karte.handoff.conflicts = [
    {
      block: "schoolPrefs",
      key: "preferredCity",
      existingValue: "オークランド",
      existingSource: "worksheet",
      incomingValue: "シドニー",
      incomingSource: "chat",
    },
  ];

  const view = buildDocumentsKarteView(karte);
  console.log(JSON.stringify(view, null, 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
