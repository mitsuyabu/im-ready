/**
 * Working Holiday 417 の specified work / second_third の登録内容に対するデータ固有テスト。
 *
 *   npx tsx scripts/test-visa-417-specified-work.ts
 *
 * 2026-10-02 に人間が Home Affairs の「Specified subclass 417 work」ページを確認して登録した
 * 内容が、誤った単純化（「ファームで88日いれば取れる」等）を招かない形で保持されているかを見る。
 *
 * 検証ロジック自体の正本は importer（validateVisaDocument）。ここでは再実装せず、
 * 「登録されたデータの中身」と「Chat へ渡るコンテキスト」を確認する。
 * ネットワーク・DB へは接続しない。
 */

import { readFileSync } from "node:fs";
import { VISA_META, type VisaCategory, type VisaKey, type VisaReferenceEntry } from "@/lib/visaReference";
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

const WHV_FILE = "data/visas/australia/working-holiday-417.json";
const doc = JSON.parse(readFileSync(WHV_FILE, "utf8"));
const raw = (doc.entries ?? []) as Record<string, unknown>[];

function rawEntry(category: string): Record<string, unknown> | undefined {
  return raw.find((e) => e.category === category);
}

function detailsOf(category: string): Record<string, unknown> {
  const e = rawEntry(category);
  return e && typeof e.details === "object" && e.details !== null ? (e.details as Record<string, unknown>) : {};
}

