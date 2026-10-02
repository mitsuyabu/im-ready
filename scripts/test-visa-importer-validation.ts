/**
 * importer 本体の validation に対する回帰テスト。
 *
 *   npx tsx scripts/test-visa-importer-validation.ts
 *
 * **検証ロジックの正本は importer 側**（scripts/import-visa-reference-data.ts の
 * validateVisaDocument）。このテストは同じロジックを再実装せず、その関数を直接呼ぶ。
 *
 * ここで確認するのは「不完全・未確認・単純化されたデータが importer に拒否されること」。
 * ネットワーク・DB へは接続しない。
 */

import { readFileSync } from "node:fs";
import {
  formatVisaValidationProblem,
  validateVisaDocument,
  type VisaValidationProblem,
} from "@/scripts/import-visa-reference-data";

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

/** 検証を通して、受理された entry 数と問題を返す。 */
function check(doc: unknown) {
  return validateVisaDocument("test.json", doc);
}

function rejectedFor(problems: VisaValidationProblem[], field: string): boolean {
  return problems.some((p) => (p.field ?? "").includes(field));
}

function showProblems(problems: VisaValidationProblem[]): string {
  return problems.map(formatVisaValidationProblem).join(" | ");
}

/** 417 の最小ドキュメント。 */
function whvDoc(entries: unknown[]) {
  return {
    visaKey: "australia_working_holiday_417",
    visaCode: "417",
    visaName: "Working Holiday visa (subclass 417)",
    countryCode: "AU",
    entries,
  };
}

/** 500 の最小ドキュメント。 */
function studentDoc(entries: unknown[]) {
  return {
    visaKey: "australia_student_500",
    visaCode: "500",
    visaName: "Student visa (subclass 500)",
    countryCode: "AU",
    entries,
  };
}

/** 有効な出典（Home Affairs・確認日つき）。 */
const HA_SOURCE = {
  sourceName: "Department of Home Affairs - test page",
  sourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
  sourceType: "home_affairs",
  sourcePublishedAt: null,
  sourceUpdatedAt: null,
  accessedAt: "2026-10-01",
  notes: null,
};

function entry(category: string, details: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    category,
    summary: `${category} について公式ページで確認した内容の要約`,
    details,
    reviewedAt: "2026-10-01",
    reviewNote: null,
    sources: [HA_SOURCE],
    ...extra,
  };
}

console.log("Test 1: same_employer に期間 + 単位のみ（例外の記録なし）→ reject");
{
  const r = check(whvDoc([entry("same_employer", { duration: 6, durationUnit: "months" })]));
  assert(r.entries.length === 0, "受理されない");
  assert(rejectedFor(r.problems, "exceptions"), `例外の記録が無いことを指摘する（${showProblems(r.problems)}）`);
  assert(
    r.problems.some((p) => p.visaKey === "australia_working_holiday_417" && p.category === "same_employer"),
    "どのビザ・どの category かが分かるメッセージになっている",
  );
}

console.log("Test 2: same_employer に期間 + 例外の確認記録 → accept");
{
  const withList = check(
    whvDoc([
      entry("same_employer", {
        duration: 6,
        durationUnit: "months",
        exceptions: [{ appliesTo: "指定された業種・地域", note: "公式に定められた条件を満たす場合" }],
      }),
    ]),
  );
  assert(withList.entries.length === 1, "例外の具体情報があれば受理される");
  assert(withList.problems.length === 0, `問題が無い（${showProblems(withList.problems)}）`);

  const reviewedNoException = check(
    whvDoc([
      entry("same_employer", {
        duration: 6,
        durationUnit: "months",
        exceptionsReviewed: true,
        exceptionsExist: false,
      }),
    ]),
  );
  assert(reviewedNoException.entries.length === 1, "「例外なし」を公式確認したケースも受理される");

  const reviewedButUnclear = check(
    whvDoc([entry("same_employer", { duration: 6, durationUnit: "months", exceptionsReviewed: true })]),
  );
  assert(reviewedButUnclear.entries.length === 0, "確認したと言うだけで例外の有無が不明なものは拒否する");
}

console.log("Test 3: second visa に期間あり / specified_work なし → reject");
{
  const r = check(whvDoc([entry("second_third", { requiredPeriod: 3, requiredPeriodUnit: "months" })]));
  assert(r.entries.length === 0, "受理されない");
  assert(
    r.problems.some((p) => p.category === "second_third"),
    `second_third の問題として報告される（${showProblems(r.problems)}）`,
  );

  // specified_work があっても条件が空なら拒否
  const emptyConditions = check(
    whvDoc([
      entry("second_third", { requiredPeriod: 3, requiredPeriodUnit: "months" }),
      entry("specified_work", {}),
    ]),
  );
  assert(emptyConditions.entries.length < 2, "specified_work の条件が空なら second_third を受理しない");

  // 条件があれば受理
  const ok = check(
    whvDoc([
      entry("second_third", { requiredPeriod: 3, requiredPeriodUnit: "months" }),
      entry("specified_work", { industries: ["指定された業種"], evidence: ["給与明細"] }),
    ]),
  );
  assert(ok.entries.length === 2, "業種・証拠があれば受理される");
  assert(ok.problems.length === 0, `問題が無い（${showProblems(ok.problems)}）`);
}

