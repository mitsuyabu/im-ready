/**
 * lib/studyPlanView.ts の動作確認用スクリプト（Step 19）。
 * 新しい test framework は導入せず、既に devDependency にある tsx で直接実行するだけの、
 * DB・Anthropic に一切触れない pure test。fixture は全て架空データ。
 *
 * 実行方法: npx tsx scripts/test-study-plan-view.ts
 */

import { createEmptyKarte, type FieldSource, type Karte } from "@/lib/karte";
import { buildStudyPlanView, type StudyPlanItem } from "@/lib/studyPlanView";

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

function has(items: StudyPlanItem[], block: string, key: string): boolean {
  return items.some((i) => i.block === block && i.key === key);
}

function freshKarte(): Karte {
  return createEmptyKarte("test-karte");
}

/** stated な Field を作る。value の型は呼び出し側で保たれるので Field<string> / Field<number> 等に代入できる。 */
function S<T>(value: T, source: FieldSource = "chat"): { value: T; certainty: "stated"; source: FieldSource } {
  return { value, certainty: "stated", source };
}
/** inferred な Field を作る。 */
function I<T>(value: T, source: FieldSource = "chat"): { value: T; certainty: "inferred"; source: FieldSource } {
  return { value, certainty: "inferred", source };
}
/** decision.leaning（enum Field）。S() は string を enum union へ narrowing できないため専用 helper。 */
function leaningField(
  value: "going" | "not_going" | "undecided",
  certainty: "stated" | "inferred" = "stated",
) {
  return { value, certainty, source: "chat" as FieldSource };
}
/** decision.decisionOwner（enum Field）。 */
function ownerField(value: "self" | "parent" | "partner_consent_needed") {
  return { value, certainty: "stated" as const, source: "chat" as FieldSource };
}

console.log("Case 1: timing stated + budget stated → stated へ、hasEnoughContext = true");
{
  const k = freshKarte();
  k.timing.departureTiming = S("来年の春頃");
  k.budget.totalCap = S(1500000);
  const v = buildStudyPlanView(k);
  assert(has(v.stated, "timing", "departureTiming"), "timing.departureTiming が stated[]");
  assert(has(v.stated, "budget", "totalCap"), "budget.totalCap が stated[]");
  assert(v.hasEnoughContext === true, "2 カテゴリで hasEnoughContext = true");
}

console.log("Case 2: schoolPrefs stated + language stated → true");
{
  const k = freshKarte();
  k.schoolPrefs.preferredCity = S("シドニー");
  k.language.selfLevel = S("日常会話は少しできる");
  const v = buildStudyPlanView(k);
  assert(v.hasEnoughContext === true, "schoolPrefs + language で true");
}

console.log("Case 3: timing だけ → false");
{
  const k = freshKarte();
  k.timing.departureTiming = S("来年の春頃");
  k.timing.durationWeeks = S(24);
  const v = buildStudyPlanView(k);
  assert(has(v.stated, "timing", "durationWeeks"), "同一 block の複数 field は入る");
  assert(v.hasEnoughContext === false, "timing 1 カテゴリだけなので false");
}

console.log("Case 4: preferredCity だけ → false");
{
  const k = freshKarte();
  k.schoolPrefs.preferredCity = S("ゴールドコースト");
  const v = buildStudyPlanView(k);
  assert(v.hasEnoughContext === false, "schoolPrefs 1 カテゴリだけなので false");
}

console.log("Case 5: motivation.statedGoal だけ → purpose に入り、hasEnoughContext = false");
{
  const k = freshKarte();
  k.motivation.statedGoal = S("英語力を伸ばして視野を広げたい");
  const v = buildStudyPlanView(k);
  assert(v.purpose === "英語力を伸ばして視野を広げたい", "purpose に statedGoal");
  assert(v.stated.length === 0, "stated[] は空（motivation は計画条件 block でない）");
  assert(v.hasEnoughContext === false, "purpose だけでは false");
}

console.log("Case 6: decision だけ → top-level に入り、hasEnoughContext = false");
{
  const k = freshKarte();
  k.decision.stage = S("学校情報を集めている段階");
  k.decision.leaning = leaningField("going");
  k.decision.decisionOwner = ownerField("self");
  const v = buildStudyPlanView(k);
  assert(v.decisionStage === "学校情報を集めている段階", "decisionStage");
  assert(v.decisionLeaning === "going", "decisionLeaning（生 enum）");
  assert(v.decisionOwner === "self", "decisionOwner（生 enum）");
  assert(v.stated.length === 0, "stated[] は空");
  assert(v.hasEnoughContext === false, "decision だけでは false");
}

