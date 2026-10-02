/**
 * Working Holiday 417 の eligibility（日本のパスポート保持者向け）の登録内容に対するデータ固有テスト。
 *
 *   npx tsx scripts/test-visa-417-eligibility.ts
 *
 * 2026-10-01 に人間が Home Affairs の Working Holiday visa (subclass 417) ページを画面で確認した内容が、
 *   - 日本の条件（18〜30歳）を他国の上限と混同しない形で保持しているか
 *   - 年齢の締切が「申請時点」の条件として保たれ、入国期限として語られないか
 *   - 他サブクラスの制度情報を混入させず、過去の入国歴の条件を表現できているか
 * を確認する。検証ロジックの正本は importer（validateVisaDocument）なので再実装しない。
 * ネットワーク・DB へは接続しない。
 */

import { readFileSync, readdirSync } from "node:fs";
import {
  isPrimarySource,
  readFactList,
  type VisaCategory,
  type VisaKey,
  type VisaReferenceEntry,
} from "@/lib/visaReference";
import { buildVisaReferenceContext } from "@/lib/visaReferenceContext";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import { validateVisaDocument } from "@/scripts/import-visa-reference-data";

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

const FILE = "data/visas/australia/working-holiday-417.json";
const raw = readFileSync(FILE, "utf8");
const doc = JSON.parse(raw);
const validated = validateVisaDocument(FILE, doc);
const NOW = new Date("2026-10-02T00:00:00Z");