console.log("Test 4: second visa の条件が「88 days」だけ → reject");
{
  const asString = check(whvDoc([entry("second_third", { requiredPeriod: "88 days" })]));
  assert(asString.entries.length === 0, "「88 days」という文字列を条件にできない");
  assert(rejectedFor(asString.problems, "requiredPeriod"), "requiredPeriod の問題として指摘する");

  const asJapanese = check(whvDoc([entry("second_third", { period: "88日" })]));
  assert(asJapanese.entries.length === 0, "「88日」も条件にできない");

  // 俗称として持つのは可（正式条件が別にある場合）
  const colloquialOk = check(
    whvDoc([
      entry("second_third", { requiredPeriod: 3, requiredPeriodUnit: "months", colloquial: "88日" }),
      entry("specified_work", { industries: ["指定された業種"] }),
    ]),
  );
  assert(colloquialOk.entries.length === 2, "正式条件があれば俗称を併記できる");
}

console.log("Test 5: processing に guaranteed: true → reject");
{
  const r = check(studentDoc([entry("processing", { guaranteed: true })]));
  assert(r.entries.length === 0, "受理されない");
  assert(rejectedFor(r.problems, "guaranteed"), "guaranteed の問題として指摘する");

  const fixed = check(studentDoc([entry("processing", { fixedDuration: 30, durationUnit: "days" })]));
  assert(fixed.entries.length === 0, "固定日数を保証値として持てない");

  const promise = check(
    studentDoc([
      {
        ...entry("processing", {}),
        summary: "申請すれば必ず30日で発給されます",
      },
    ]),
  );
  assert(promise.entries.length === 0, "要約の「必ず○日」も拒否する");

  const promise2 = check(
    studentDoc([{ ...entry("processing", {}), summary: "通常は14日以内に出ます" }]),
  );
  assert(promise2.entries.length === 0, "「○日以内に出る」も拒否する");
}

console.log("Test 6: processing が動的な公式案内 → accept");
{
  const r = check(
    studentDoc([entry("processing", { type: "dynamic_official_guide", fixedDuration: null })]),
  );
  assert(r.entries.length === 1, "動的な案内として受理される");
  assert(r.problems.length === 0, `問題が無い（${showProblems(r.problems)}）`);
}

console.log("Test 7: 未確認の書類が requiredDocuments にも入っている → reject");
{
  const r = check(
    studentDoc([
      entry("documents", {
        requiredDocuments: ["パスポート", "英語力の証明"],
        unverified: ["英語力の証明"],
      }),
    ]),
  );
  assert(r.entries.length === 0, "受理されない");
  assert(rejectedFor(r.problems, "requiredDocuments"), "requiredDocuments の問題として指摘する");

  // 分類の重複も拒否
  const duplicated = check(
    studentDoc([
      entry("documents", {
        requiredDocuments: ["パスポート"],
        caseDependentDocuments: ["パスポート"],
      }),
    ]),
  );
  assert(duplicated.entries.length === 0, "同じ書類が2つの分類に入っていたら拒否する");

  // 正しく分けていれば受理
  const ok = check(
    studentDoc([
      entry("documents", {
        requiredDocuments: ["パスポート"],
        caseDependentDocuments: ["健康診断の結果"],
        mayBeRequestedDocuments: ["追加の資金証明"],
        unverified: ["英語力の証明が必要になる条件"],
      }),
    ]),
  );
  assert(ok.entries.length === 1, "分類が整合していれば受理される");
}

console.log("Test 8: 具体値（金額）に出典が無い → reject");
{
  const noSource = check(
    studentDoc([
      {
        ...entry("costs", { amount: 2500, currency: "AUD", basis: "from", per: "application" }),
        sources: [],
      },
    ]),
  );
  assert(noSource.entries.length === 0, "出典が無ければ受理されない");
  assert(rejectedFor(noSource.problems, "sources"), "sources の問題として指摘する");

  const noAccessedAt = check(
    studentDoc([
      {
        ...entry("costs", { amount: 2500, currency: "AUD", basis: "from" }),
        sources: [{ ...HA_SOURCE, accessedAt: null }],
      },
    ]),
  );
  assert(noAccessedAt.entries.length === 0, "具体値があるのに確認日が無ければ拒否する");

  const noCurrency = check(studentDoc([entry("costs", { amount: 2500, basis: "from" })]));
  assert(noCurrency.entries.length === 0, "通貨が無い金額は拒否する");
  assert(rejectedFor(noCurrency.problems, "currency"), "currency の問題として指摘する");

  const badBasis = check(studentDoc([entry("costs", { amount: 2500, currency: "AUD", basis: "about" })]));
  assert(badBasis.entries.length === 0, "基準が既知値（exact / from / minimum）以外なら拒否する");
}

