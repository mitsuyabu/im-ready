/**
 * lib/schoolComparisonFormatter.ts の動作確認（Step 24）。
 * DB・Anthropic・Web・Places に触れない pure test。fixture は全て架空データ。
 * prompt/文言の完全一致ではなく、構造・安全ルール・決定性を substring で確認する。
 *
 * 実行方法: npx tsx scripts/test-school-comparison-formatter.ts
 */

import type { BlockName } from "@/lib/karte";
import type {
  SchoolComparisonCriterion,
  SchoolComparisonFacts,
  SchoolComparisonSchool,
  SchoolComparisonView,
} from "@/lib/schoolComparisonView";
import {
  canGenerateSchoolComparison,
  formatSchoolComparison,
  SCHOOL_COMPARISON_DEFAULT_TITLE,
} from "@/lib/schoolComparisonFormatter";

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

function crit(block: BlockName, key: string, label: string, value: string): SchoolComparisonCriterion {
  return { block, key, label, value, source: "chat" };
}
function sch(
  slug: string,
  name: string,
  over: Partial<SchoolComparisonSchool> & { facts?: SchoolComparisonFacts } = {},
): SchoolComparisonSchool {
  return {
    slug,
    name,
    category: over.category ?? "match",
    city: over.city,
    country: over.country,
    facts: over.facts ?? {},
    ...over,
  };
}
function view(over: Partial<SchoolComparisonView> = {}): SchoolComparisonView {
  return {
    schools: [],
    userCriteria: [],
    conflictTopics: [],
    unresolvedSlugs: [],
    hasEnoughContext: false,
    ...over,
  };
}

const TWO_SCHOOLS: SchoolComparisonSchool[] = [
  sch("alpha", "Alpha College", { city: "シドニー", country: "オーストラリア" }),
  sch("beta", "Beta Institute", { city: "メルボルン", country: "オーストラリア" }),
];

console.log("Case 1: DEFAULT_TITLE");
assert(SCHOOL_COMPARISON_DEFAULT_TITLE === "現在の学校候補の比較", "'現在の学校候補の比較'");

console.log("Case 2: canGenerate true");
assert(canGenerateSchoolComparison(view({ hasEnoughContext: true })) === true, "hasEnoughContext=true → true");

console.log("Case 3: canGenerate false");
assert(canGenerateSchoolComparison(view({ hasEnoughContext: false })) === false, "hasEnoughContext=false → false");

const BASE = view({
  schools: TWO_SCHOOLS,
  userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
  hasEnoughContext: true,
});
const baseOut = formatSchoolComparison(BASE);

console.log("Case 4: 学校一覧が出る");
assert(baseOut.includes("■ 今回比較する学校"), "見出し");
assert(baseOut.includes("Alpha College") && baseOut.includes("Beta Institute"), "両校名");

console.log("Case 5: 元順を維持");
assert(baseOut.indexOf("Alpha College") < baseOut.indexOf("Beta Institute"), "alpha が先");

console.log("Case 6: category は ranking にならない");
{
  const v = view({
    schools: [sch("a", "A", { city: "x", category: "match" }), sch("b", "B", { city: "y", category: "reference" })],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "x")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("区分：候補") && o.includes("区分：参考候補"), "候補 / 参考候補 のラベル");
  assert(!/1位|2位|第一候補|順位|ランキング/.test(o), "順位表現なし");
}

console.log("Case 7: user criteria が出る");
assert(baseOut.includes("■ あなたが大切にしている条件"), "見出し");
assert(baseOut.includes("希望する都市：シドニー"), "label：value");

