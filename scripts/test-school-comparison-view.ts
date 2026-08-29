/**
 * lib/schoolComparisonView.ts の動作確認用スクリプト（Step 23）。
 * 新しい test framework は導入せず、既に devDependency にある tsx で直接実行するだけの、
 * DB・Anthropic・Web・Places に一切触れない pure test。fixture は全て架空の学校データ。
 *
 * 実行方法: npx tsx scripts/test-school-comparison-view.ts
 */

import { createEmptyKarte, type FieldSource, type Karte, type ProposalRecord } from "@/lib/karte";
import type { School } from "@/lib/data/schools";
import {
  buildSchoolComparisonView,
  type SchoolComparisonCriterion,
} from "@/lib/schoolComparisonView";

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

function freshKarte(): Karte {
  return createEmptyKarte("test-karte");
}

function S<T>(value: T, source: FieldSource = "chat"): { value: T; certainty: "stated"; source: FieldSource } {
  return { value, certainty: "stated", source };
}
function I<T>(value: T, source: FieldSource = "chat"): { value: T; certainty: "inferred"; source: FieldSource } {
  return { value, certainty: "inferred", source };
}

/** 架空の School。schoolSlug 以外は最小限のデフォルト。 */
function fakeSchool(over: Partial<School> & { schoolSlug: string }): School {
  return {
    country: "オーストラリア",
    city: "シドニー",
    name: `Test School ${over.schoolSlug}`,
    ...over,
  };
}

function schoolProposal(id: string, over: Partial<ProposalRecord> = {}): ProposalRecord {
  return { type: "school", id, category: "match", reason: "", caveat: "", ...over };
}

function hasCrit(criteria: SchoolComparisonCriterion[], block: string, key: string): boolean {
  return criteria.some((c) => c.block === block && c.key === key);
}

const MASTER: School[] = [
  fakeSchool({ schoolSlug: "alpha", name: "Alpha College", city: "シドニー" }),
  fakeSchool({ schoolSlug: "beta", name: "Beta Institute", city: "メルボルン" }),
  fakeSchool({ schoolSlug: "gamma", name: "Gamma English", city: "ブリスベン" }),
];

console.log("Case 1: presented 2 + resolved 2 + preferredCity stated → hasEnoughContext true");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.length === 2, "schools 2 校");
  assert(v.userCriteria.length === 1, "criteria 1 件");
  assert(v.hasEnoughContext === true, "hasEnoughContext = true");
}

console.log("Case 2: area / agent proposal は除外");
{
  const k = freshKarte();
  k.proposals.presented = [
    { type: "area", id: "sydney", category: "match", reason: "", caveat: "" },
    { type: "agent", id: "some-agent", category: "match", reason: "", caveat: "" },
    schoolProposal("alpha"),
    schoolProposal("beta"),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.length === 2, "school タイプの 2 件だけ");
  assert(v.schools.every((s) => s.slug === "alpha" || s.slug === "beta"), "area/agent の id が入らない");
}

console.log("Case 3: presented 順序を維持");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("gamma"), schoolProposal("alpha")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools[0].slug === "gamma" && v.schools[1].slug === "alpha", "元順どおり（sort しない）");
}

console.log("Case 4: 同一 slug の重複 proposal → 学校を重複表示しない");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { reason: "1回目" }),
    schoolProposal("alpha", { reason: "2回目" }),
    schoolProposal("beta"),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.filter((s) => s.slug === "alpha").length === 1, "alpha は 1 件だけ");
  assert(v.schools[0].presentedReason === "1回目", "最初の proposal を採用");
}

console.log("Case 5: master 解決できない school は schools[] に入れない");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("nonexistent"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(!v.schools.some((s) => s.slug === "nonexistent"), "未解決 slug は schools に無い");
  assert(v.schools.length === 2, "解決できた 2 校だけ");
}