console.log("Test 9: 417 / 462 の visaCode 不一致 → reject");
{
  const mismatch = check({
    visaKey: "australia_working_holiday_417",
    visaCode: "462",
    visaName: "Working Holiday visa (subclass 417)",
    entries: [entry("stay", { duration: 12, durationUnit: "months" })],
  });
  assert(mismatch.entries.length === 0, "visaCode が一致しなければ受理されない");
  assert(rejectedFor(mismatch.problems, "visaCode"), "visaCode の問題として指摘する");

  // 417 の JSON に 462 の記述が混ざっている場合も拒否
  const mixed = check(
    whvDoc([
      {
        ...entry("eligibility", {}),
        summary: "462（Work and Holiday）の対象国について確認した内容",
      },
    ]),
  );
  assert(mixed.entries.length === 0, "417 のデータに 462 の記述が混ざっていたら拒否する");
  assert(rejectedFor(mixed.problems, "entries"), "混同として指摘する");

  const wrongName = check({
    visaKey: "australia_student_500",
    visaCode: "500",
    visaName: "Working Holiday visa (subclass 417)",
    entries: [entry("stay", { duration: 5, durationUnit: "years_max" })],
  });
  assert(wrongName.entries.length === 0, "visaName が正式名称と違えば拒否する");
}

console.log("Test 10: 48 という数値に単位が無い → reject");
{
  const r = check(studentDoc([entry("work_rights", { limit: 48 })]));
  assert(r.entries.length === 0, "単位の無い数値は受理されない");
  assert(rejectedFor(r.problems, "limit"), "limit の問題として指摘する");

  const ok = check(
    studentDoc([entry("work_rights", { limit: 48, unit: "hours_per_fortnight", during: "study_terms" })]),
  );
  assert(ok.entries.length === 1, "単位があれば受理される");

  const noDurationUnit = check(studentDoc([entry("stay", { duration: 5 })]));
  assert(noDurationUnit.entries.length === 0, "期間に単位が無ければ拒否する");
}

console.log("Test 11: 現在の student-500.json → accept（人間確認済みのカテゴリのみ）");
{
  const doc = JSON.parse(readFileSync("data/visas/australia/student-500.json", "utf8"));
  const r = validateVisaDocument("data/visas/australia/student-500.json", doc);
  assert(r.problems.length === 0, `問題なし（${showProblems(r.problems)}）`);
  assert(r.entries.length === 11, `11件が受理される（実際: ${r.entries.length}）`);
  const categories = r.entries.map((e) => e.category).sort();
  assert(
    categories.join(",") ===
      "application,costs,documents,eligibility,financial_capacity,genuine_student,health_insurance,processing,stay,study_rights,work_rights",
    `登録済みのカテゴリがそのまま通る（${categories.join(",")}）`,
  );
  // 未確認のカテゴリは登録されていない
  for (const absent of ["same_employer", "second_third", "specified_work", "arrival_preparation"]) {
    assert(!categories.includes(absent), `未確認の ${absent} は登録されていない`);
  }
  // 一次情報の出典が無い entry は、照合未了が記録されていれば通る
  const noPrimary = r.entries.filter((e) => !e.sources.some((s) => s.sourceType === "home_affairs"));
  assert(noPrimary.length === 1 && noPrimary[0].category === "financial_capacity", "一次照合未了は financial_capacity だけ");
  assert(
    noPrimary.every((e) => /403|未了|一次情報/.test(e.reviewNote ?? "")),
    "一次情報未照合の記録が保持されている",
  );
}

