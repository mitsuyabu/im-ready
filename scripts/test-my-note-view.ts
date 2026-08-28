/**
 * lib/myNoteView.ts の動作確認用スクリプト（Step 15）。
 * 新しい test framework は導入せず、既に devDependency にある tsx で直接実行するだけの、
 * DB・Anthropic に一切触れない pure test。
 *
 * 実行方法: npx tsx scripts/test-my-note-view.ts
 */

import { createEmptyKarte, type Karte } from "@/lib/karte";
import { buildMyNoteView, type MyNoteItem } from "@/lib/myNoteView";

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

function has(items: MyNoteItem[], block: string, key: string): boolean {
  return items.some((i) => i.block === block && i.key === key);
}

function freshKarte(): Karte {
  return createEmptyKarte("test-karte");
}

console.log("Case 1: stated motivation あり → stated へ入り、hasEnoughContext = true");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "英語力を伸ばしたい", certainty: "stated", source: "chat" };
  const view = buildMyNoteView(karte);
  assert(has(view.stated, "motivation", "statedGoal"), "stated に motivation.statedGoal がある");
  assert(!has(view.inferred, "motivation", "statedGoal"), "inferred には入らない");
  assert(view.hasEnoughContext === true, "hasEnoughContext = true");
}

console.log("Case 2: stated decision のみ → hasEnoughContext = true");
{
  const karte = freshKarte();
  karte.decision.topConcern = { value: "英語力が不安", certainty: "stated", source: "worksheet" };
  const view = buildMyNoteView(karte);
  assert(has(view.stated, "decision", "topConcern"), "stated に decision.topConcern がある");
  assert(view.hasEnoughContext === true, "hasEnoughContext = true（decision 単独でも可）");
}

console.log("Case 3: inferred のみ → hasEnoughContext = false");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "英語力を伸ばしたい", certainty: "inferred", source: "chat" };
  karte.timing.durationWeeks = { value: 24, certainty: "inferred", source: "worksheet" };
  const view = buildMyNoteView(karte);
  assert(has(view.inferred, "motivation", "statedGoal"), "inferred へ入る");
  assert(view.stated.length === 0, "stated は空");
  assert(view.hasEnoughContext === false, "hasEnoughContext = false（inferred だけでは不可）");
}

console.log("Case 4: unknown のみ → item に入らず、hasEnoughContext = false");
{
  const karte = freshKarte(); // 空カルテ = 全 field unknown
  const view = buildMyNoteView(karte);
  assert(view.stated.length === 0 && view.inferred.length === 0, "stated / inferred とも空");
  assert(view.hasEnoughContext === false, "hasEnoughContext = false");
}

console.log("Case 5: profile source の stated だけ → hasEnoughContext = false");
{
  const karte = freshKarte();
  karte.profile.age = { value: 22, certainty: "stated", source: "profile" };
  karte.profile.occupation = { value: "大学生", certainty: "stated", source: "profile" };
  const view = buildMyNoteView(karte);
  assert(has(view.stated, "profile", "age"), "profile.age は stated に入る（item としては保持）");
  assert(view.hasEnoughContext === false, "profile block は hasEnoughContext の根拠にしない");
}

console.log("Case 6: openQuestions だけ → hasEnoughContext = false");
{
  const karte = freshKarte();
  karte.handoff.openQuestions = ["希望する都市", "予算の融通"];
  const view = buildMyNoteView(karte);
  assert(view.openQuestionLabels.length === 2, "openQuestionLabels は 2 件");
  assert(view.stated.length === 0, "stated は空");
  assert(view.hasEnoughContext === false, "hasEnoughContext = false");
}

console.log("Case 7: openQuestions がラベルとして取り出される");
{
  const karte = freshKarte();
  karte.handoff.openQuestions = ["  希望する都市  ", "留学で得たいこと"];
  const view = buildMyNoteView(karte);
  assert(
    JSON.stringify(view.openQuestionLabels) === JSON.stringify(["希望する都市", "留学で得たいこと"]),
    "trim 済みのラベル配列（内部 key ではない）",
  );
}