console.log("Case 6: unresolvedSlugs に記録");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("nonexistent"), schoolProposal("beta")];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(JSON.stringify(v.unresolvedSlugs) === JSON.stringify(["nonexistent"]), "unresolvedSlugs に nonexistent");
}

console.log("Case 7: unresolved slug の重複除去 + 元順維持");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("ghost-x"),
    schoolProposal("ghost-y"),
    schoolProposal("ghost-x"),
    schoolProposal("alpha"),
  ];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(
    JSON.stringify(v.unresolvedSlugs) === JSON.stringify(["ghost-x", "ghost-y"]),
    "重複除去・最初に出た順",
  );
}

console.log("Case 8: resolved 1 校だけ → false");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("nonexistent")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.length === 1 && v.hasEnoughContext === false, "1 校 → false");
}

console.log("Case 9: resolved 2 校 + criteria 0 → false");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.userCriteria.length === 0 && v.hasEnoughContext === false, "criteria 0 → false");
}

// Case 10〜19: criterion 候補 field の stated → userCriteria へ
function critCase(no: number, setter: (k: Karte) => void, block: string, key: string) {
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  setter(k);
  const v = buildSchoolComparisonView(k, MASTER);
  console.log(`Case ${no}: ${block}.${key} stated → criterion`);
  assert(hasCrit(v.userCriteria, block, key), `userCriteria に ${block}.${key}`);
  assert(v.hasEnoughContext === true, "2 校 + criterion 1 → true");
}
critCase(10, (k) => (k.schoolPrefs.preferredCity = S("シドニー")), "schoolPrefs", "preferredCity");
critCase(11, (k) => (k.schoolPrefs.courseType = S("一般英語")), "schoolPrefs", "courseType");
critCase(12, (k) => (k.schoolPrefs.accommodation = S("ホームステイ")), "schoolPrefs", "accommodation");
critCase(13, (k) => (k.schoolPrefs.sizeNationality = S("小規模・国籍多様")), "schoolPrefs", "sizeNationality");
critCase(14, (k) => (k.schoolPrefs.startFlexibility = S("毎週入学できると良い")), "schoolPrefs", "startFlexibility");
critCase(15, (k) => (k.language.pathwayIntent = S(true)), "language", "pathwayIntent");
critCase(16, (k) => (k.language.selfLevel = S("中級")), "language", "selfLevel");
critCase(17, (k) => (k.budget.totalCap = S(3000000)), "budget", "totalCap");
critCase(18, (k) => (k.budget.monthlyCap = S(200000)), "budget", "monthlyCap");
critCase(19, (k) => (k.constraints.avoidCountries = S(["アメリカ"])), "constraints", "avoidCountries");

console.log("Case 20: durationWeeks stated → dedicated top-level、userCriteria には入らない");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  k.timing.durationWeeks = S(24);
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.durationWeeks === "24", "view.durationWeeks === '24'");
  assert(!hasCrit(v.userCriteria, "timing", "durationWeeks"), "userCriteria には入らない");
}

console.log("Case 21: durationWeeks だけ（criteria 0）→ false");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.timing.durationWeeks = S(24);
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.durationWeeks === "24", "durationWeeks は保持");
  assert(v.userCriteria.length === 0 && v.hasEnoughContext === false, "durationWeeks 単独では false");
}

console.log("Case 22: inferred criterion は除外");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = I("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(!hasCrit(v.userCriteria, "schoolPrefs", "preferredCity"), "inferred は userCriteria に入らない");
  assert(v.hasEnoughContext === false, "有効 criterion 0 → false");
}

console.log("Case 23: unknown は除外");
{
  const k = freshKarte(); // schoolPrefs.* は空カルテのまま unknown
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.userCriteria.length === 0, "unknown だけなら userCriteria 空");
}

