/**
 * Working Holiday 417 の same_employer（visa condition 8547）の登録内容に対するデータ固有テスト。
 *
 *   npx tsx scripts/test-visa-417-same-employer.ts
 *
 * 2026-10-02 に人間が Home Affairs の3ページ（6 month work limitation / Work longer than 6 months /
 * WHM condition 8547 permission request form）を確認して登録した内容が、
 * 「絶対6か月まで」「申請すれば必ず延長できる」等の誤った単純化を招かない形で保持されているかを見る。
 *
 * 検証ロジックの正本は importer（validateVisaDocument）。ここでは再実装せず、
 * 登録データの中身と、Chat へ渡るコンテキストを確認する。ネットワーク・DB へは接続しない。
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

const FILE = "data/visas/australia/working-holiday-417.json";
const doc = JSON.parse(readFileSync(FILE, "utf8"));
const validated = validateVisaDocument(FILE, doc);
const NOW = new Date("2026-10-02T00:00:00Z");

const rawEntry = ((doc.entries ?? []) as Record<string, unknown>[]).find((e) => e.category === "same_employer");
const details =
  rawEntry && typeof rawEntry.details === "object" && rawEntry.details !== null
    ? (rawEntry.details as Record<string, unknown>)
    : {};

function exceptions(): { appliesTo: string; note: string }[] {
  const list = details.exceptions;
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ appliesTo: String(e.appliesTo ?? ""), note: String(e.note ?? "") }));
}

function exceptionFor(needle: string) {
  return exceptions().find((e) => e.appliesTo.includes(needle) || e.note.includes(needle));
}

function toEntry(category: VisaCategory): VisaReferenceEntry {
  const v = validated.entries.find((e) => e.category === category);
  if (!v) throw new Error(`${category} が検証を通っていない`);
  return { ...v, id: category, visaKey: v.visaKey as VisaKey } as unknown as VisaReferenceEntry;
}

const context = buildVisaReferenceContext([toEntry("same_employer")], { now: NOW }) ?? "";

console.log("前提: importer の検証を通っている（検証を弱めていない）");
{
  assert(validated.problems.length === 0, "検証エラーなし");
  assert(rawEntry !== undefined, "same_employer が登録されている");
  assert(
    validated.entries.some((e) => e.category === "same_employer"),
    "same_employer が受理されている（期間があるので例外の記録が必須のルールを満たしている）",
  );
}

console.log("Test 1-3: condition 8547 と原則6か月（単位つき）");
{
  assert(details.conditionNumber === 8547, "condition 8547 を保持");
  assert(details.duration === 6, "一般ルールは 6");
  assert(details.durationUnit === "months", "単位は months");
  assert(context.includes("ビザ条件の番号: 8547"), "条件番号が Chat へ渡る");
  assert(context.includes("期間: 6 months"), "単位つきで期間が渡る");
  assert(
    typeof details.generalRule === "string" && String(details.generalRule).includes("例外に該当する場合"),
    "原則の記述に例外の存在が含まれている",
  );
}

console.log("Test 4-5: 例外の確認状態");
{
  assert(details.exceptionsReviewed === true, "例外の有無を公式で確認した記録がある");
  assert(details.exceptionsExist === true, "例外が存在することを記録している");
  assert(exceptions().length === 5, `例外が5区分（実際: ${exceptions().length}）`);
}

console.log("Test 6: 勤務地が異なる場合の例外");
{
  const e = exceptionFor("勤務地が異なる");
  assert(e !== undefined, "勤務地の例外がある");
  assert(e!.note.includes("どの一箇所でも6か月を超えない"), "一箇所あたりの上限が保持されている");
  assert(
    e!.note.includes("「店舗を変えれば必ずリセットされる」という意味ではなく"),
    "「店舗を変えれば必ずリセット」という誤解を否定している",
  );
  assert(context.includes("店舗を変えれば必ずリセットされる」という意味ではなく"), "その否定が Chat へ渡る");
}

console.log("Test 7: 植物・動物の栽培の例外");
{
  const e = exceptionFor("植物・動物の栽培");
  assert(e !== undefined, "栽培の例外がある");
  assert(e!.note.includes("オーストラリア全域"), "全域が対象であることを保持");
}

console.log("Test 8: critical sector の例外");
{
  const e = exceptionFor("critical sectors");
  assert(e !== undefined, "critical sectors の例外がある");
  for (const sector of [
    "agriculture",
    "food processing",
    "health",
    "aged care",
    "disability care",
    "childcare",
    "tourism",
    "hospitality",
  ]) {
    assert(e!.note.includes(sector), `${sector} が列挙されている`);
  }
  assert(e!.note.includes("公式の記載で確認"), "該当判定は公式確認が必要と添えている");
}

console.log("Test 9-11: Northern Australia の例外と地域条件の保持");
{
  const e = exceptionFor("Northern Australia");
  assert(e !== undefined, "Northern Australia の例外がある");
  for (const industry of ["fishing and pearling", "tree farming and felling", "construction", "mining"]) {
    assert(e!.note.includes(industry), `${industry} が列挙されている`);
  }
  // 地域条件を失っていないこと（全域の例外として誤って扱わない）
  assert(e!.note.includes("Northern Australia に限る"), "地域限定であることが明記されている");
  assert(
    e!.note.includes("オーストラリア全域の例外として扱わないこと"),
    "全域の例外として扱わない指示がある",
  );
  assert(context.includes("Northern Australia に限る"), "地域条件が Chat へ渡る");

  // 全域が対象の例外と、地域限定の例外が区別できる状態になっている
  const nationwide = exceptions().filter((x) => x.note.includes("オーストラリア全域が対象"));
  assert(nationwide.length === 2, `全域が対象の例外は2件（栽培・自然災害復旧。実際: ${nationwide.length}）`);
}

console.log("Test 10: 自然災害からの復旧の例外");
{
  const e = exceptionFor("自然災害からの復旧");
  assert(e !== undefined, "自然災害復旧の例外がある");
  assert(e!.note.includes("オーストラリア全域"), "全域が対象であることを保持");
}

console.log("Test 12-13: 許可の経路と「必ず認められるわけではない」");
{
  const p = details.permission as Record<string, unknown>;
  assert(p?.available === true, "許可の申請ができることを保持");
  assert(p?.notGuaranteed === true, "必ず認められるわけではないことを保持");
  assert(
    Array.isArray(p?.considerations) && (p.considerations as unknown[]).length === 3,
    "考慮される点を3つ保持",
  );
  assert(context.includes("許可の申請: 可能"), "許可の経路が Chat へ渡る");
  assert(
    context.includes("「申請すれば延長できる」と説明しないこと"),
    "「申請すれば必ず延長できる」を禁止する指示が渡る",
  );
  assert(context.includes("許可の判断で考慮される点"), "考慮される点が渡る");
}

console.log("Test 14: 申請時期 — 要件と推奨を混同しない");
{
  const p = details.permission as Record<string, unknown>;
  assert(
    typeof p?.requirement === "string" && String(p.requirement).includes("終了する前に申請する必要がある"),
    "要件: 最初の6か月が終了する前",
  );
  assert(
    typeof p?.recommendation === "string" && String(p.recommendation).includes("2週間前"),
    "推奨: 少なくとも2週間前",
  );
  assert(context.includes("申請時期（要件）"), "要件として渡る");
  assert(context.includes("申請時期（推奨。要件とは別）"), "推奨が要件と区別して渡る");
  // 推奨が要件として書かれていないこと
  assert(
    !/申請時期（要件）: [^\n]*2週間/.test(context),
    "2週間前が要件として扱われていない",
  );
}

console.log("Test 15-16: 審査待ち中の扱い（期限内 / 期限後）");
{
  const p = details.permission as Record<string, unknown>;
  assert(
    typeof p?.whilePendingIfSubmittedInTime === "string" &&
      String(p.whilePendingIfSubmittedInTime).includes("働き続けられる"),
    "期限内申請なら結果まで働き続けられることを保持",
  );
  assert(
    typeof p?.ifSubmittedLate === "string" && String(p.ifSubmittedLate).includes("就労を止めて"),
    "期限後申請ならいったん止める必要があることを保持",
  );
  assert(context.includes("期限内に申請した場合の審査待ち中"), "期限内の扱いが渡る");
  assert(context.includes("期限を過ぎてから申請した場合"), "期限後の扱いが渡る");
  // 遅れて申請しても自動的に継続できる、とは読めないこと
  assert(
    !/期限を過ぎてから申請した場合: [^\n]*働き続けられる/.test(context),
    "期限後でも継続できるとは書かれていない",
  );
}

console.log("Test 17-18: 現行政策の開始日と暫定的な位置づけ");
{
  assert(details.effectiveFrom === "2024-01-01", "適用開始が 2024-01-01");
  assert(details.policyStatus === "current_policy_during_consultation", "見直し中の現行取り扱いとして保持");
  assert(
    typeof details.policyNote === "string" && String(details.policyNote).includes("恒久的な制度として扱わず"),
    "恒久的な制度として扱わない旨を保持",
  );
  assert(context.includes("適用開始: 2024-01-01"), "開始日が Chat へ渡る");
  assert(
    context.includes("恒久的な制度として断定せず、変更され得る前提で説明すること"),
    "変更され得る前提で説明させる指示が渡る",
  );
  // permanentRule のような固定化をしていない
  assert(details.permanentRule === undefined, "permanentRule として固定していない");
}

console.log("Test 19: VEVO での個別確認の案内");
{
  assert(
    typeof details.vevoGuidance === "string" &&
      String(details.vevoGuidance).includes("VEVO") &&
      String(details.vevoGuidance).includes("grant letter"),
    "grant letter / VEVO での確認案内を保持",
  );
  assert(context.includes("本人の条件の確認"), "個別確認の案内が Chat へ渡る");
  assert(
    String(details.vevoGuidance).includes("制度の一般的な説明と、本人個別の条件の確認は分けて"),
    "一般説明と個別確認を分ける指示を保持",
  );
}

console.log("Test 20: 無関係な質問では same_employer を取得しない");
{
  const fee = detectVisaIntent("ワーホリのビザ代はいくら？");
  assert(fee !== null, "ビザ代の質問はビザ intent として認識される");
  assert(!fee!.categories.includes("same_employer"), "same_employer は対象にならない");
  assert(fee!.categories.includes("costs"), "costs が対象になる");

  const emotional = detectVisaIntent("留学するか迷っています");
  assert(emotional === null, "通常会話ではビザ情報を読まない");

  const sameEmployer = detectVisaIntent("ワーホリって同じ会社で6ヶ月しか働けないの？");
  assert(sameEmployer !== null && sameEmployer.categories.includes("same_employer"), "同じ会社の質問で same_employer が対象");
  const resolution = resolveVisaKeysForChat({ visaKeysInMessage: sameEmployer!.visaKeysInMessage });
  assert(
    resolution.kind === "resolved" && resolution.visaKeys.join(",") === "australia_working_holiday_417",
    "417 に解決される",
  );
}

console.log("Test 21: 417 / 462 の混同なし");
{
  assert(doc.visaKey === "australia_working_holiday_417", "visaKey が 417");
  assert(doc.visaCode === VISA_META.australia_working_holiday_417.code, "visaCode が 417");
  const body = JSON.stringify(doc.entries);
  assert(!/\b462\b/.test(body), "entry に 462 の番号が出てこない");
  assert(!/Work and Holiday/i.test(body), "entry に Work and Holiday が出てこない");
  // 条件の適用範囲は、サブクラス番号を列挙せずプログラム名で表現している
  assert(
    typeof details.appliesToVisaProgram === "string" &&
      String(details.appliesToVisaProgram).includes("Working Holiday Maker program"),
    "WHM プログラムの条件として表現されている",
  );
}

console.log("Test 22: 「絶対6か月まで」と単純化しない");
{
  const summary = String(rawEntry!.summary);
  assert(summary.includes("ただし現在は例外があり"), "要約が例外の存在に触れている");
  assert(summary.includes("許可を申請できます"), "要約が許可の経路に触れている");
  assert(summary.includes("必ず認められるわけではなく"), "要約が許可の不確実性に触れている");
  assert(!/絶対.*6ヶ月|6か月までしか働けません。$/.test(summary), "断定的な単純化が無い");

  // 原則と例外が同じコンテキストに必ず同居している
  assert(context.includes("原則: 同一の雇用主で働けるのは最大6か月"), "原則が渡る");
  assert((context.match(/- 例外: /g) ?? []).length === 5, "例外5件が同じコンテキストに渡る");

  // 全体として「農業なら全部無制限」と読めないこと
  const cultivation = exceptionFor("植物・動物の栽培");
  assert(!/無制限|制限なし/.test(cultivation!.note), "「無制限」という表現を使っていない");
}

console.log("Test 23: 未確認項目を推測で埋めていない");
{
  const unverified = Array.isArray(details.unverified) ? (details.unverified as string[]) : [];
  assert(unverified.length === 4, `未確認項目を4件記録（実際: ${unverified.length}）`);
  assert(unverified.some((u) => u.includes("labour hire")), "labour hire の判断基準が未確認");
  assert(unverified.some((u) => u.includes("critical sectors")), "critical sectors の定義が未確認");
  assert(unverified.some((u) => u.includes("Northern Australia の地理的範囲")), "Northern Australia の範囲が未確認");
  assert(unverified.some((u) => u.includes("審査基準")), "許可の審査基準が未確認");
  assert(context.includes("**未確認**"), "未確認であることが Chat へ渡る");
  assert(context.includes("推測して答えないこと"), "推測を禁止する指示が渡る");
}

console.log("Test 24: セカンド・サードでの扱い（1社で生涯6か月ではない）");
{
  const ctx = Array.isArray(details.visaPeriodContext) ? (details.visaPeriodContext as string[]) : [];
  assert(ctx.length === 3, `ビザの回ごとの扱いを3件保持（実際: ${ctx.length}）`);
  assert(ctx.some((c) => c.includes("セカンドのビザでは")), "セカンドでの扱いを保持");
  assert(ctx.some((c) => c.includes("サードのビザでは")), "サードでの扱いを保持");
  assert(
    ctx.some((c) => c.includes("「1つの会社で生涯6か月まで」という意味ではない")),
    "生涯6か月という誤解を否定している",
  );
  assert(context.includes("ビザの回ごとの扱い"), "Chat へ渡る");
  assert(context.includes("生涯6か月まで」という意味ではない"), "誤解の否定が渡る");
}

console.log("Test 25: 出典メタデータ（3ページ）");
{
  const sources = (rawEntry!.sources ?? []) as Record<string, unknown>[];
  assert(sources.length === 3, `出典が3件（実際: ${sources.length}）`);
  assert(sources.every((s) => s.sourceType === "home_affairs"), "すべて一次情報");
  assert(sources.every((s) => s.accessedAt === "2026-10-02"), "確認日が記録されている");
  for (const needle of ["6-month-work-limitation", "work-longer-than-6-months", "permission-request-form"]) {
    assert(sources.some((s) => String(s.sourceUrl).includes(needle)), `${needle} のページが記録されている`);
  }
  assert(rawEntry!.reviewedAt === "2026-10-02", "reviewed_at が記録されている");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
