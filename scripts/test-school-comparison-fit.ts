/**
 * lib/schoolComparisonFit.ts の動作確認（Step 24）。
 * DB・Anthropic・Web・Places に触れない pure test。fixture は全て架空データ。
 *
 * 実行方法: npx tsx scripts/test-school-comparison-fit.ts
 */

import type { BlockName } from "@/lib/karte";
import type {
  SchoolComparisonCriterion,
  SchoolComparisonFacts,
  SchoolComparisonSchool,
} from "@/lib/schoolComparisonView";
import { computeFit } from "@/lib/schoolComparisonFit";

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

function crit(block: BlockName, key: string, label: string, value: string): SchoolComparisonCriterion {
  return { block, key, label, value, source: "chat" };
}

function sch(over: Partial<SchoolComparisonSchool> & { facts?: SchoolComparisonFacts } = {}): SchoolComparisonSchool {
  return {
    slug: over.slug ?? "s1",
    name: over.name ?? "Test School",
    category: over.category ?? "match",
    city: over.city,
    country: over.country,
    facts: over.facts ?? {},
    ...over,
  };
}

console.log("Case 1: preferredCity 完全一致 → match");
{
  const r = computeFit(crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), sch({ city: "シドニー" }));
  assert(r?.verdict === "match", "verdict = match");
  assert(r?.basis.includes("希望：シドニー") && r?.basis.includes("学校：シドニー"), "basis に希望と学校");
}

console.log("Case 2: preferredCity 非一致 → check（『合っていない』とは断定しない）");
{
  const r = computeFit(crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), sch({ city: "メルボルン" }));
  assert(r?.verdict === "check", "verdict = check");
  assert(r?.basis.includes("シドニー") && r?.basis.includes("メルボルン"), "basis に両方の値");
  assert(!/合っていない|不一致|合わない/.test(r?.basis ?? ""), "『合っていない』等を書かない");
}

console.log("Case 3: city 情報なし → no_data");
{
  const r = computeFit(crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), sch({ city: undefined }));
  assert(r?.verdict === "no_data", "verdict = no_data");
}

console.log("Case 4: city の翻訳を推測しない（Sydney ↔ シドニー は一致にしない）");
{
  const r = computeFit(crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), sch({ city: "Sydney" }));
  assert(r?.verdict === "check", "英語表記と日本語表記は決定的一致にしない（check）");
}

console.log("Case 5: pathway 希望 + 学校 hasPathway=true → match");
{
  const r = computeFit(crit("language", "pathwayIntent", "進学意向", "あり"), sch({ facts: { hasPathway: true } }));
  assert(r?.verdict === "match", "verdict = match");
}

console.log("Case 6: pathway 希望 + 学校 hasPathway=false → check");
{
  const r = computeFit(crit("language", "pathwayIntent", "進学意向", "あり"), sch({ facts: { hasPathway: false } }));
  assert(r?.verdict === "check", "verdict = check");
  assert(r?.basis.includes("提携なし"), "basis にパスウェイ提携なし");
}

console.log("Case 7: pathway 学校 undefined → no_data");
{
  const r = computeFit(crit("language", "pathwayIntent", "進学意向", "あり"), sch({ facts: {} }));
  assert(r?.verdict === "no_data", "verdict = no_data");
}

console.log("Case 7b: 本人が進学を希望していない場合は hasPathway=true でも match にしない");
{
  const r = computeFit(crit("language", "pathwayIntent", "進学意向", "なし"), sch({ facts: { hasPathway: true } }));
  assert(r?.verdict === "check", "希望なし → check（無意味な合致判定をしない）");
}

console.log("Case 8: courseType が canonical enum で学校 courseCategories に含まれる → match");
{
  const r = computeFit(
    crit("schoolPrefs", "courseType", "コース種類", "general_english"),
    sch({ facts: { courseCategories: ["general_english", "business_english"] } }),
  );
  assert(r?.verdict === "match", "canonical 一致は match");
}

console.log("Case 9: courseType が自由文・学校は courses のみ → check");
{
  const r = computeFit(
    crit("schoolPrefs", "courseType", "コース種類", "一般英語コース"),
    sch({ facts: { courses: ["General English", "IELTS Prep"] } }),
  );
  assert(r?.verdict === "check", "自由文は決定的一致にしない（check）");
  assert(r?.basis.includes("General English"), "basis に学校のコースを引用");
}

console.log("Case 10: course データなし → no_data");
{
  const r = computeFit(crit("schoolPrefs", "courseType", "コース種類", "一般英語"), sch({ facts: {} }));
  assert(r?.verdict === "no_data", "verdict = no_data");
}

console.log("Case 11: accommodation が canonical enum で学校 options に含まれる → match");
{
  const r = computeFit(
    crit("schoolPrefs", "accommodation", "滞在スタイル", "homestay"),
    sch({ facts: { accommodationOptions: ["homestay", "dormitory"] } }),
  );
  assert(r?.verdict === "match", "canonical 一致は match");
}