console.log("Case 24: conflict 中の criterion は userCriteria から除外");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  k.handoff.conflicts = [
    {
      block: "schoolPrefs",
      key: "preferredCity",
      existingValue: "メルボルン",
      existingSource: "worksheet",
      incomingValue: "シドニー",
      incomingSource: "chat",
    },
  ];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(!hasCrit(v.userCriteria, "schoolPrefs", "preferredCity"), "conflict 中は criterion にしない");
  assert(v.hasEnoughContext === false, "残り criterion 0 → false");
}

console.log("Case 25: conflict はトピックのラベルだけ");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.handoff.conflicts = [
    { block: "budget", key: "totalCap", existingValue: 1, existingSource: "worksheet", incomingValue: 2, incomingSource: "chat" },
  ];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(JSON.stringify(v.conflictTopics) === JSON.stringify(["総予算"]), "conflictTopics は『総予算』のみ");
}

console.log("Case 26: conflict の raw value / source が view に無い");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
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
  const json = JSON.stringify(buildSchoolComparisonView(k, MASTER));
  assert(!json.includes("オークランド"), "existing/incoming の値が出ない");
  assert(!json.includes("existingSource") && !json.includes("incomingSource"), "source metadata キーが出ない");
}

console.log("Case 27: School Comparison と無関係な conflict は除外");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.handoff.conflicts = [
    { block: "motivation", key: "statedGoal", existingValue: "a", existingSource: "worksheet", incomingValue: "b", incomingSource: "chat" },
    { block: "lifestyle", key: "climate", existingValue: "a", existingSource: "worksheet", incomingValue: "b", incomingSource: "chat" },
  ];
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.conflictTopics.length === 0, "motivation / lifestyle.climate の conflict は入らない");
}

console.log("Case 28: trueGoalHypothesis 完全不使用");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  k.motivation.trueGoalHypothesis = S("本当は環境を変えたいのかもしれない");
  const json = JSON.stringify(buildSchoolComparisonView(k, MASTER));
  assert(!json.includes("本当は環境を変えたい"), "trueGoalHypothesis の値がどこにも出ない");
}

console.log("Case 29: handoff.openQuestions を view に入れない");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  k.handoff.openQuestions = ["希望する都市", "予算の融通"];
  const v = buildSchoolComparisonView(k, MASTER) as Record<string, unknown>;
  assert(!("openQuestionLabels" in v) && !("openQuestions" in v), "openQuestions 系のキーが view に無い");
}

console.log("Case 30: handoff.nextAction を view に入れない");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.handoff.nextAction = "学校に問い合わせる";
  const v = buildSchoolComparisonView(k, MASTER) as Record<string, unknown>;
  assert(!("nextAction" in v) && !("statedNextAction" in v), "nextAction 系のキーが無い");
  assert(!JSON.stringify(v).includes("学校に問い合わせる"), "値もどこにも出ない");
}

console.log("Case 31: presentedReason を保持（学校の事実ではないと型/docstring で明示）");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { reason: "希望都市に合致し英語コースが充実" }),
    schoolProposal("beta"),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(
    v.schools.find((s) => s.slug === "alpha")?.presentedReason === "希望都市に合致し英語コースが充実",
    "presentedReason に proposal.reason",
  );
}

console.log("Case 32: 空 reason → undefined");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha", { reason: "   " }), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.find((s) => s.slug === "alpha")?.presentedReason === undefined, "空文字は undefined");
}

console.log("Case 33: presentedCaveat を保持");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { category: "reference", caveat: "希望より学費が高め" }),
    schoolProposal("beta"),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(
    v.schools.find((s) => s.slug === "alpha")?.presentedCaveat === "希望より学費が高め",
    "presentedCaveat に proposal.caveat",
  );
}

console.log("Case 34: category を保持");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { category: "reference" }),
    schoolProposal("beta", { category: "match" }),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER);
  assert(v.schools.find((s) => s.slug === "alpha")?.category === "reference", "alpha は reference");
  assert(v.schools.find((s) => s.slug === "beta")?.category === "match", "beta は match");
}