console.log("Test 12: 現在の working-holiday-417.json → accept（人間確認済みのカテゴリのみ）");
{
  const doc = JSON.parse(readFileSync("data/visas/australia/working-holiday-417.json", "utf8"));
  const r = validateVisaDocument("data/visas/australia/working-holiday-417.json", doc);
  assert(r.problems.length === 0, `問題なし（${showProblems(r.problems)}）`);
  // 2026-10-02 の人間確認で specified_work / second_third を登録済み。
  // 未確認のカテゴリ（same_employer 等）は空のまま。
  const categories = r.entries.map((e) => e.category).sort();
  assert(
    categories.join(",") === "same_employer,second_third,specified_work",
    `確認済みの3カテゴリだけが受理される（${categories.join(",")}）`,
  );
  // 未確認のカテゴリは登録されていない
  for (const unconfirmed of ["eligibility", "stay", "work_rights", "documents", "costs", "processing"]) {
    assert(!categories.includes(unconfirmed), `未確認の ${unconfirmed} は登録されていない`);
  }
  // same_employer は期間があるため、例外の記録が無ければ弾かれるルールを満たして通っている
  const sameEmployer = r.entries.find((e) => e.category === "same_employer");
  assert(
    sameEmployer !== undefined &&
      (Array.isArray(sameEmployer.details.exceptions) || sameEmployer.details.exceptionsReviewed === true),
    "same_employer は例外の記録つきで受理されている（検証を弱めていない）",
  );
  // 期間条件がある second_third が、specified_work の条件つきで通っている（検証を弱めていない）
  const second = r.entries.find((e) => e.category === "second_third");
  assert(second !== undefined && typeof second.details.requiredPeriod === "number", "期間条件が構造化されている");
}

console.log("Test 13: 一次情報が無く照合未了の記録も無い → reject");
{
  const r = check(
    studentDoc([
      {
        ...entry("stay", { duration: 5, durationUnit: "years_max" }),
        sources: [
          {
            sourceName: "Study Australia - test",
            sourceUrl: "https://www.studyaustralia.gov.au/test",
            sourceType: "study_australia",
            sourcePublishedAt: null,
            sourceUpdatedAt: null,
            accessedAt: "2026-10-01",
            notes: null,
          },
        ],
        reviewNote: null,
      },
    ]),
  );
  assert(r.entries.length === 0, "Home Affairs 出典が無く記録も無ければ受理されない");
  assert(rejectedFor(r.problems, "reviewNote"), "照合未了の記録を求める");

  const recorded = check(
    studentDoc([
      {
        ...entry("stay", { duration: 5, durationUnit: "years_max" }),
        sources: [
          {
            sourceName: "Study Australia - test",
            sourceUrl: "https://www.studyaustralia.gov.au/test",
            sourceType: "study_australia",
            sourcePublishedAt: null,
            sourceUpdatedAt: null,
            accessedAt: "2026-10-01",
            notes: null,
          },
        ],
        reviewNote: "Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。",
      },
    ]),
  );
  assert(recorded.entries.length === 1, "照合未了を記録していれば政府系 source で候補を作れる（現行設計の維持）");
}

console.log("Test 14: 未確認を 0 / 空文字 / 'unknown' で埋めている → reject");
{
  assert(check(studentDoc([entry("costs", { amount: 0, currency: "AUD", basis: "exact" })])).entries.length === 0, "金額 0 を拒否");
  assert(check(studentDoc([entry("work_rights", { limit: 0, unit: "hours_per_fortnight" })])).entries.length === 0, "上限 0 を拒否");
  assert(check(studentDoc([entry("stay", { duration: 0, durationUnit: "years" })])).entries.length === 0, "期間 0 を拒否");
  assert(check(studentDoc([entry("eligibility", { ageMin: "" })])).entries.length === 0, "空文字を拒否");
  assert(check(studentDoc([entry("eligibility", { ageMax: "unknown" })])).entries.length === 0, "'unknown' を拒否");
  assert(check(studentDoc([entry("eligibility", { ageMax: "未確認" })])).entries.length === 0, "'未確認' を具体値 field に入れるのを拒否");

  // 本当に公式確認できた false は許す
  const confirmedFalse = check(
    whvDoc([
      entry("same_employer", {
        duration: 6,
        durationUnit: "months",
        exceptionsReviewed: true,
        exceptionsExist: false,
      }),
    ]),
  );
  assert(confirmedFalse.entries.length === 1, "公式確認できた false（例外なし）は許容する");
}

console.log("Test 15: 年齢などの具体条件に出典が必須");
{
  const noSource = check(
    studentDoc([{ ...entry("eligibility", { ageMin: 18, ageMax: 30 }), sources: [] }]),
  );
  assert(noSource.entries.length === 0, "年齢条件に出典が無ければ拒否する");

  const ok = check(whvDoc([entry("eligibility", { ageMin: 18, ageMax: 30 })]));
  assert(ok.entries.length === 1, "出典・確認日があれば受理される");
}

console.log("Test 16: 検証エラーのメッセージが人間に分かる形");
{
  const r = check(whvDoc([entry("same_employer", { duration: 6, durationUnit: "months" })]));
  const message = formatVisaValidationProblem(r.problems[0]);
  assert(message.includes("australia_working_holiday_417"), "ビザが分かる");
  assert(message.includes("same_employer"), "category が分かる");
  assert(message.includes("exceptions"), "field が分かる");
  assert(message.includes("必要です") || message.includes("ません"), "理由が書かれている");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