console.log("Case 7: inferred timing + stated budget → inferred 除外、budget 1 カテゴリのみ、false");
{
  const k = freshKarte();
  k.timing.departureTiming = I("来年くらい");
  k.budget.totalCap = S(1200000);
  const v = buildStudyPlanView(k);
  assert(!has(v.stated, "timing", "departureTiming"), "inferred timing は stated[] に入らない");
  assert(has(v.stated, "budget", "totalCap"), "stated budget は入る");
  assert(v.hasEnoughContext === false, "有効カテゴリ 1 なので false");
}

console.log("Case 8: unknown 除外");
{
  const k = freshKarte(); // 全 field unknown
  const v = buildStudyPlanView(k);
  assert(v.stated.length === 0, "unknown だけなら stated[] 空");
  assert(
    v.purpose === undefined &&
      v.decisionStage === undefined &&
      v.decisionLeaning === undefined &&
      v.decisionOwner === undefined &&
      v.statedDeadline === undefined,
    "top-level は全て undefined",
  );
  assert(v.hasEnoughContext === false, "false");
}

console.log("Case 9: trueGoalHypothesis が stated でも完全除外");
{
  const k = freshKarte();
  k.motivation.trueGoalHypothesis = S("本当は今の環境から離れたいのかもしれない");
  k.motivation.statedGoal = S("英語を伸ばしたい");
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  const v = buildStudyPlanView(k);
  const json = JSON.stringify(v);
  assert(!has(v.stated, "motivation", "trueGoalHypothesis"), "stated[] に入らない");
  assert(!json.includes("本当は今の環境"), "view のどこにも trueGoalHypothesis の値が出ない");
  assert(v.purpose === "英語を伸ばしたい", "purpose は statedGoal のみ（trueGoalHypothesis ではない）");
}

console.log("Case 10: profile / personality / support / proposals を stated[] へ入れない");
{
  const k = freshKarte();
  k.profile.age = S(22, "profile");
  k.profile.occupation = S("大学生", "profile");
  k.personality.introExtro = S("内向的");
  k.support.scope = S(["出願", "ビザ"]);
  k.proposals.presented = [
    { type: "school", id: "some-school-slug", category: "match", reason: "英語コースが充実", caveat: "" },
  ];
  // 計画条件も 2 つ入れて hasEnoughContext を成立させておく
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  const v = buildStudyPlanView(k);
  assert(!has(v.stated, "profile", "age"), "profile.age は stated[] に入らない");
  assert(!has(v.stated, "personality", "introExtro"), "personality は入らない");
  assert(!has(v.stated, "support", "scope"), "support は入らない");
  const json = JSON.stringify(v);
  assert(!json.includes("some-school-slug") && !json.includes("英語コースが充実"), "proposals は view に出ない");
  assert(v.hasEnoughContext === true, "計画条件 2 カテゴリは満たしている");
}

console.log("Case 11: openQuestions cleanup + dedupe（元順維持）");
{
  const k = freshKarte();
  k.handoff.openQuestions = ["  希望する都市  ", "予算の融通", "希望する都市", "", " 予算の融通 "];
  const v = buildStudyPlanView(k);
  assert(
    JSON.stringify(v.openQuestionLabels) === JSON.stringify(["希望する都市", "予算の融通"]),
    "trim・空除去・重複除去、最初に出た順",
  );
}

console.log("Case 12: unknown を openQuestion へ自動変換しない");
{
  const k = freshKarte();
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  // budget.monthlyCap / schoolPrefs.* 等は unknown のまま。openQuestions は未設定。
  const v = buildStudyPlanView(k);
  assert(v.openQuestionLabels.length === 0, "openQuestionLabels は空（unknown ≠ open question）");
}

console.log("Case 13: conflict topic label だけ抽出");
{
  const k = freshKarte();
  k.handoff.conflicts = [
    {
      block: "budget",
      key: "totalCap",
      existingValue: 800000,
      existingSource: "worksheet",
      incomingValue: 1200000,
      incomingSource: "chat",
    },
  ];
  const v = buildStudyPlanView(k);
  assert(JSON.stringify(v.conflictTopics) === JSON.stringify(["総予算"]), "conflictTopics は『総予算』のみ");
}

