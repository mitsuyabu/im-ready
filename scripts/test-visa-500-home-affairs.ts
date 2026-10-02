/**
 * Student visa (subclass 500) の Home Affairs 一次情報登録に対するデータ固有テスト（仕様 §35 の34項目）。
 *
 *   npx tsx scripts/test-visa-500-home-affairs.ts
 *
 * 2026-10-02 に人間が Home Affairs の Student visa (subclass 500) ページを確認して登録した内容が、
 *   - 2026-10-02 からの新しい申請場所・家族のルールを正しく保持しているか
 *   - 「最長5年」→「最長6年・enrolment 連動」の差分を黙って消していないか
 *   - 一次情報で確認できていない値（資金額・英語スコア等）を推測で埋めていないか
 * を確認する。検証ロジックの正本は importer（validateVisaDocument）なので再実装しない。
 * ネットワーク・DB へは接続しない。
 */

import { readFileSync, readdirSync } from "node:fs";
import {
  isPrimarySource,
  readFactList,
  readMoneyFact,
  readWorkHourLimit,
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

const FILE = "data/visas/australia/student-500.json";
const doc = JSON.parse(readFileSync(FILE, "utf8"));
const validated = validateVisaDocument(FILE, doc);
const NOW = new Date("2026-10-02T00:00:00Z");

/** 全 seed（417 も含む）。データの分離を見るために両方読む。 */
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
const STUDENT = SEED.filter((e) => e.visaKey === "australia_student_500");

function entryOf(category: VisaCategory): VisaReferenceEntry {
  const found = STUDENT.find((e) => e.category === category);
  if (!found) throw new Error(`${category} が登録されていない`);
  return found;
}

function detailsOf(category: VisaCategory): Record<string, unknown> {
  return entryOf(category).details as Record<string, unknown>;
}

function contextOf(...categories: VisaCategory[]): string {
  return buildVisaReferenceContext(categories.map(entryOf), { now: NOW }) ?? "";
}

/** route と同じ経路（intent → visaKey 解決 → 該当 entry）を再現する。 */
function simulate(message: string): { readVisaData: boolean; categories: VisaCategory[]; matched: VisaReferenceEntry[] } {
  const intent = detectVisaIntent(message);
  if (!intent) return { readVisaData: false, categories: [], matched: [] };
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind === "needsVisa") return { readVisaData: true, categories: intent.categories, matched: [] };
  const matched = SEED.filter(
    (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
  );
  return { readVisaData: true, categories: intent.categories, matched };
}

console.log("前提: importer の検証を通っている（検証を弱めていない）");
{
  assert(validated.problems.length === 0, "検証エラーなし");
  assert(validated.entries.length === STUDENT.length, `受理件数と登録件数が一致（${validated.entries.length}）`);
}

console.log("Test 1-3: stay の conflict と正本化");
{
  const d = detailsOf("stay");
  const superseded = (d.supersededValue ?? {}) as Record<string, unknown>;
  assert(
    typeof superseded.previousValue === "string" && /5\s*年|5 years/.test(String(superseded.previousValue)),
    "1. 旧値（最長5年）が差分として記録されている",
  );
  assert(
    String(superseded.previousSource ?? "").includes("Study Australia"),
    "1. 旧値の出典が Study Australia として記録されている",
  );
  assert(d.duration === 6 && typeof d.durationUnit === "string", "2. 一次情報の6年が正本の値になっている");
  assert(
    typeof superseded.resolution === "string" && /一次情報|Home Affairs/.test(String(superseded.resolution)),
    "2. なぜ更新したかが記録されている（明示的な解消）",
  );
  assert(
    entryOf("stay").sources.some((s) => isPrimarySource(s.sourceType)),
    "2. stay が一次情報の出典を持つ",
  );
  assert(d.durationBasis === "up_to" && d.enrolmentDependent === true, "3. up to / enrolment 連動を保持");
  assert(d.primarySchoolYears1to4MaxYears === 3, "3. 小学校 Year 1〜4 の原則3年を保持");
  const ctx = contextOf("stay");
  assert(ctx.includes("上限") && ctx.includes("enrolment"), "3. 全員6年と読めない形で Chat へ渡る");
  assert(
    ctx.includes("以前の値を答えに使わないこと"),
    "3. 旧値を答えに使わせない指示が渡る",
  );
}

console.log("Test 4-5: work rights");
{
  const work = readWorkHourLimit(detailsOf("work_rights"));
  assert(work?.limit === 48 && work?.unit === "hours_per_fortnight", "4. 48 hours per fortnight を単位つきで保持");
  assert(detailsOf("work_rights").primarySourceVerified === true, "4. 一次情報で照合済み");
  assert(
    entryOf("work_rights").sources.some((s) => isPrimarySource(s.sourceType)),
    "4. work_rights が一次情報の出典を持つ",
  );
  assert(
    work?.exceptions.some((e) => /Masters by Research|Doctoral/.test(e.appliesTo)) === true,
    "5. Masters by Research / Doctoral の例外を保持",
  );
  const ctx = contextOf("work_rights");
  assert(ctx.includes("2で割って週単位の上限へ言い換えないでください"), "4. 週単位への換算を禁止している");
  assert(ctx.includes("Masters by Research"), "5. 例外が Chat へ渡る");
}

console.log("Test 6-8: CoE");
{
  const app = readFactList(detailsOf("application"), "items").join(" / ");
  assert(/CoE/.test(app), "6. 申請時に CoE が必要であることを保持");
  assert(/決定|decided/.test(app), "6. 決定時点でも有効である必要を保持");
  assert(/無効|invalid/.test(app), "7. CoE が無いと申請が無効になることを保持");
  const coe = readFactList(detailsOf("documents"), "coeExceptions");
  assert(coe.length >= 4, `8. CoE が不要になる例外を保持（${coe.length}件）`);
  const ctx = contextOf("documents");
  assert(ctx.includes("CoE が不要になる例外"), "8. 例外が Chat へ渡る");
  assert(
    ctx.includes("当てはまると決めつけず"),
    "8. 例外に当てはまると決めつけさせない指示が渡る",
  );
}

console.log("Test 9: CRICOS / packaged courses");
{
  const study = detailsOf("study_rights");
  assert(readFactList(study, "items").join(" / ").includes("CRICOS"), "9. CRICOS 登録のフルタイムコース要件を保持");
  const packaged = readFactList(study, "packagedCourses");
  assert(packaged.some((v) => v.includes("2暦月")), "9. packaged courses の原則2暦月未満を保持");
  assert(packaged.some((v) => /学年/.test(v)), "9. 学年切替の例外を保持");
  assert(contextOf("study_rights").includes("packaged courses"), "9. Chat へ渡る");
}

console.log("Test 10-12: 年齢・学校の学年別条件・18歳未満の福祉");
{
  const el = detailsOf("eligibility");
  assert(el.minimumAge === 6 && el.minimumAgeUnit === "years", "10. 最低年齢6歳を保持");
  const schoolRules = readFactList(el, "schoolStudentAgeRules");
  assert(schoolRules.length === 4, `11. 学年別の年齢条件を4件保持（${schoolRules.length}）`);
  assert(schoolRules.some((v) => v.includes("Year 9") && v.includes("17")), "11. Year 9 は17歳未満");
  assert(
    String(el.schoolStudentAgeRulesNote ?? "").includes("当てはめない"),
    "11. 一般の大学・語学留学者へ当てはめない注記がある",
  );
  assert(typeof el.under18Welfare === "string" && String(el.under18Welfare).includes("福祉"), "12. 18歳未満の福祉の手配を保持");
  const ctx = contextOf("eligibility");
  assert(ctx.includes("最低年齢: 6"), "10. Chat へ渡る");
  assert(ctx.includes("学校（小中高）"), "11. 学校就学者限定であることが渡る");
  assert(ctx.includes("18歳未満の場合"), "12. Chat へ渡る");
}

console.log("Test 13-15: 英語力");
{
  const d = detailsOf("documents");
  const english = (d.englishEvidence ?? {}) as Record<string, unknown>;
  assert(english.mayBeRequired === true, "13. 英語力の証明は必要になる場合がある（全員一律ではない）");
  assert(
    readFactList(d, "caseDependentDocuments").some((v) => v.includes("英語力")),
    "13. 英語力はケースによって必要な書類として分類されている",
  );
  assert(
    !readFactList(d, "requiredDocuments").some((v) => v.includes("英語")),
    "13. 英語力の証明を必須側へ入れていない",
  );
  const raw = readFileSync(FILE, "utf8");
  assert(!/IELTS/.test(raw), "14. 特定の試験名・固定スコア（IELTS 6.0 等）を登録していない");
  assert(
    typeof d.englishScoreNote === "string" && String(d.englishScoreNote).includes("一律の基準"),
    "14. 一律の基準として案内しない注記がある",
  );
  const exemptions = readFactList(d, "englishExemptions");
  assert(exemptions.length >= 5, `15. 英語力の免除の区分を保持（${exemptions.length}件）`);
  assert(
    String(d.englishExemptionsNote ?? "").includes("日本"),
    "15. パスポート免除の一覧に日本が含まれないことを記録",
  );
  const ctx = contextOf("documents");
  assert(ctx.includes("必要になる場合がある（全員一律ではない）"), "13. Chat へ渡る");
  assert(!ctx.includes("IELTS"), "14. 固定スコアが Chat へ渡らない");
  assert(ctx.includes("英語力の証明が免除される例外"), "15. Chat へ渡る");
}

console.log("Test 16-18: OSHC");
{
  const items = readFactList(detailsOf("health_insurance"), "items");
  assert(items.some((v) => v.includes("全期間")), "16. 滞在の全期間について必要であることを保持");
  assert(
    items.some((v) => v.includes("入国日") && v.includes("コース開始日")),
    "17. 国外から申請する場合は入国日から（コース開始日ではない）",
  );
  const d = detailsOf("health_insurance");
  const countryExceptions = readFactList(d, "oshcCountryExceptions");
  assert(countryExceptions.length === 3, `18. 国別の特例を3件保持（${countryExceptions.length}）`);
  assert(
    String(d.countryExceptionsNote ?? "").includes("日本国籍の人には適用しない"),
    "18. 日本へ適用しないことを記録",
  );
  const ctx = contextOf("health_insurance");
  assert(ctx.includes("入国日"), "17. Chat へ渡る");
  assert(ctx.includes("日本国籍の人には適用しない"), "18. 日本へ適用しない注記が例外と同じ場所で渡る");
}

console.log("Test 19-21: 2026-10-02 からの申請場所と 417 / 462");
{
  const d = detailsOf("application");
  assert(d.ruleChangeFrom === "2026-10-02", "19. 制度変更日 2026-10-02 を保持");
  assert(
    readFactList(d, "items").some((v) => v.includes("2026-10-02") && v.includes("国外")),
    "19. ほとんどの申請は国外からであることを保持",
  );
  const cannot = readFactList(d, "cannotApplyOnshoreVisaSubclasses");
  assert(cannot.some((v) => v.includes("417")), "20. 417 保有者は国内から申請できない一覧に含まれる");
  assert(cannot.some((v) => v.includes("462")), "21. 462 保有者は国内から申請できない一覧に含まれる");
  const ctx = contextOf("application");
  assert(ctx.includes("2026-10-02 からの現行ルール"), "19. 変更日が Chat へ渡る");
  // この一覧は「例外」ではなく制限なので、件数を切らず全件渡す（本人の該当ビザが隠れると誤案内になる）。
  for (const v of cannot) {
    assert(ctx.includes(v.split("（")[0]), `20/21. ${v.split("（")[0]} が省略されずに渡る`);
  }
  assert(
    ctx.includes("個別の可否を保証しない") || ctx.includes("保証しないでください"),
    "20. 個別の可否は保証させない",
  );
}

console.log("§32: 417 → Student 500 の切り替えの質問で、現行ルールが回答に届く");
{
  for (const message of [
    "今ワーホリでオーストラリアにいるけど、学生ビザに変えられる？",
    "ワーホリから学生ビザに切り替えたい",
  ]) {
    const r = simulate(message);
    assert(r.categories.includes("application"), `「${message}」→ application へ routing される`);
    assert(
      r.matched.some((e) => e.visaKey === "australia_student_500" && e.category === "application"),
      `「${message}」→ 学生ビザの申請ルールが読み込まれる`,
    );
    const ctx = buildVisaReferenceContext(r.matched, { now: NOW }) ?? "";
    assert(ctx.includes("subclass 417"), `「${message}」→ 417 が国内申請できない旨が渡る`);
    assert(ctx.includes("国外"), `「${message}」→ 国外からの申請が必要になる旨が渡る`);
  }
  // 国内での更新・家族の質問も同じ経路で現行ルールへ届く。
  const renew = simulate("オーストラリア国内で学生ビザを更新できる？");
  assert(renew.categories.includes("application"), "「国内で更新できる？」→ application へ routing される");
  const family = simulate("学生ビザで家族を連れていける？");
  assert(family.categories.includes("application"), "「家族を連れていける？」→ application へ routing される");
  const familyCtx = buildVisaReferenceContext(family.matched, { now: NOW }) ?? "";
  assert(familyCtx.includes("家族について"), "「家族を連れていける？」→ 現行の家族ルールが渡る");
  // ビザの話でない場面では、これらの語だけでビザデータを読まない。
  assert(!simulate("配偶者の仕事はどうなりますか？").readVisaData, "ビザの語が無ければビザデータを読まない");
}

console.log("Test 22: further Student visa の例外は既定で全件注入しない");
{
  const list = readFactList(detailsOf("application"), "furtherStudentVisaExemptions");
  assert(list.length === 6, `6種類を保持（${list.length}）`);
  const ctx = contextOf("application");
  assert(ctx.includes(`全${list.length}件のうち3件だけ記載`), "22. 既定では高レベルの数件だけ渡る");
  assert(ctx.includes(`ほか${list.length - 3}件`), "22. 省略した件数が示されている");
  assert(
    list.filter((v) => ctx.includes(v)).length === 3,
    `22. 全件がそのまま渡っていない（渡っているのは${list.filter((v) => ctx.includes(v)).length}件）`,
  );
  // 就労条件だけを聞かれた場面では、application の例外は読み込まれない。
  const r = simulate("学生ビザで働ける時間は？");
  assert(!r.categories.includes("application"), "22. 就労の質問では application を読まない");
}

console.log("Test 23-25: 家族のルール");
{
  const d = detailsOf("application");
  assert(d.familyRuleFrom === "2026-10-02", "23. 家族のルールの変更日を保持");
  assert(
    typeof d.familyRule === "string" && String(d.familyRule).includes("含められない"),
    "23. ほとんどの申請者は家族を含められないことを保持",
  );
  assert(
    String(d.familyRule).includes("subsequent entrant") && /できない/.test(String(d.familyRule)),
    "24. subsequent entrant が現行ルールで不可であることを保持",
  );
  const exemptions = readFactList(d, "familyInclusionExemptions");
  assert(exemptions.length >= 5, `25. 家族の例外を保持（${exemptions.length}件）`);
  assert(
    String(d.familyExemptionsNote ?? "").includes("自動的に当てはまるものではない"),
    "25. 日本の一般ユーザーへ自動適用しないことを記録",
  );
  const ctx = contextOf("application");
  assert(ctx.includes("家族について"), "23. Chat へ渡る");
  assert(ctx.includes("自動的に当てはまるものではない"), "25. 自動適用しない注記が例外と同じ場所で渡る");
}

console.log("Test 26: financial capacity は一次照合未了のまま");
{
  const d = detailsOf("financial_capacity");
  const money = readMoneyFact(d);
  assert(money?.amount === 29710 && money?.currency === "AUD", "26. 既存の候補値を保持（捏造・削除しない）");
  assert(d.primarySourceVerified === false, "26. primarySourceVerified は false のまま");
  assert(
    !entryOf("financial_capacity").sources.some((s) => isPrimarySource(s.sourceType)),
    "26. Home Affairs の出典を付けていない（一次照合未了）",
  );
  assert(
    readFactList(d, "unverified").some((v) => v.includes("Home Affairs")),
    "26. 一次確認が未了であることを未確認項目として持っている",
  );
  const ctx = contextOf("financial_capacity");
  assert(
    ctx.includes("一次情報（Home Affairs）ではなく政府系の補助的な案内です"),
    "26. 一次情報でないことが Chat へ渡る",
  );
}

console.log("Test 27: Genuine Student");
{
  const d = detailsOf("genuine_student");
  assert(d.primarySourceVerified === true, "27. 現行の要件は一次情報で照合済み");
  assert(
    entryOf("genuine_student").sources.some((s) => isPrimarySource(s.sourceType)),
    "27. 一次情報の出典を持つ",
  );
  assert(
    String(d.effectiveFromSource ?? "").includes("Study Australia"),
    "27. 2024-03-23 の適用開始日は Study Australia 由来のままにしている",
  );
  assert(
    contextOf("genuine_student").includes("適用開始日の出典"),
    "27. 日付の出典が区別されて Chat へ渡る",
  );
}

console.log("Test 28-29: processing");
{
  const d = detailsOf("processing");
  assert(d.type === "dynamic_official_guide", "28. 公式ガイド参照型として登録");
  assert(d.fixedDuration === null, "28. 固定日数を持たない");
  assert(d.guaranteed === false, "28. 保証しない");
  assert(d.outsideAustraliaPrioritySystem === true, "29. 国外申請の優先順位の仕組みを保持");
  assert(
    readFactList(d, "ministerialDirections").some((v) => v.includes("MD115")),
    "29. MD115 の metadata を保持",
  );
  assert(
    readFactList(d, "ministerialDirections").some((v) => v.includes("MD111")),
    "29. MD111 の metadata を保持",
  );
  assert(d.currentMinisterialDirectionFrom === "2025-11-14", "29. 現行 direction の開始日を保持");
  const ctx = contextOf("processing");
  assert(ctx.includes("審査期間は保証ではない"), "28. 保証しない指示が渡る");
  assert(ctx.includes("国外からの申請には審査の優先順位の仕組みがある"), "29. 仕組みの存在だけが渡る");
  assert(!ctx.includes("MD115"), "29. Ministerial Direction の番号は既定では渡らない");
}

console.log("Test 30: documents の未確認を必須へ繰り上げていない");
{
  const d = detailsOf("documents");
  const required = readFactList(d, "requiredDocuments");
  const unverified = readFactList(d, "unverified");
  assert(required.length === 2, `必須に近いものは確認できた2件だけ（${required.length}）`);
  assert(
    !required.some((v) => v.includes("パスポート")),
    "30. パスポートを一般知識から必須へ追加していない",
  );
  assert(
    unverified.some((v) => v.includes("パスポート")),
    "30. パスポートの扱いは未確認として記録されている",
  );
  for (const req of required) {
    assert(!unverified.includes(req), `30. 未確認と必須が重複していない（${req.slice(0, 20)}…）`);
  }
  assert(
    typeof d.finalCheck === "string" && String(d.finalCheck).includes("Document Checklist"),
    "30. Document Checklist tool が最終確認手段であることを保持",
  );
}

console.log("Test 31-32: routing");
{
  const off = simulate("シドニーの家賃はどれくらい？");
  assert(!off.readVisaData, "31. ビザ以外の質問では学生ビザのデータを読まない");
  const costOnly = simulate("学生ビザの申請料はいくら？");
  assert(costOnly.categories.includes("costs"), "32. 申請料の質問は costs へ routing される");
  assert(
    costOnly.matched.every((e) => e.category === "costs"),
    `32. 関係ない category を読み込まない（${costOnly.matched.map((e) => e.category).join(",")}）`,
  );
  assert(costOnly.matched.length === 1, "32. 必要最小限の entry だけ読む");
}

console.log("Test 33: 日本円へ換算させない");
{
  const ctx = contextOf("costs", "financial_capacity");
  assert(ctx.includes("日本円へ換算しないでください"), "33. 円換算の禁止が渡る");
  const raw = readFileSync(FILE, "utf8");
  assert(!/円/.test(raw), "33. 登録データに日本円の固定値が無い");
}

console.log("Test 34: 417 / 500 のデータ分離");
{
  const raw = readFileSync(FILE, "utf8");
  assert(!/88\s*(日|days)/.test(raw), "34. 417 の specified work の日数が混入していない");
  assert(!/Working Holiday Maker program/.test(raw), "34. 417 固有の条件文が混入していない");
  // 417 の質問には 417 の entry だけが使われる。
  const whv = simulate("ワーホリでセカンドビザを取るには？");
  assert(
    whv.matched.every((e) => e.visaKey === "australia_working_holiday_417"),
    "34. 417 の質問で Student 500 の entry を読まない",
  );
  const student = simulate("学生ビザの滞在期間はどれくらい？");
  assert(
    student.matched.every((e) => e.visaKey === "australia_student_500"),
    "34. 学生ビザの質問で 417 の entry を読まない",
  );
  // 417 の条件番号（8547）が Student 500 側へ現れない。
  assert(!/8547/.test(raw), "34. 417 の条件番号が Student 500 のデータに無い");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