console.log("Case 35: SchoolFacts は安全サブセットを保持");
{
  const k = freshKarte();
  const master: School[] = [
    fakeSchool({
      schoolSlug: "alpha",
      courses: ["General English", "IELTS"],
      courseCategories: ["general_english", "exam_preparation"],
      intakeNote: "毎週月曜入学可",
      accommodationOptions: ["homestay", "dormitory"],
      hasPathway: true,
      classSizeAvg: 14,
      tuitionWeekly: { currency: "AUD", min: 380, max: 460 },
      levels: "初級〜上級 6レベル",
      accreditation: "CRICOS 登録校",
    }),
    fakeSchool({ schoolSlug: "beta" }),
  ];
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const a = buildSchoolComparisonView(k, master).schools.find((s) => s.slug === "alpha")!;
  assert(JSON.stringify(a.facts.courses) === JSON.stringify(["General English", "IELTS"]), "courses 保持");
  assert(a.facts.hasPathway === true, "hasPathway 保持");
  assert(a.facts.classSizeAvg === 14, "classSizeAvg 保持");
  assert(a.facts.tuitionWeekly?.min === 380 && a.facts.tuitionWeekly?.max === 460, "tuitionWeekly 保持");
  assert(a.facts.intakeNote === "毎週月曜入学可", "intakeNote を言い換えず保持");
  assert(a.facts.accreditation === "CRICOS 登録校", "accreditation 保持");
}

console.log("Case 36: placeId / lat / lng / tags / notes / address / totalStudents は除外");
{
  const k = freshKarte();
  const master: School[] = [
    fakeSchool({
      schoolSlug: "alpha",
      placeId: "PLACE_ID_XYZ",
      lat: -33.87,
      lng: 151.2,
      placeIdRefreshedAt: "2026-08-01",
      tags: ["INTERNAL_TAG_A"],
      notes: "INTERNAL_NOTE_TEXT",
      address: "SECRET_ADDRESS_123",
      totalStudents: "TOTAL_STUDENTS_STR",
    }),
    fakeSchool({ schoolSlug: "beta" }),
  ];
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const json = JSON.stringify(buildSchoolComparisonView(k, master));
  for (const forbidden of [
    "PLACE_ID_XYZ",
    "INTERNAL_TAG_A",
    "INTERNAL_NOTE_TEXT",
    "SECRET_ADDRESS_123",
    "TOTAL_STUDENTS_STR",
    "placeIdRefreshedAt",
  ]) {
    assert(!json.includes(forbidden), `view に "${forbidden}" が出ない`);
  }
  assert(!json.includes("151.2") && !json.includes("-33.87"), "lat/lng が出ない");
}

console.log("Case 37: source / fetchedAt / sourceUrl を保持");
{
  const k = freshKarte();
  const master: School[] = [
    fakeSchool({
      schoolSlug: "alpha",
      source: "学校公式サイト",
      fetchedAt: "2026-07",
      sourceUrl: ["https://example.com/a", "https://example.com/b"],
    }),
    fakeSchool({ schoolSlug: "beta" }),
  ];
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const a = buildSchoolComparisonView(k, master).schools.find((s) => s.slug === "alpha")!;
  assert(a.facts.source === "学校公式サイト", "source 保持");
  assert(a.facts.fetchedAt === "2026-07", "fetchedAt 保持");
  assert(JSON.stringify(a.facts.sourceUrl) === JSON.stringify(["https://example.com/a", "https://example.com/b"]), "sourceUrl 保持");
}

console.log("Case 38: 欠けている optional fact は undefined（キー自体を作らない）");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const a = buildSchoolComparisonView(k, MASTER).schools.find((s) => s.slug === "alpha")!;
  assert(a.facts.tuitionWeekly === undefined, "tuitionWeekly は undefined");
  assert(!("tuitionWeekly" in a.facts), "キー自体が無い（『情報なし』文字列に変換しない）");
}