console.log("Case 14: conflict の existing/incoming 値・source metadata が view に無い");
{
  const k = freshKarte();
  k.handoff.conflicts = [
    {
      block: "schoolPrefs",
      key: "preferredCity",
      existingValue: "オークランド",
      existingSource: "worksheet",
      incomingValue: "シドニー",
      incomingSource: "chat",
    },
  ];
  const json = JSON.stringify(buildStudyPlanView(k));
  assert(!json.includes("オークランド") && !json.includes("existingSource"), "existing/incoming 値・source が出ない");
  assert(!json.includes("incomingValue") && !json.includes("incomingSource"), "raw metadata キーが出ない");
}

console.log("Case 15: conflict 中の stated field を stated[] から除外");
{
  const k = freshKarte();
  k.budget.totalCap = S(1200000);
  k.handoff.conflicts = [
    { block: "budget", key: "totalCap", existingValue: 8, existingSource: "worksheet", incomingValue: 12, incomingSource: "chat" },
  ];
  const v = buildStudyPlanView(k);
  assert(!has(v.stated, "budget", "totalCap"), "conflict 中の budget.totalCap は stated[] に入らない");
  assert(v.conflictTopics.includes("総予算"), "代わりに conflictTopics へ");
}

console.log("Case 16: timing stated + conflict 中 budget → hasEnoughContext = false");
{
  const k = freshKarte();
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1200000);
  k.handoff.conflicts = [
    { block: "budget", key: "totalCap", existingValue: 8, existingSource: "worksheet", incomingValue: 12, incomingSource: "chat" },
  ];
  const v = buildStudyPlanView(k);
  assert(has(v.stated, "timing", "departureTiming"), "timing は有効");
  assert(!has(v.stated, "budget", "totalCap"), "budget は conflict で除外");
  assert(v.hasEnoughContext === false, "有効カテゴリ 1（timing のみ）→ false");
}

console.log("Case 17: decision.stage stated → decisionStage");
{
  const k = freshKarte();
  k.decision.stage = S("比較検討中");
  assert(buildStudyPlanView(k).decisionStage === "比較検討中", "decisionStage = '比較検討中'");
}

console.log("Case 18: decision.stage inferred → undefined");
{
  const k = freshKarte();
  k.decision.stage = I("比較検討中");
  assert(buildStudyPlanView(k).decisionStage === undefined, "inferred stage は undefined");
}

console.log("Case 19: decision.leaning stated → decisionLeaning（生 enum）");
{
  const k = freshKarte();
  k.decision.leaning = leaningField("not_going");
  assert(buildStudyPlanView(k).decisionLeaning === "not_going", "生 enum のまま（日本語変換しない）");
}

console.log("Case 20: decision.leaning inferred → undefined");
{
  const k = freshKarte();
  k.decision.leaning = leaningField("going", "inferred");
  assert(buildStudyPlanView(k).decisionLeaning === undefined, "inferred leaning は undefined");
}

console.log("Case 21: decisionOwner stated → top-level");
{
  const k = freshKarte();
  k.decision.decisionOwner = ownerField("parent");
  assert(buildStudyPlanView(k).decisionOwner === "parent", "decisionOwner = 'parent'（生 enum）");
}

console.log("Case 22: timing.deadline stated → statedDeadline");
{
  const k = freshKarte();
  k.timing.deadline = S("3〜4ヶ月以内に学校を決める");
  assert(
    buildStudyPlanView(k).statedDeadline === "3〜4ヶ月以内に学校を決める",
    "statedDeadline は timing.deadline の値そのまま",
  );
}

console.log("Case 23: timing.deadline inferred → undefined");
{
  const k = freshKarte();
  k.timing.deadline = I("たぶん来月には");
  assert(buildStudyPlanView(k).statedDeadline === undefined, "inferred deadline は undefined");
}

console.log("Case 24: handoff.nextAction があっても view へ出ない");
{
  const k = freshKarte();
  k.handoff.nextAction = "来月エージェントに問い合わせる";
  const v = buildStudyPlanView(k) as Record<string, unknown>;
  assert(!("nextAction" in v) && !("statedNextAction" in v), "view に nextAction / statedNextAction キーが無い");
  assert(!JSON.stringify(v).includes("来月エージェントに問い合わせる"), "値もどこにも出ない");
}