console.log("Case 12: accommodation が自由文・学校は note のみ → check");
{
  const r = computeFit(
    crit("schoolPrefs", "accommodation", "滞在スタイル", "ホームステイ希望"),
    sch({ facts: { accommodationNote: "ホームステイ 415/週から" } }),
  );
  assert(r?.verdict === "check", "自由文は check");
}

console.log("Case 13: sizeNationality データあり → check");
{
  const r = computeFit(
    crit("schoolPrefs", "sizeNationality", "学校規模・国籍構成", "小規模で国籍多様"),
    sch({ facts: { classSizeAvg: 12, japaneseRatio: "10%程度" } }),
  );
  assert(r?.verdict === "check", "データありは check（自由文の意味判定はしない）");
}

console.log("Case 14: sizeNationality データなし → no_data");
{
  const r = computeFit(
    crit("schoolPrefs", "sizeNationality", "学校規模・国籍構成", "小規模"),
    sch({ facts: {} }),
  );
  assert(r?.verdict === "no_data", "verdict = no_data");
}

console.log("Case 15: startFlexibility intakeNote あり → check / なし → no_data");
{
  const yes = computeFit(
    crit("schoolPrefs", "startFlexibility", "開始時期の融通", "毎週入学したい"),
    sch({ facts: { intakeNote: "毎週月曜入学可" } }),
  );
  assert(yes?.verdict === "check", "intakeNote あり → check");
  const no = computeFit(
    crit("schoolPrefs", "startFlexibility", "開始時期の融通", "毎週入学したい"),
    sch({ facts: {} }),
  );
  assert(no?.verdict === "no_data", "intakeNote なし → no_data");
}

console.log("Case 16: selfLevel levels あり → check / なし → no_data");
{
  const yes = computeFit(
    crit("language", "selfLevel", "語学レベル", "中級"),
    sch({ facts: { levels: "初級〜上級 6レベル" } }),
  );
  assert(yes?.verdict === "check", "levels あり → check");
  const no = computeFit(crit("language", "selfLevel", "語学レベル", "中級"), sch({ facts: {} }));
  assert(no?.verdict === "no_data", "levels なし → no_data");
}

console.log("Case 17: budget.totalCap → null（fit 判定しない）");
{
  assert(computeFit(crit("budget", "totalCap", "総予算", "3000000"), sch({ facts: {} })) === null, "null");
}

console.log("Case 18: budget.monthlyCap → null");
{
  assert(computeFit(crit("budget", "monthlyCap", "月あたり予算", "200000"), sch({ facts: {} })) === null, "null");
}

console.log("Case 19: durationWeeks を fit に使わない（対象外 key → null）");
{
  assert(computeFit(crit("timing", "durationWeeks", "期間", "24"), sch({ facts: {} })) === null, "対象外は null");
}

console.log("Case 20: avoidCountries に学校の国が明示的に該当 → check");
{
  const r = computeFit(
    crit("constraints", "avoidCountries", "避けたい国", "アメリカ、オーストラリア"),
    sch({ country: "オーストラリア", facts: {} }),
  );
  assert(r?.verdict === "check", "該当 → check");
  assert(r?.basis.includes("オーストラリア"), "basis に該当国");
}

console.log("Case 21: avoidCountries 非該当 → 過剰 match しない（限定された事実の basis）");
{
  const r = computeFit(
    crit("constraints", "avoidCountries", "避けたい国", "アメリカ、カナダ"),
    sch({ country: "オーストラリア", facts: {} }),
  );
  assert(r?.verdict === "match", "非該当 → match（限定的）");
  assert(r?.basis.includes("には含まれていません"), "『避けたい国には含まれていない』という限定 basis");
  assert(!/合っています|向いています|おすすめ|最適/.test(r?.basis ?? ""), "学校全体を推奨する表現は無い");
}

console.log("Case 21b: avoidCountries が空文字 → null");
{
  assert(computeFit(crit("constraints", "avoidCountries", "避けたい国", ""), sch({ country: "オーストラリア" })) === null, "空は null");
}

console.log("Case 22: SchoolFitResult に score / % / 星 が無い");
{
  const r = computeFit(crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), sch({ city: "シドニー" }));
  const keys = Object.keys(r ?? {}).sort();
  assert(JSON.stringify(keys) === JSON.stringify(["basis", "verdict"]), "キーは verdict / basis のみ");
  assert(!/[%★☆]|score|点/.test(JSON.stringify(r)), "score / % / 星 / 点 が無い");
}

console.log("Case 23: 入力を mutate しない");
{
  const c = crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー");
  const s = sch({ city: "シドニー", facts: { courses: ["A", "B"], hasPathway: true } });
  const cBefore = JSON.stringify(c);
  const sBefore = JSON.stringify(s);
  computeFit(c, s);
  assert(JSON.stringify(c) === cBefore && JSON.stringify(s) === sBefore, "criterion / school とも不変");
}

console.log("Case 24: external knowledge を使わない（入力に無い都市名を補完しない）");
{
  // 学校 city が空でも、criterion の値や国名から都市を推測して match にしない
  const r = computeFit(
    crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"),
    sch({ city: "", country: "オーストラリア", facts: {} }),
  );
  assert(r?.verdict === "no_data", "city 空なら no_data（国から都市を補完しない）");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