console.log("Case 39: country を補完しない（School.country の実値だけ）");
{
  const k = freshKarte();
  const master: School[] = [
    fakeSchool({ schoolSlug: "alpha", country: "ニュージーランド", city: "オークランド" }),
    fakeSchool({ schoolSlug: "beta", country: "オーストラリア" }),
  ];
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("オークランド");
  const a = buildSchoolComparisonView(k, master).schools.find((s) => s.slug === "alpha")!;
  assert(a.country === "ニュージーランド", "country は実値どおり（Australia を補完しない）");
}

console.log("Case 40: school master object を mutate しない");
{
  const k = freshKarte();
  const master: School[] = [
    fakeSchool({ schoolSlug: "alpha", courses: ["A", "B"], tuitionWeekly: { currency: "AUD", min: 1, max: 2 } }),
    fakeSchool({ schoolSlug: "beta" }),
  ];
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const before = JSON.stringify(master);
  const v = buildSchoolComparisonView(k, master);
  // facts の配列/オブジェクトを触っても master に影響しないこと
  v.schools[0].facts.courses?.push("MUTATED");
  assert(JSON.stringify(master) === before, "buildSchoolComparisonView 後も master は不変（配列はコピー）");
}

console.log("Case 41: Karte を mutate しない");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha", { reason: "r" }), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  k.handoff.conflicts = [
    { block: "budget", key: "totalCap", existingValue: 1, existingSource: "worksheet", incomingValue: 2, incomingSource: "chat" },
  ];
  const before = JSON.stringify(k);
  buildSchoolComparisonView(k, MASTER);
  assert(JSON.stringify(k) === before, "呼び出し前後で Karte は不変");
}

console.log("Case 42: schools 2 + budget criterion → true。ただし fit 情報は view に一切無い");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.budget.totalCap = S(3000000);
  const v = buildSchoolComparisonView(k, MASTER) as Record<string, unknown>;
  assert((v.hasEnoughContext as boolean) === true, "hasEnoughContext = true");
  const json = JSON.stringify(v);
  assert(!json.includes('"fit"') && !json.includes('"no_data"') && !json.includes('"cityMatch"'), "fit 系フィールドが無い");
  assert(
    (v.schools as { facts: Record<string, unknown> }[]).every((s) => !("fit" in s)),
    "school に fit キーが無い",
  );
}

console.log("Case 43: view に score / rank / recommendation フィールドが無い");
{
  const k = freshKarte();
  k.proposals.presented = [schoolProposal("alpha"), schoolProposal("beta")];
  k.schoolPrefs.preferredCity = S("シドニー");
  const v = buildSchoolComparisonView(k, MASTER) as Record<string, unknown>;
  for (const forbidden of ["score", "rank", "ranking", "recommended", "recommendation", "winner", "bestSchool"]) {
    assert(!(forbidden in v), `top-level に "${forbidden}" が無い`);
  }
  const json = JSON.stringify(v);
  assert(!/"score"|"rank"|"recommended"|"bestSchool"/.test(json), "school 内にも無い");
}

console.log("Case 44: 全て reference 候補でも 2 校 + criterion なら true");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { category: "reference" }),
    schoolProposal("beta", { category: "reference" }),
  ];
  k.schoolPrefs.preferredCity = S("シドニー");
  assert(buildSchoolComparisonView(k, MASTER).hasEnoughContext === true, "reference のみでも true");
}

console.log("Case 45: match + reference の組み合わせでも true（category は context 条件にしない）");
{
  const k = freshKarte();
  k.proposals.presented = [
    schoolProposal("alpha", { category: "match" }),
    schoolProposal("beta", { category: "reference" }),
  ];
  k.schoolPrefs.courseType = S("一般英語");
  assert(buildSchoolComparisonView(k, MASTER).hasEnoughContext === true, "match+reference でも true");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