console.log("Case 25: preferredCity から country を推測しない");
{
  const k = freshKarte();
  k.schoolPrefs.preferredCity = S("シドニー");
  k.timing.departureTiming = S("春");
  const v = buildStudyPlanView(k);
  const item = v.stated.find((i) => i.block === "schoolPrefs" && i.key === "preferredCity");
  assert(item?.value === "シドニー", "値は『シドニー』そのまま");
  const json = JSON.stringify(v);
  assert(!/Australia|オーストラリア|豪州/.test(json), "国名を補完していない");
}

console.log("Case 26: proposals.presented があっても view に出ない");
{
  const k = freshKarte();
  k.proposals.presented = [
    { type: "school", id: "abc-language-school", category: "match", reason: "立地が希望に合う", caveat: "学費やや高め" },
    { type: "area", id: "gold-coast", category: "reference", reason: "海が近い", caveat: "" },
  ];
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  const json = JSON.stringify(buildStudyPlanView(k));
  assert(!json.includes("abc-language-school") && !json.includes("gold-coast"), "proposal id が出ない");
  assert(!json.includes("立地が希望に合う") && !json.includes("学費やや高め"), "proposal reason / caveat が出ない");
}

console.log("Case 27: purpose + timing → false");
{
  const k = freshKarte();
  k.motivation.statedGoal = S("英語を伸ばしたい");
  k.timing.departureTiming = S("春");
  const v = buildStudyPlanView(k);
  assert(v.purpose !== undefined, "purpose は入る");
  assert(v.hasEnoughContext === false, "計画条件は timing 1 カテゴリ → false");
}

console.log("Case 28: purpose + timing + budget → true");
{
  const k = freshKarte();
  k.motivation.statedGoal = S("英語を伸ばしたい");
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  assert(buildStudyPlanView(k).hasEnoughContext === true, "計画条件 2 カテゴリ → true（purpose は数えない）");
}

console.log("Case 29: decision + timing → false");
{
  const k = freshKarte();
  k.decision.stage = S("情報収集中");
  k.timing.departureTiming = S("春");
  assert(buildStudyPlanView(k).hasEnoughContext === false, "decision は数えない → timing 1 カテゴリ → false");
}

console.log("Case 30: decision + timing + budget → true");
{
  const k = freshKarte();
  k.decision.stage = S("情報収集中");
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  assert(buildStudyPlanView(k).hasEnoughContext === true, "計画条件 2 カテゴリ → true");
}

console.log("Case 31: 入力 Karte を mutate しない");
{
  const k = freshKarte();
  k.motivation.trueGoalHypothesis = S("自立したい");
  k.motivation.statedGoal = S("英語を伸ばしたい");
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  k.handoff.openQuestions = ["希望する都市", "希望する都市"];
  k.handoff.conflicts = [
    { block: "schoolPrefs", key: "preferredCity", existingValue: "a", existingSource: "worksheet", incomingValue: "b", incomingSource: "chat" },
  ];
  const before = JSON.stringify(k);
  buildStudyPlanView(k);
  assert(JSON.stringify(k) === before, "呼び出し前後で入力 Karte は不変");
  assert(k.motivation.trueGoalHypothesis.certainty === "stated", "元 Karte の certainty も書き換えていない");
}

console.log("Case 32: openQuestions / conflicts だけ → false");
{
  const k = freshKarte();
  k.handoff.openQuestions = ["希望する都市"];
  k.handoff.conflicts = [
    { block: "budget", key: "totalCap", existingValue: 1, existingSource: "worksheet", incomingValue: 2, incomingSource: "chat" },
  ];
  const v = buildStudyPlanView(k);
  assert(v.stated.length === 0, "stated[] 空");
  assert(v.hasEnoughContext === false, "false");
}

console.log("Case 33: stated[] は BLOCK_SPECS の順序を維持（独自 sort しない）");
{
  const k = freshKarte();
  // BLOCK_SPECS 順: ... language, budget, timing, ... constraints, ... schoolPrefs ...
  k.schoolPrefs.preferredCity = S("シドニー");
  k.timing.departureTiming = S("春");
  k.budget.totalCap = S(1000000);
  k.constraints.visaConstraints = S("学生ビザのみ");
  k.language.selfLevel = S("初級");
  const blocks = buildStudyPlanView(k).stated.map((i) => i.block);
  const order = ["language", "budget", "timing", "constraints", "schoolPrefs"];
  const filtered = blocks.filter((b) => order.includes(b));
  assert(
    JSON.stringify(filtered) === JSON.stringify(order),
    `block 順が BLOCK_SPECS 準拠（実際: ${JSON.stringify(filtered)}）`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