function list(category: string, key: string): string[] {
  const value = detailsOf(category)[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** importer の検証を通した entry（Chat へ渡る形に変換）。 */
const validated = validateVisaDocument(WHV_FILE, doc);

function toEntry(category: VisaCategory): VisaReferenceEntry {
  const v = validated.entries.find((e) => e.category === category);
  if (!v) throw new Error(`${category} が検証を通っていない`);
  return {
    id: category,
    visaKey: v.visaKey as VisaKey,
    visaCode: v.visaCode,
    visaName: v.visaName,
    countryCode: v.countryCode,
    category: v.category as VisaCategory,
    summary: v.summary,
    details: v.details,
    reviewedAt: v.reviewedAt,
    sources: v.sources.map((s) => ({
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      sourceType: s.sourceType as VisaReferenceSourceType,
      sourcePublishedAt: s.sourcePublishedAt,
      sourceUpdatedAt: s.sourceUpdatedAt,
      accessedAt: s.accessedAt,
    })),
  } as VisaReferenceEntry;
}

type VisaReferenceSourceType = VisaReferenceEntry["sources"][number]["sourceType"];

const NOW = new Date("2026-10-02T00:00:00Z");

console.log("前提: importer の検証を通っている");
{
  assert(validated.problems.length === 0, "検証エラーなし");
  assert(validated.entries.length === 2, `2カテゴリが受理される（実際: ${validated.entries.length}）`);
  const categories = validated.entries.map((e) => e.category).sort();
  assert(categories.join(",") === "second_third,specified_work", "specified_work と second_third");
}

console.log("Test 1: specified_work が Home Affairs を出典に持つ");
{
  const entry = rawEntry("specified_work")!;
  const sources = (entry.sources ?? []) as Record<string, unknown>[];
  assert(sources.length > 0, "出典がある");
  assert(
    sources.some((s) => s.sourceType === "home_affairs"),
    "一次情報（home_affairs）の出典を持つ",
  );
  assert(
    sources.some((s) => String(s.sourceUrl).includes("specified-work-417")),
    "確認したページの URL が記録されている",
  );
  assert(sources.every((s) => s.accessedAt === "2026-10-02"), "人間が確認した日が記録されている");
  assert(entry.reviewedAt === "2026-10-02", "reviewed_at が記録されている");
}

console.log("Test 2: 対象となる業種が存在する");
{
  const industries = list("specified_work", "industries");
  assert(industries.length >= 6, `業種が複数登録されている（${industries.length}件）`);
  for (const needle of ["植物・動物の栽培", "漁業", "林業", "鉱業", "建設"]) {
    assert(industries.some((i) => i.includes(needle)), `「${needle}」が含まれる`);
  }
}

console.log("Test 3: 対象となる地域の概念が存在する");
{
  assert(detailsOf("specified_work").requiresEligibleArea === true, "対象地域が必要という条件を持つ");
  const areas = list("specified_work", "areas");
  assert(areas.length === 5, `地域区分が5件（実際: ${areas.length}）`);
  for (const needle of ["Remote and Very Remote", "Northern Australia", "Regional Australia", "森林火災", "自然災害"]) {
    assert(areas.some((a) => a.includes(needle)), `「${needle}」の区分がある`);
  }
  assert(
    list("specified_work", "eligibilityCheckSteps").length === 4,
    "業種・仕事内容・地域・時期の4段階の判定手順を持つ",
  );
}

console.log("Test 4-5: セカンドは3か月・最低88 calendar days");
{
  const second = detailsOf("second_third").second as Record<string, unknown>;
  assert(second.requiredPeriod === 3, "3 か月");
  assert(second.requiredPeriodUnit === "months", "単位が months");
  assert(second.minimumCalendarDays === 88, "最低 88 calendar days");
  assert(
    typeof second.calendarDaysBasis === "string" && String(second.calendarDaysBasis).includes("3 shortest"),
    "88日が「最短3暦月相当」であることの根拠を持つ",
  );
}

console.log("Test 6-7: サードは6か月・最低179 calendar days・2019-07-01 以降");
{
  const third = detailsOf("second_third").third as Record<string, unknown>;
  assert(third.requiredPeriod === 6, "6 か月");
  assert(third.requiredPeriodUnit === "months", "単位が months");
  assert(third.minimumCalendarDays === 179, "最低 179 calendar days");
  assert(third.eligibleWorkOnOrAfter === "2019-07-01", "2019-07-01 以降という条件を持つ");
}

console.log("Test 8: 「88 days だけ」では条件完了と扱わない");
{
  const d = detailsOf("second_third");
  assert(d.requiresEquivalentNormalFullTimeWork === true, "フルタイム相当の要件を持つ");
  assert(d.cannotCompleteInShorterTotalPeriod === true, "短い合計期間で完了できないという条件を持つ");
  assert(d.colloquial === "日本語では「88日」と呼ばれることが多い", "「88日」は俗称として保持されている");

  const entry = rawEntry("second_third")!;
  const summary = String(entry.summary);
  assert(summary.includes("日数だけでは条件を満たさず"), "要約が日数だけでは足りないと明言している");
  assert(!/88日働けば/.test(summary), "「88日働けば」という単純化が無い");
  assert(!/88日で取得/.test(summary), "「88日で取得」という単純化が無い");

  // Chat へ渡るコンテキストでも単純化を禁止している
  const context = buildVisaReferenceContext([toEntry("second_third"), toEntry("specified_work")], { now: NOW }) ?? "";
  assert(
    context.includes("農場で日数を働けば必ず取得できるわけではない"),
    "コンテキストが「日数を働けば取れる」を否定している",
  );
  assert(context.includes("「これをやれば取れます」と結論づけないでください"), "結論づけを禁止している");
}

console.log("Test 9: フルタイム相当のルールを保持");
{
  const rules = list("second_third", "countingRules");
  assert(rules.length >= 5, `勤務日の数え方が複数登録されている（${rules.length}件）`);
  assert(rules.some((r) => r.includes("標準とされる通常の1日ないし1シフト")), "1 work day の定義を持つ");
}

console.log("Test 10: 複数雇用主・分割が可能であることを保持");
{
  const split = list("second_third", "splitRules");
  assert(split.some((r) => r.includes("連続した期間で完了する必要はない")), "連続でなくてよい");
  assert(split.some((r) => r.includes("1つの雇用主のもとで完了する必要はない")), "単一雇用主でなくてよい");
  assert(split.some((r) => r.includes("piecework")), "フルタイム/パート/piecework の組合せが可");
}

console.log("Test 11: 同じ日の二重計上を禁止");
{
  const rules = list("second_third", "countingRules");
  assert(
    rules.some((r) => r.includes("同じ暦日に長時間働いても2日分には数えない")),
    "同一暦日の二重計上を禁止する記述がある",
  );
  assert(rules.some((r) => r.includes("10時間")), "具体例（標準5時間の日に10時間）を保持している");
}

console.log("Test 12: 有給の祝日・病欠の扱い");
{
  const rules = list("second_third", "countingRules");
  assert(
    rules.some((r) => r.includes("有給のオーストラリアの祝日") && r.includes("数えられる場合がある")),
    "有給の祝日・病欠は数えられる場合があると保持",
  );
  assert(rules.some((r) => r.includes("無給の祝日・無給の休暇は数えられない")), "無給は数えないと保持");
}

console.log("Test 13: 悪天候で無給の日は数えない");
{
  const rules = list("second_third", "countingRules");
  assert(
    rules.some((r) => r.includes("悪天候") && r.includes("無給だった場合は数えられない")),
    "悪天候で無給の日は数えないと保持",
  );
  assert(
    rules.some((r) => r.includes("天候を理由に必要期間が短縮・免除される一般的な例外はない")),
    "天候による短縮・免除の例外が無いことを保持",
  );
}

console.log("Test 14: ツーリズム・ホスピタリティに地域条件がある");
{
  const industries = list("specified_work", "industries");
  const tourism = industries.find((i) => i.includes("ツーリズム"));
  assert(tourism !== undefined, "ツーリズム・ホスピタリティの区分がある");
  assert(
    tourism!.includes("Northern Australia") && tourism!.includes("Remote and Very Remote"),
    "地域が限定されていることが同じ項目に書かれている",
  );
  assert(tourism!.includes("2021-06-22"), "適用開始の時期条件も保持している");
}

console.log("Test 15: ファームという言葉だけで対象判定しない");
{
  const summary = String(rawEntry("specified_work")!.summary);
  assert(
    summary.includes("業種名や地域名だけでは対象かどうかは決まりません"),
    "業種名・地域名だけでは判定できないと明言",
  );
  const context = buildVisaReferenceContext([toEntry("specified_work")], { now: NOW }) ?? "";
  assert(
    context.includes("specified work の対象となる仕事・業種・地域を、渡されたデータ以外から足さないでください"),
    "対象を勝手に足させない指示がコンテキストにある",
  );
  assert(
    context.includes("特定の求人が対象になるかどうかも保証しないでください"),
    "個別求人の対象可否を保証させない",
  );
}

console.log("Test 16: UK パスポート例外を日本へ適用しない");
{
  for (const category of ["specified_work", "second_third"]) {
    const exceptions = detailsOf(category).passportExceptions;
    assert(Array.isArray(exceptions) && exceptions.length === 1, `${category}: パスポート別の例外として分離されている`);
    const first = (exceptions as Record<string, unknown>[])[0];
    assert(String(first.appliesTo).includes("UK"), `${category}: UK パスポート保持者が対象と明記`);
    assert(String(first.appliesTo).includes("2024-07-01"), `${category}: 適用開始日を保持`);
    assert(
      String(first.note).includes("日本国籍には適用しない"),
      `${category}: 日本国籍へ適用しないと明記`,
    );
  }
  // 一般ルール側（industries / countingRules 等）に UK 例外が混ざっていないこと
  assert(
    !list("specified_work", "industries").some((i) => /UK|イギリス|英国/.test(i)),
    "業種一覧に UK 例外が混ざっていない",
  );
  assert(
    !list("second_third", "countingRules").some((r) => /UK|イギリス|英国/.test(r)),
    "数え方のルールに UK 例外が混ざっていない",
  );
}

console.log("Test 17: same_employer は未確認のまま");
{
  assert(rawEntry("same_employer") === undefined, "same_employer は未登録");
  const readme = JSON.stringify(doc._readme ?? []);
  assert(/same_employer/.test(readme), "未登録である旨が JSON に記録されている");
  assert(/今回のページの対象外/.test(readme), "今回のページの対象外であることが記録されている");

  const sheet = readFileSync("docs/VISA_MANUAL_REVIEW.md", "utf8");
  assert(sheet.includes("2026-10-02 時点: 未確認のまま"), "記録シートにも未確認と残っている");
}

console.log("Test 18: 通常の質問で巨大な一覧を prompt へ全件注入しない");
{
  // 郵便番号の一覧はデータに取り込んでいない
  assert(detailsOf("specified_work").postcodes === undefined, "郵便番号の配列を保持していない");
  assert(
    detailsOf("specified_work").postcodeListAvailableAtSource === true,
    "公式に一覧があることだけを記録している",
  );
  assert(
    list("specified_work", "unverified").some((u) => u.includes("郵便番号")),
    "郵便番号の一覧が未取り込みであることを記録している",
  );

  // 一覧は件数を絞って注入される
  const context = buildVisaReferenceContext([toEntry("specified_work"), toEntry("second_third")], { now: NOW }) ?? "";
  const lines = context.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  assert(longest < 1200, `1行が極端に長くならない（最長 ${longest} 文字）`);
  assert(context.length < 12000, `コンテキスト全体が過大にならない（${context.length} 文字）`);
  assert(
    context.includes("全件はこのデータに含めていない") || !context.includes("ほか"),
    "件数を絞った場合は省略した旨が書かれる",
  );

  // 「セカンド取るには？」で specified_work + second_third だけが対象になる
  const intent = detectVisaIntent("セカンドビザを取るにはどうすればいい？")!;
  assert(
    intent.categories.includes("second_third") && intent.categories.includes("specified_work"),
    "セカンドの質問で両カテゴリが対象になる",
  );
  assert(intent.categories.length === 2, `関係ないカテゴリを取りに行かない（${intent.categories.join(",")}）`);
  const resolution = resolveVisaKeysForChat({ visaKeysInMessage: intent.visaKeysInMessage });
  assert(
    resolution.kind === "resolved" && resolution.visaKeys.join(",") === "australia_working_holiday_417",
    "417 に解決される",
  );
}

console.log("Test 19: 417 / 462 の混同なし");
{
  assert(doc.visaKey === "australia_working_holiday_417", "visaKey が 417");
  assert(doc.visaCode === VISA_META.australia_working_holiday_417.code, "visaCode が 417");
  assert(doc.visaName === VISA_META.australia_working_holiday_417.name, "visaName が正式名称");
  const body = JSON.stringify(doc.entries);
  assert(!/\b462\b/.test(body), "entry に 462 が出てこない");
  assert(!/Work and Holiday/i.test(body), "entry に Work and Holiday が出てこない");
}

console.log("Test 20: 時期の原則とボランティア例外を保持");
{
  const timing = list("second_third", "timingRules");
  assert(timing.some((t) => t.includes("ファーストのワーキングホリデービザを保持している間")), "セカンドの時期の原則");
  assert(timing.some((t) => t.includes("セカンドを保持している間")), "サードの時期の原則");
  assert(timing.some((t) => t.includes("bridging")), "bridging / 旧408 の例外の存在を記録");

  const voluntary = detailsOf("specified_work").voluntaryExceptions;
  assert(
    Array.isArray(voluntary) && voluntary.includes("bushfire_recovery") && voluntary.includes("declared_natural_disaster_recovery"),
    "ボランティアが認められる2区分を保持",
  );
  assert(detailsOf("specified_work").generallyPaid === true, "原則は有給であることを保持");
}

console.log("Test 21: 一般的な証拠要件を勝手に一般化していない");
{
  const evidence = list("specified_work", "evidence");
  assert(evidence.length === 2, `確認できた範囲の証拠だけ（${evidence.length}件）`);
  assert(evidence.some((e) => e.includes("雇用契約書")), "シフト勤務での雇用契約書の保管案内");
  assert(evidence.some((e) => e.includes("COVID-19")), "COVID区分の証拠の記載");
  assert(
    list("specified_work", "unverified").some((u) => u.includes("共通する証拠要件")),
    "一般的な証拠要件が未確認であることを記録",
  );
  assert(
    !evidence.some((e) => /給与明細|payslip/i.test(e)),
    "公式ページで一般要件として確認できなかった給与明細を一般化していない",
  );
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