console.log("Case 8: source attribution は出さない");
{
  const v = view({
    schools: TWO_SCHOOLS,
    userCriteria: [{ ...crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), source: "worksheet" }],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(!/worksheet|chat由来|profile由来|（chat）/.test(o), "source が本文に出ない");
}

console.log("Case 9: budget criteria は『大切にしている条件』に出る");
{
  const v = view({
    schools: TWO_SCHOOLS,
    userCriteria: [crit("budget", "totalCap", "総予算", "3000000")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("総予算：3000000円"), "総予算が条件セクションに（円 単位付き）");
}

console.log("Case 10: budget fit は『条件との合い方』に絶対出ない");
{
  const v = view({
    schools: TWO_SCHOOLS,
    userCriteria: [crit("budget", "totalCap", "総予算", "3000000")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  const fitIdx = o.indexOf("■ 条件との合い方");
  // budget しか criterion が無いので「条件との合い方」セクション自体が出ない
  assert(fitIdx === -1, "『条件との合い方』セクションが無い（budget のみ）");
  assert(!/総予算：条件に合っている|総予算：確認が必要|総予算：判断材料なし/.test(o), "総予算に verdict を付けない");
}

console.log("Case 11: budget disclaimer");
{
  const v = view({
    schools: TWO_SCHOOLS,
    userCriteria: [crit("budget", "totalCap", "総予算", "3000000")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("■ まだ比較できないこと"), "まだ比較できないこと セクション");
  assert(o.includes("学校の授業料だけでは留学全体の総予算との適合を判断できない"), "budget disclaimer 固定文");
}

console.log("Case 12: school facts が出る");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { courses: ["General English"], intakeNote: "毎週月曜入学可", levels: "6レベル" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("■ 学校ごとの比較"), "見出し");
  assert(o.includes("コース：General English") && o.includes("入学時期：毎週月曜入学可"), "facts が項目：値で");
}

console.log("Case 13: 他校にあるが該当校に無い field → 情報なし");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { classSizeAvg: 14 } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("クラス人数：平均14人"), "A はクラス人数あり");
  assert(o.includes("クラス人数：情報なし"), "B は『情報なし』");
}

console.log("Case 14: 全校で欠落している field は行ごと省略");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: {} }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(!o.includes("クラス人数："), "誰も持たない項目は出ない");
  assert(!o.includes("日本人比率："), "同上");
}

console.log("Case 15: fee は source + fetchedAt が両方そろう学校で表示");
{
  const v = view({
    schools: [
      sch("a", "A", {
        city: "シドニー", country: "オーストラリア",
        facts: { tuitionWeekly: { currency: "AUD", min: 380, max: 460 }, source: "学校公式", fetchedAt: "2026-06" },
      }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("授業料目安：AUD 380〜460 / 週"), "fee range が表示");
  assert(o.includes("（学校公式、2026-06時点）"), "freshness 注記");
}

console.log("Case 16: fee source 欠落 → 金額を出さない");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { tuitionWeekly: { currency: "AUD", min: 380, max: 460 }, fetchedAt: "2026-06" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(!o.includes("AUD 380") && !o.includes("授業料目安"), "source 欠落なら金額非表示");
}

console.log("Case 17: fee fetchedAt 欠落 → 金額を出さない");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { tuitionWeekly: { currency: "AUD", min: 380, max: 460 }, source: "学校公式" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(!o.includes("AUD 380") && !o.includes("授業料目安"), "fetchedAt 欠落なら金額非表示");
}

console.log("Case 18: fee range の整形（min===max なら単一値・通貨記号変換なし）");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { enrollmentFee: { currency: "AUD", min: 250, max: 250 }, source: "S", fetchedAt: "2026-06" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("入学金目安：AUD 250（"), "min===max は単一値、currency はそのまま AUD");
  assert(!o.includes("$") && !o.includes("豪ドル"), "通貨記号・和名へ変換しない");
}

console.log("Case 19: fee freshness 注記に source / fetchedAt の生値");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { tuitionWeekly: { currency: "AUD", min: 400, max: 400 }, source: "IDP調べ", fetchedAt: "2025-11" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("（IDP調べ、2025-11時点）"), "生値をそのまま");
  // freshness 注記は「〜時点」の事実表示であり、その金額が「最新」だとは断定しない
  const feeLine = o.split("\n").find((l) => l.includes("授業料目安：")) ?? "";
  assert(!feeLine.includes("最新"), "金額の行で『最新』と断定しない");
}

console.log("Case 20: fee がある場合のみ 金額 disclaimer");
{
  const withFee = formatSchoolComparison(view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { tuitionWeekly: { currency: "AUD", min: 1, max: 2 }, source: "S", fetchedAt: "2026-06" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  }));
  assert(withFee.includes("金額は学校データ取得時点の目安です"), "fee あり → disclaimer");
  assert(!baseOut.includes("金額は学校データ取得時点の目安です"), "fee なし → disclaimer なし");
}

console.log("Case 21: fit match の表示");
{
  const v = view({
    schools: [sch("a", "A", { city: "シドニー", country: "オーストラリア" }), sch("b", "B", { city: "メルボルン", country: "オーストラリア" })],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("■ 条件との合い方"), "見出し");
  assert(o.includes("希望する都市：条件に合っている"), "match → 条件に合っている");
}

console.log("Case 22: fit check の表示");
{
  const v = view({
    schools: [sch("a", "A", { city: "パース", country: "オーストラリア" }), sch("b", "B", { city: "メルボルン", country: "オーストラリア" })],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("希望する都市：確認が必要"), "check → 確認が必要");
}

console.log("Case 23: fit no_data の表示");
{
  const v = view({
    schools: [sch("a", "A", { city: undefined, country: "オーストラリア" }), sch("b", "B", { city: undefined, country: "オーストラリア" })],
    userCriteria: [crit("schoolPrefs", "courseType", "コース種類", "一般英語")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  // 全校 no_data の場合は「まだ比較できないこと」へ回る（Case 26）ので、ここは 1 校だけ no_data のケース
  const v2 = view({
    schools: [
      sch("a", "A", { city: "x", country: "オーストラリア", facts: { courses: ["General English"] } }),
      sch("b", "B", { city: "y", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "courseType", "コース種類", "一般英語")],
    hasEnoughContext: true,
  });
  const o2 = formatSchoolComparison(v2);
  assert(o2.includes("コース種類：判断材料なし"), "no_data → 判断材料なし");
  assert(o !== "", "空でない");
}

console.log("Case 24: basis（根拠）が出る");
{
  const v = view({
    schools: [sch("a", "A", { city: "シドニー", country: "オーストラリア" }), sch("b", "B", { city: "メルボルン", country: "オーストラリア" })],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("根拠：希望：シドニー／学校：シドニー"), "根拠行");
}

console.log("Case 25: conflictTopics が『まだ比較できないこと』へ");
{
  const v = view({
    schools: TWO_SCHOOLS,
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    conflictTopics: ["総予算", "希望する都市"],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("■ まだ比較できないこと"), "見出し");
  assert(o.includes("総予算：情報の整理が必要です"), "conflict topic");
}

console.log("Case 26: 全校 no_data の criterion → まだ比較できないこと");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "x", country: "オーストラリア", facts: {} }),
      sch("b", "B", { city: "y", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [
      crit("schoolPrefs", "preferredCity", "希望する都市", "x"),
      crit("schoolPrefs", "courseType", "コース種類", "一般英語"),
    ],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("コース種類：候補校のデータが不足しているため比較できません"), "全校 no_data → まだ比較できないこと");
}

console.log("Case 27: presentedReason セクション");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", presentedReason: "希望都市に合致し英語コースが充実" }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("■ 候補として提示された理由・メモ"), "見出し");
  assert(o.includes("候補として提示された理由：希望都市に合致し英語コースが充実"), "reason 本文");
  assert(o.includes("学校の客観的な事実情報とは別のもの"), "disclaimer");
}

console.log("Case 28: caveat セクション");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", presentedCaveat: "希望より学費が高め" }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("提示時のメモ：希望より学費が高め"), "caveat 本文");
}

console.log("Case 29: presentedReason を学校 fact 扱いしない（学校ごとの比較セクションに出さない）");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", presentedReason: "REASON_MARKER_XYZ", facts: { courses: ["General English"] } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  const factsIdx = o.indexOf("■ 学校ごとの比較");
  const reasonIdx = o.indexOf("■ 候補として提示された理由・メモ");
  const markerIdx = o.indexOf("REASON_MARKER_XYZ");
  assert(markerIdx > reasonIdx, "reason は理由・メモセクション内にだけ現れる");
  assert(!(markerIdx > factsIdx && markerIdx < reasonIdx), "学校ごとの比較セクションには現れない");
}

console.log("Case 30: sourceUrl の表示");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { sourceUrl: ["https://example.com/a1", "https://example.com/a2"] } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("参照先：https://example.com/a1") && o.includes("参照先：https://example.com/a2"), "複数 URL を 1 行ずつ");
}

console.log("Case 31: sourceUrl の fetch / 要約はしない（URL 文字列をそのまま出すだけ）");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { sourceUrl: ["https://example.com/only"] } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(o.includes("https://example.com/only"), "URL がそのまま");
  assert(!/公式サイト|によると|要約/.test(o.split("https://example.com/only")[1] ?? ""), "URL の中身の説明を付けない");
}

console.log("Case 32: 『情報なし』注記（使われた場合のみ）");
{
  const withInfoNashi = formatSchoolComparison(view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { classSizeAvg: 14 } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: {} }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  }));
  assert(withInfoNashi.includes("「情報なし」は、当サービスの学校データに"), "情報なし注記");
  const noInfoNashi = formatSchoolComparison(view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア" }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア" }),
    ],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー")],
    hasEnoughContext: true,
  }));
  assert(!noInfoNashi.includes("「情報なし」は、当サービスの学校データに"), "情報なし未使用なら注記なし");
}