console.log("Case 8: openQuestions の重複除去（元順維持）");
{
  const karte = freshKarte();
  karte.handoff.openQuestions = ["希望する都市", "予算の融通", "希望する都市", " 予算の融通 "];
  const view = buildMyNoteView(karte);
  assert(
    JSON.stringify(view.openQuestionLabels) === JSON.stringify(["希望する都市", "予算の融通"]),
    "重複を除いた 2 件・最初に出た順",
  );
}

console.log("Case 9: conflict はトピックのラベルだけ抽出。値・source は view に出さない");
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
  const view = buildMyNoteView(karte);
  assert(!has(view.stated, "budget", "totalCap"), "conflict 中の field は stated から除外");
  assert(!has(view.inferred, "budget", "totalCap"), "inferred にも入らない");
  assert(
    JSON.stringify(view.conflictTopics) === JSON.stringify(["総予算"]),
    "conflictTopics はラベル『総予算』のみ",
  );
  const serialized = JSON.stringify(view);
  assert(!serialized.includes("800000") && !serialized.includes("1000000"), "existing/incoming 値が view に出ない");
  assert(!serialized.includes("worksheet") || !serialized.includes("existingSource"), "conflict の source metadata が出ない");
}

console.log("Case 10: conflict topic の重複除去");
{
  const karte = freshKarte();
  const dup = {
    existingValue: "a",
    existingSource: "worksheet" as const,
    incomingValue: "b",
    incomingSource: "chat" as const,
  };
  karte.handoff.conflicts = [
    { block: "schoolPrefs", key: "preferredCity", ...dup },
    { block: "schoolPrefs", key: "preferredCity", ...dup },
  ];
  const view = buildMyNoteView(karte);
  assert(
    JSON.stringify(view.conflictTopics) === JSON.stringify(["希望する都市"]),
    "同一トピックは 1 件に集約",
  );
}

console.log("Case 11: trueGoalHypothesis が stated 入力でも inferred へ強制");
{
  const karte = freshKarte();
  karte.motivation.trueGoalHypothesis = {
    value: "本当は自立したいのかもしれない",
    certainty: "stated",
    source: "chat",
  };
  const view = buildMyNoteView(karte);
  assert(has(view.inferred, "motivation", "trueGoalHypothesis"), "inferred に入る");
  assert(!has(view.stated, "motivation", "trueGoalHypothesis"), "stated には入らない");
  assert(
    view.hasEnoughContext === false,
    "trueGoalHypothesis 単独では hasEnoughContext = false（inferred 扱いのため）",
  );
}

console.log("Case 12: decision.stage stated → top-level decisionStage へ");
{
  const karte = freshKarte();
  karte.decision.stage = { value: "情報収集中", certainty: "stated", source: "chat" };
  const view = buildMyNoteView(karte);
  assert(view.decisionStage === "情報収集中", "decisionStage === '情報収集中'");
}

console.log("Case 13: decision.stage inferred → top-level decisionStage へ入らない");
{
  const karte = freshKarte();
  karte.decision.stage = { value: "情報収集中", certainty: "inferred", source: "chat" };
  const view = buildMyNoteView(karte);
  assert(view.decisionStage === undefined, "decisionStage は undefined");
  assert(has(view.inferred, "decision", "stage"), "ただし inferred item としては残る");
}

console.log("Case 14: decision.leaning が判明 → top-level へ（certainty も対で）");
{
  const karte = freshKarte();
  karte.decision.leaning = { value: "going", certainty: "stated", source: "chat" };
  const view = buildMyNoteView(karte);
  assert(view.decisionLeaning === "going", "decisionLeaning === 'going'（生 enum のまま）");
  assert(view.decisionLeaningCertainty === "stated", "decisionLeaningCertainty === 'stated'");

  const karte2 = freshKarte();
  karte2.decision.leaning = { value: "undecided", certainty: "inferred", source: "chat" };
  const view2 = buildMyNoteView(karte2);
  assert(view2.decisionLeaning === "undecided", "inferred でも値は保持");
  assert(view2.decisionLeaningCertainty === "inferred", "certainty = 'inferred' と分かる");
}