function loadSeed(): VisaReferenceEntry[] {
  const out: VisaReferenceEntry[] = [];
  for (const file of readdirSync("data/visas/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(`data/visas/australia/${file}`, "utf8"));
    for (const [i, e] of (d.entries ?? []).entries()) {
      out.push({
        id: `${d.visaKey}-${e.category}-${i}`,
        visaKey: d.visaKey as VisaKey,
        visaCode: d.visaCode,
        visaName: d.visaName,
        countryCode: d.countryCode ?? "AU",
        category: e.category as VisaCategory,
        summary: e.summary,
        details: e.details ?? {},
        reviewedAt: e.reviewedAt,
        sources: (e.sources ?? []).map((s: Record<string, unknown>) => ({
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          sourceType: s.sourceType,
          sourcePublishedAt: s.sourcePublishedAt ?? null,
          sourceUpdatedAt: s.sourceUpdatedAt ?? null,
          accessedAt: s.accessedAt ?? null,
        })),
      } as VisaReferenceEntry);
    }
  }
  return out;
}

const SEED = loadSeed();
const WHV = SEED.filter((e) => e.visaKey === "australia_working_holiday_417");

function entryOf(category: VisaCategory): VisaReferenceEntry {
  const found = WHV.find((e) => e.category === category);
  if (!found) throw new Error(`417 の ${category} が登録されていない`);
  return found;
}

const eligibility = entryOf("eligibility");
const details = eligibility.details as Record<string, unknown>;
const context = buildVisaReferenceContext([eligibility], { now: NOW }) ?? "";

function obj(key: string): Record<string, unknown> {
  const v = details[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function simulate(message: string): { readVisaData: boolean; categories: VisaCategory[]; matched: VisaReferenceEntry[] } {
  const intent = detectVisaIntent(message);
  if (!intent) return { readVisaData: false, categories: [], matched: [] };
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind === "needsVisa") return { readVisaData: true, categories: intent.categories, matched: [] };
  return {
    readVisaData: true,
    categories: intent.categories,
    matched: SEED.filter((e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category)),
  };
}

console.log("前提: importer の検証を通っている（検証を弱めていない）");
{
  assert(validated.problems.length === 0, "検証エラーなし");
  assert(validated.entries.length === 4, `417 は4 entry が受理される（実際: ${validated.entries.length}）`);
}

console.log("Test 1: 417 eligibility が登録されている");
{
  const categories = WHV.map((e) => e.category).sort();
  assert(
    categories.join(",") === "eligibility,same_employer,second_third,specified_work",
    `417 のカテゴリ（${categories.join(",")}）`,
  );
  assert(eligibility.reviewedAt === "2026-10-01", "人間確認日 2026-10-01 が記録されている");
  assert(
    eligibility.sources.some((s) => isPrimarySource(s.sourceType) && s.accessedAt === "2026-10-01"),
    "一次情報の出典と確認日を持つ",
  );
  assert(
    eligibility.sources.every((s) => s.sourceUrl.includes("work-holiday-417")),
    "出典 URL が Working Holiday visa のページ",
  );
}

console.log("Test 2: 日本のパスポートが対象");
{
  assert(details.country === "Japan", "確認した国が Japan");
  assert(details.eligiblePassport === true, "対象となるパスポートとして記録されている");
  assert(
    String(details.eligiblePassportNote ?? "").includes("必ず取得できる"),
    "「日本国籍なら自動的に取得できる」ではないことを記録",
  );
  assert(context.includes("Japan"), "Chat へ渡る");
  assert(context.includes("他の条件も満たす必要がある"), "他の条件も必要であることが渡る");
}

console.log("Test 3-5: 年齢（日本の条件であること）");
{
  assert(details.minimumAge === 18, "3. 下限18歳");
  assert(details.maximumAge === 30, "4. 上限30歳");
  assert(
    String(details.ageCountryScope ?? "").includes("当てはめて説明しないこと"),
    "5. 上限が異なる国の条件を日本へ当てはめない注記がある",
  );
  assert(!/35/.test(raw), "5. 35歳という値を 417 のデータに持っていない");
  assert(context.includes("申請できる年齢: 18〜30歳"), "3/4. Chat へ渡る");
  assert(!/35\s*歳/.test(context), "5. 35歳の条件が Chat へ渡らない");
}

console.log("Test 6-8: 申請の年齢の締切");
{
  const d = obj("applicationAgeDeadline");
  assert(String(d.rule ?? "").includes("31歳になる前"), "6. 31歳になる前に申請を提出する必要があることを保持");
  assert(String(d.deadline ?? "").includes("31歳の誕生日の前日"), "6. 締切が31歳の誕生日の前日であることを保持");
  assert(d.appliesAtLodgement === true, "6. 申請提出時点の条件として記録されている");
  assert(String(d.timezoneBasis ?? "") === "AEST / AEDST", "7. AEST / AEDST の時刻基準を保持");
  assert(
    String(d.turningAgeAfterLodgement ?? "").includes("認められ得る"),
    "8. 提出後に31歳になっても自動的に無効にはならないことを保持",
  );
  assert(
    !/必ず(認められ|許可)/.test(String(d.turningAgeAfterLodgement ?? "")),
    "8. 「必ず認められる」と断定していない",
  );
  assert(context.includes("AEST / AEDST"), "7. Chat へ渡る");
  assert(context.includes("申請後に上限の年齢を超えた場合"), "8. Chat へ渡る");
}

console.log("Test 9: 扶養している子どもの同伴");
{
  const d = obj("dependentChildren");
  assert(d.cannotBeAccompanied === true, "同伴できないことを保持");
  assert(String(d.note ?? "").includes("同伴することはできない"), "要約を保持");
  assert(
    String(d.familyInSameApplication ?? "").includes("含めることはできない"),
    "1回目は家族を同じ申請に含められないことを保持",
  );
  assert(context.includes("同伴・家族について"), "Chat へ渡る");
}

console.log("Test 10: 1回目の申請での過去の入国歴の条件");
{
  const d = obj("previousVisaDisqualifyingHistory");
  assert(String(d.appliesTo ?? "").includes("1回目"), "1回目の申請に限る条件として記録");
  assert(
    String(d.rule ?? "").includes("Working Holiday Maker") && String(d.rule ?? "").includes("入国"),
    "WHM プログラムのビザでの入国歴という形で保持",
  );
  assert(
    String(d.programScopeNote ?? "").includes("公式での確認"),
    "別サブクラスで入国している場合は公式確認へ案内する形になっている",
  );
  assert(context.includes("過去のビザ歴による条件"), "Chat へ渡る");
  assert(context.includes("上の条件の範囲"), "条件の及ぶ範囲も渡る");
}

console.log("Test 11: Student 500 を変更していない");
{
  const student = SEED.filter((e) => e.visaKey === "australia_student_500");
  assert(student.length === 11, `Student 500 は11 entry のまま（実際: ${student.length}）`);
  const studentDoc = JSON.parse(readFileSync("data/visas/australia/student-500.json", "utf8"));
  const r = validateVisaDocument("data/visas/australia/student-500.json", studentDoc);
  assert(r.problems.length === 0 && r.entries.length === 11, "Student 500 の検証結果も変わっていない");
  assert(
    student.every((e) => e.reviewedAt === "2026-10-02" || e.category === "financial_capacity"),
    "Student 500 の確認日を書き換えていない",
  );
}

console.log("Test 12-14: 既存の417 3カテゴリを変更していない");
{
  const same = entryOf("same_employer").details as Record<string, unknown>;
  assert(same.conditionNumber === 8547 && same.duration === 6, "12. same_employer の条件番号と期間が不変");
  assert(Array.isArray(same.exceptions) && (same.exceptions as unknown[]).length === 5, "12. 例外5件が不変");

  const spec = entryOf("specified_work").details as Record<string, unknown>;
  assert(readFactList(spec, "industries").length === 9, "13. specified_work の業種9件が不変");
  assert(readFactList(spec, "areas").length === 5, "13. 地域区分5件が不変");

  const second = entryOf("second_third").details as Record<string, unknown>;
  assert(second.requiredPeriod === 3 && second.requiredPeriodUnit === "months", "14. second_third の必要期間が不変");
  assert(second.requiresEquivalentNormalFullTimeWork === true, "14. フルタイム相当の要件が不変");
}

console.log("Test 15-16: routing");
{
  assert(!simulate("シドニーの家賃はどれくらい？").readVisaData, "15. ビザ以外の質問ではビザデータを読まない");
  const r = simulate("日本人のワーホリって何歳まで？");
  assert(r.categories.join(",") === "eligibility", `16. eligibility だけに routing される（${r.categories.join(",")}）`);
  assert(
    r.matched.length === 1 && r.matched[0].visaKey === "australia_working_holiday_417",
    "16. 417 の eligibility だけが読まれる",
  );
  const ctx = buildVisaReferenceContext(r.matched, { now: NOW }) ?? "";
  assert(ctx.includes("18〜30歳"), "16. 18〜30歳が渡る");
  assert(ctx.includes("31歳になる前"), "16. 31歳になる前の申請提出が渡る");
}

console.log("一般語の gate 追加で 417 の既存表現を壊していない");
{
  // 「セカンド取るには？」「サードビザ」はビザ名が無くても成立する既存表現。
  for (const message of ["セカンド取るには？", "サードビザについて教えて", "88日ってなんですか？"]) {
    const r = simulate(message);
    assert(r.readVisaData, `「${message}」→ ビザ層が起動する`);
    assert(
      r.categories.includes("second_third") || r.categories.includes("specified_work"),
      `「${message}」→ セカンド・サードの category へ routing される`,
    );
  }
  // 年齢の質問はビザの語があれば eligibility へ届く。
  for (const message of ["ワーホリって何歳まで？", "ワーホリの年齢条件を教えて", "ワーホリの資格は？"]) {
    const r = simulate(message);
    assert(r.categories.includes("eligibility"), `「${message}」→ eligibility へ routing される`);
  }
}

console.log("417 の滞在期間は未登録のままで、Student 500 の値を流用しない");
{
  const r = simulate("ワーホリは何年いられますか？");
  assert(r.categories.join(",") === "stay", `stay だけへ routing される（実際: ${r.categories.join(",")}）`);
  assert(r.matched.length === 0, "417 の stay は未登録なので entry が1件も取れない");
  assert(
    !r.matched.some((e) => e.visaKey === "australia_student_500"),
    "Student 500 の滞在期間を 417 の答えに流用しない",
  );
}

console.log("Test 17: 入国の年齢期限を捏造していない");
{
  const d = obj("applicationAgeDeadline");
  assert(
    String(d.notAnArrivalDeadline ?? "").includes("渡航しなければならない"),
    "「30歳までに渡航」と説明させない注記がある",
  );
  assert(
    readFactList(details, "unverified").some((v) => v.includes("入国の期限")),
    "入国の期限が未確認として記録されている",
  );
  // 「何歳までに入国すればいい？」でも入国期限を作らせない指示が届く。
  const r = simulate("ワーホリは何歳までに入国すればいい？");
  const ctx = buildVisaReferenceContext(r.matched, { now: NOW }) ?? "";
  assert(ctx.includes("入国の期限については今回の資料で確認していない"), "入国期限は未確認である旨が渡る");
  assert(ctx.includes("推測して答えないこと") || ctx.includes("推測して案内しないこと"), "推測禁止が渡る");
}

console.log("Test 18: 417 / 462 の分離検証が有効なまま");
{
  // entries 側に他サブクラスの番号・名称を持っていない。
  const entriesJson = JSON.stringify(doc.entries);
  assert(!/462/.test(entriesJson), "entries に他サブクラスの番号が無い");
  assert(!/Work and Holiday/i.test(entriesJson), "entries に他サブクラスの名称が無い");
  // 検証ルール自体が生きていること（混入したデータは今も reject される）。
  const contaminated = JSON.parse(JSON.stringify(doc));
  contaminated.entries[0].summary = `${contaminated.entries[0].summary} subclass 462 も対象です。`;
  const bad = validateVisaDocument(FILE, contaminated);
  assert(bad.problems.length > 0, "462 の記述を混ぜると reject される（検証を弱めていない）");
  assert(bad.entries.length === 0, "reject 時は entry を1件も受理しない");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