console.log("Case 33-35: recommendation / ranking / score を出さない");
{
  const v = view({
    schools: [
      sch("a", "A", { city: "シドニー", country: "オーストラリア", presentedReason: "r", presentedCaveat: "c", facts: { courses: ["X"], levels: "L", tuitionWeekly: { currency: "AUD", min: 1, max: 2 }, source: "S", fetchedAt: "2026-06" } }),
      sch("b", "B", { city: "メルボルン", country: "オーストラリア", facts: { courses: ["Y"] } }),
    ],
    userCriteria: [
      crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"),
      crit("budget", "totalCap", "総予算", "3000000"),
      crit("constraints", "avoidCountries", "避けたい国", "アメリカ"),
    ],
    conflictTopics: ["語学レベル"],
    hasEnoughContext: true,
  });
  const o = formatSchoolComparison(v);
  assert(!/おすすめ|ベスト|一番合う|第一候補|最適|この学校に決め|向いています/.test(o), "推薦表現なし");
  assert(!/1位|2位|3位|順位|ランキング|ランク/.test(o), "順位なし");
  assert(!/[0-9]+点|[0-9]+%|★|☆|スコア|score/.test(o), "score / % / 星 なし");
}

console.log("Case 36: Markdown table を使わない");
{
  assert(!baseOut.includes("|") || !/\|.*\|.*\|/.test(baseOut), "パイプ区切りの表がない");
  assert(!baseOut.includes("---|---"), "table 区切りがない");
}