console.log("Case 15: decision.leaning unknown → decisionLeaning は undefined");
{
  const karte = freshKarte(); // leaning は空カルテのまま unknown
  const view = buildMyNoteView(karte);
  assert(view.decisionLeaning === undefined, "decisionLeaning === undefined");
  assert(view.decisionLeaningCertainty === undefined, "decisionLeaningCertainty も undefined");
}

console.log("Case 15b: decision.leaning が conflict 中 → top-level へ入れず conflictTopics へ");
{
  const karte = freshKarte();
  karte.decision.leaning = { value: "going", certainty: "stated", source: "chat" };
  karte.handoff.conflicts = [
    {
      block: "decision",
      key: "leaning",
      existingValue: "not_going",
      existingSource: "worksheet",
      incomingValue: "going",
      incomingSource: "chat",
    },
  ];
  const view = buildMyNoteView(karte);
  assert(view.decisionLeaning === undefined, "conflict 中は decisionLeaning を出さない");
  assert(view.conflictTopics.includes("現時点の意向"), "conflictTopics に『現時点の意向』");
  assert(!has(view.stated, "decision", "leaning"), "stated からも除外");
}

console.log("Case 16: personality / profile だけ → hasEnoughContext = false");
{
  const karte = freshKarte();
  karte.profile.age = { value: 25, certainty: "stated", source: "profile" };
  karte.personality.introExtro = { value: "内向的", certainty: "stated", source: "chat" };
  karte.personality.learningStyle = { value: "コツコツ型", certainty: "stated", source: "worksheet" };
  const view = buildMyNoteView(karte);
  assert(view.stated.length === 3, "3 件は stated item として保持される");
  assert(view.hasEnoughContext === false, "personality / profile は根拠にしないので false");
}

console.log("Case 17: 入力 Karte が mutate されない");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "英語力を伸ばしたい", certainty: "stated", source: "chat" };
  karte.motivation.trueGoalHypothesis = { value: "自立したい", certainty: "stated", source: "chat" };
  karte.handoff.openQuestions = ["希望する都市", "希望する都市"];
  karte.handoff.conflicts = [
    {
      block: "budget",
      key: "totalCap",
      existingValue: 1,
      existingSource: "worksheet",
      incomingValue: 2,
      incomingSource: "chat",
    },
  ];
  const before = JSON.stringify(karte);
  buildMyNoteView(karte);
  assert(JSON.stringify(karte) === before, "buildMyNoteView 呼び出し後も入力 Karte は不変");
  assert(
    karte.motivation.trueGoalHypothesis.certainty === "stated",
    "元 Karte の trueGoalHypothesis.certainty は書き換えられていない（強制は view 内だけ）",
  );
}

console.log("Case 18: unknown field を勝手に open question へ変換しない");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "英語力を伸ばしたい", certainty: "stated", source: "chat" };
  // budget / timing / schoolPrefs 等は unknown のまま。openQuestions は未設定。
  const view = buildMyNoteView(karte);
  assert(view.openQuestionLabels.length === 0, "openQuestionLabels は空（unknown ≠ open question）");
}

console.log("\n--- sample: 複合ケースの出力例（Step 16 の prompt 入力の参考） ---");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "海外で英語力を試し視野を広げたい", certainty: "stated", source: "chat" };
  karte.motivation.trueGoalHypothesis = { value: "今の環境から一度離れたいのかもしれない", certainty: "inferred", source: "chat" };
  karte.motivation.regretIfNotGo = { value: "行かないと後悔しそう", certainty: "stated", source: "worksheet" };
  karte.timing.departureTiming = { value: "来年の春頃", certainty: "stated", source: "worksheet" };
  karte.budget.totalCap = { value: 1500000, certainty: "stated", source: "chat" };
  karte.decision.leaning = { value: "going", certainty: "stated", source: "chat" };
  karte.decision.stage = { value: "比較検討中", certainty: "stated", source: "chat" };
  karte.decision.topConcern = { value: "英語力がまだ不安", certainty: "stated", source: "worksheet" };
  karte.lifestyle.cityVsNature = { value: "自然が多い方がいい", certainty: "inferred", source: "chat" };
  karte.handoff.openQuestions = ["希望する都市", "予算の融通"];
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
  console.log(JSON.stringify(buildMyNoteView(karte), null, 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