console.log("Case 37: Markdown heading / 装飾を使わない");
{
  assert(!/^#{1,6}\s/m.test(baseOut), "# 見出しなし");
  assert(!baseOut.includes("**") && !baseOut.includes("__"), "太字記号なし");
  assert(!baseOut.includes("`"), "バッククォートなし");
  assert(!/^-\s/m.test(baseOut) && !/^\*\s/m.test(baseOut), "行頭 - / * の箇条書きなし");
  assert(baseOut.includes("■ "), "見出しは ■");
}

console.log("Case 38: plain text structured（■ 見出し ＋ 項目：値）");
{
  assert(baseOut.split("\n")[0] === "現在の学校候補の比較", "1 行目はタイトル");
  assert(/：/.test(baseOut), "全角コロンの項目：値");
}

console.log("Case 39: 同じ view → 同じ出力（決定的）");
{
  const a = formatSchoolComparison(BASE);
  const b = formatSchoolComparison(BASE);
  assert(a === b, "2 回呼んで同一");
}

console.log("Case 40: 入力 view を mutate しない");
{
  const v = view({
    schools: [sch("a", "A", { city: "シドニー", country: "オーストラリア", facts: { courses: ["X"], sourceUrl: ["u"] } }), sch("b", "B", { city: "メルボルン", country: "オーストラリア" })],
    userCriteria: [crit("schoolPrefs", "preferredCity", "希望する都市", "シドニー"), crit("budget", "totalCap", "総予算", "3000000")],
    conflictTopics: ["語学レベル"],
    hasEnoughContext: true,
  });
  const before = JSON.stringify(v);
  formatSchoolComparison(v);
  canGenerateSchoolComparison(v);
  assert(JSON.stringify(v) === before, "呼び出し前後で view は不変");
}

console.log("Case 41: 空 view でも安全な文字列");
{
  const o = formatSchoolComparison(view());
  assert(o.startsWith("現在の学校候補の比較"), "タイトルは出る");
  assert(o.includes("比較できる学校情報がありません"), "学校 0 のフォールバック文");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
