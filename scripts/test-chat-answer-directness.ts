/**
 * 「今の質問に直接・簡潔に答える」ための prompt 規則のテスト。
 *
 *   npx tsx scripts/test-chat-answer-directness.ts
 *
 * 背景（Phase 8.2）: 実機で「学生ビザで働くことができますか？」と聞いたとき、
 * 事実は正しいがワーキングホリデーの話・Plan 由来の背景説明・不要な follow-up まで
 * 広がっていた。原因は prompt が常にカウンセリング型（質問を1つ返す・動機を掘る）
 * だったこと。ここでは規則が入っていること・routing が質問の範囲に絞られることを固定する。
 *
 * LLM は呼ばない（文章の生成結果ではなく、渡す規則と routing を見る）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { buildSystemPrompt } from "@/lib/prompt";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import { detectCityReferenceIntent } from "@/lib/cityReferenceIntent";
import { buildVisaReferenceContext } from "@/lib/visaReferenceContext";
import { buildCityReferenceContext } from "@/lib/cityReferenceContext";
import type { VisaCategory, VisaKey, VisaReferenceEntry } from "@/lib/visaReference";
import type { CityKey, CityReferenceCategory, CityReferenceEntry } from "@/lib/cityReference";
import { CITY_ADMIN_AREA } from "@/lib/cityReference";

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

function loadVisaSeed(): VisaReferenceEntry[] {
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
        countryCode: "AU",
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

function loadCitySeed(): CityReferenceEntry[] {
  const out: CityReferenceEntry[] = [];
  for (const file of readdirSync("data/cities/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(`data/cities/australia/${file}`, "utf8"));
    for (const [i, e] of (d.entries ?? []).entries()) {
      out.push({
        id: `${d.cityKey}-${e.category}-${i}`,
        cityKey: d.cityKey as CityKey,
        countryCode: "AU",
        adminArea: d.adminArea ?? CITY_ADMIN_AREA[d.cityKey as CityKey],
        category: e.category as CityReferenceCategory,
        summary: e.summary,
        notes: e.notes ?? null,
        estimates: e.details?.estimates ?? [],
        reviewedAt: e.reviewedAt,
        sources: (e.sources ?? []).map((s: Record<string, unknown>) => ({
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          sourceType: s.sourceType,
          sourcePublishedAt: s.sourcePublishedAt ?? null,
          sourceUpdatedAt: s.sourceUpdatedAt ?? null,
          note: s.note ?? null,
        })),
      } as CityReferenceEntry);
    }
  }
  return out;
}

const VISA_SEED = loadVisaSeed();
const CITY_SEED = loadCitySeed();
const NOW = new Date("2026-10-20T00:00:00Z");

/** route と同じ routing（匿名 /widget 相当。Karte なし）。 */
function visaRouting(message: string) {
  const intent = detectVisaIntent(message);
  if (!intent) return { categories: [] as VisaCategory[], entries: [] as VisaReferenceEntry[] };
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind !== "resolved") return { categories: intent.categories, entries: [] };
  return {
    categories: intent.categories,
    entries: VISA_SEED.filter(
      (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
    ),
  };
}

console.log("Test 1: 「学生ビザで働けますか？」→ work_rights 中心");
{
  for (const message of ["学生ビザで働けますか？", "学生ビザで働くことができますか？", "学生ビザで働けますか"]) {
    const r = visaRouting(message);
    assert(r.categories.join(",") === "work_rights", `「${message}」→ work_rights だけ（${r.categories.join(",")}）`);
    assert(
      r.entries.length === 1 && r.entries[0].category === "work_rights",
      `「${message}」→ 読む entry も work_rights だけ`,
    );
  }
  const ctx = buildVisaReferenceContext(visaRouting("学生ビザで働けますか？").entries, { now: NOW }) ?? "";
  assert(ctx.includes("48 hours per fortnight"), "48 hours per fortnight が渡る");
  assert(ctx.includes("Masters by Research"), "例外が渡る");
  assert(!ctx.includes("ワーキングホリデー"), "ワーホリの制度情報が渡らない");
  assert(!ctx.includes("家族"), "家族のルールが渡らない");
}

console.log("Test 2: Plan / Karte の背景から別テーマへ広げない指示がある");
{
  const planPrompt = buildSystemPrompt(
    "シドニー",
    "- ワーキングホリデーへの関心: あり\n- 希望都市: シドニー",
    null,
    null,
    { planContext: true },
  );
  assert(
    planPrompt.includes("今の質問に答えるために必要なときだけ使ってください"),
    "既知情報は今の質問に必要なときだけ使う指示がある",
  );
  assert(
    planPrompt.includes("ワーキングホリデーへの関心") && planPrompt.includes("回答本文へ持ち出したり"),
    "関係しない既知情報を回答へ持ち出さない指示がある",
  );
  assert(
    planPrompt.includes("別の話題・比較へ広げたりしないでください"),
    "別テーマ・比較へ広げない指示がある",
  );
  assert(
    planPrompt.includes("背景情報（Plan・ワークシート"),
    "背景情報は精度を上げるためにだけ使う指示がある",
  );
  assert(
    planPrompt.includes("話題を増やすために使わない"),
    "話題を増やす目的に使わない指示がある",
  );
  // Plan の「次に何を話すか」が、答えたターンで無理に次へ進ませないようになっている
  assert(
    planPrompt.includes("無理に次の話題へ進んだり質問を足したりせず"),
    "答えられたターンでは次の話題へ進ませない指示がある",
  );
}

console.log("Test 3: 不要な follow-up を付けない指示がある");
{
  const prompt = buildSystemPrompt(null, null, null, null, {});
  assert(prompt.includes("最後に質問を返さない"), "答えられている場合は質問を返さない指示がある");
  for (const filler of [
    "〇〇を考え始めたのですか？",
    "他に聞きたいことはありますか？",
    "他に気になることがあれば教えてください",
  ]) {
    assert(prompt.includes(filler), `内容の無い一文の例（${filler}）を禁止として挙げている`);
  }
  assert(prompt.includes("内容の無い確認・相づち"), "相づちだけの文を禁止している");
  // 既存の「質問は1つ」ルールが、質問を必須にしない形へ直っている
  assert(
    prompt.includes("不要なら質問を返さなくてよい"),
    "「質問は1つ」ルールが質問を必須にしていない",
  );
}

console.log("Test 4: 「学生ビザはいくら？」→ costs 中心");
{
  for (const message of ["学生ビザはいくらですか？", "学生ビザの申請料はいくら？"]) {
    const r = visaRouting(message);
    assert(r.categories.join(",") === "costs", `「${message}」→ costs だけ（${r.categories.join(",")}）`);
  }
  const ctx = buildVisaReferenceContext(visaRouting("学生ビザはいくらですか？").entries, { now: NOW }) ?? "";
  assert(ctx.includes("AUD 2,500"), "申請料が渡る");
  assert(!ctx.includes("家族を含められる例外"), "家族のルールが渡らない");
  assert(!ctx.includes("years_up_to"), "滞在期間が渡らない");
  assert(!ctx.includes("48 hours per fortnight"), "就労条件が渡らない");
}

console.log("Test 5: 「日本人のワーホリ何歳まで？」→ eligibility 中心");
{
  const r = visaRouting("日本人のワーホリって何歳まで？");
  assert(r.categories.join(",") === "eligibility", `eligibility だけ（${r.categories.join(",")}）`);
  const ctx = buildVisaReferenceContext(r.entries, { now: NOW }) ?? "";
  assert(ctx.includes("18〜30歳"), "年齢が渡る");
  assert(!ctx.includes("88 calendar days"), "88日の条件が渡らない");
  assert(!ctx.includes("conditionNumber") && !ctx.includes("8547"), "同一雇用主の条件が渡らない");
  assert(!ctx.includes("学生ビザ（サブクラス500）"), "学生ビザの情報が渡らない");
}

console.log("Test 6: 「シドニーの交通費は？」→ transport 中心");
{
  const intent = detectCityReferenceIntent("シドニーの交通費は？");
  assert(intent?.categories.join(",") === "transport", `transport だけ（${intent?.categories.join(",")}）`);
  const entries = CITY_SEED.filter(
    (e) => e.cityKey === "sydney" && (intent?.categories ?? []).includes(e.category),
  );
  assert(entries.length === 1 && entries[0].category === "transport", "読む entry も transport だけ");
  const ctx = buildCityReferenceContext(entries, ["sydney"]) ?? "";
  assert(ctx.includes("Opal"), "交通の情報が渡る");
  assert(!ctx.includes("BOCSAR"), "治安の情報が渡らない");
  assert(!ctx.includes("980"), "住居費の金額が渡らない");
}

console.log("Test 7: 複雑な質問では必要情報を落とさない指示がある");
{
  const prompt = buildSystemPrompt(null, null, null, null, {});
  assert(prompt.includes("短くすることが目的ではない"), "短さを目的にしない指示がある");
  assert(
    prompt.includes("必要な条件・例外・注意点を省略しない"),
    "条件・例外を省略しない指示がある",
  );
  assert(prompt.includes("質問に必要な情報量に合わせる"), "情報量を質問に合わせる指示がある");
  // 比較質問では両方のビザが routing される
  const compare = detectVisaIntent("学生ビザとワーホリ、メルボルンで生活するならどっちがいい？");
  assert(
    (compare?.visaKeysInMessage ?? []).length === 2,
    `比較質問では2つのビザが拾われる（${(compare?.visaKeysInMessage ?? []).join(",")}）`,
  );
}

console.log("Test 8: 88日の質問は条件を省略させない");
{
  const r = visaRouting("ファームで88日働けばセカンド取れますか？");
  assert(
    r.categories.sort().join(",") === "second_third,specified_work",
    `セカンドと specified work の両方（${r.categories.join(",")}）`,
  );
  const ctx = buildVisaReferenceContext(r.entries, { now: NOW }) ?? "";
  for (const need of [
    "88 calendar days",
    "対象となる業種",
    "対象となる地域",
    "フルタイム",
    "短縮されない",
  ]) {
    assert(ctx.includes(need), `条件（${need}）が渡る`);
  }
  assert(
    ctx.includes("業種だけに触れて地域の条件を落とさないでください"),
    "地域の条件を落とさない指示が渡る",
  );
  // 狭い質問向けの簡潔化が、条件の多い質問には適用されない書き方になっている
  assert(
    ctx.includes("条件や例外が複数ある質問") && ctx.includes("必要な条件を省略せずに"),
    "条件が複数ある質問では省略しない指示が渡る",
  );
}

console.log("Test 9: same-employer の質問は例外を省略させない");
{
  const r = visaRouting("ワーホリで同じ会社では6ヶ月しか働けない？");
  assert(r.categories.join(",") === "same_employer", `same_employer（${r.categories.join(",")}）`);
  const ctx = buildVisaReferenceContext(r.entries, { now: NOW }) ?? "";
  assert(ctx.includes("例外"), "例外が渡る");
  assert(ctx.includes("どの勤務地でも6か月を超えないこと"), "勤務地の条件が渡る");
  assert(ctx.includes("必ずリセットされる"), "リセットの誤解を禁止する指示が渡る");
  assert(ctx.includes("許可"), "許可の経路が渡る");
}

console.log("Test 10: 狭い質問向けの長さ規則が入っている（出典 UI は変更なし）");
{
  const prompt = buildSystemPrompt(null, null, null, null, {});
  assert(prompt.includes("2〜4文程度で簡潔に"), "狭い質問は2〜4文の指示がある");
  assert(prompt.includes("まず、ユーザーが今している質問に直接答える"), "まず直接答える指示がある");
  const visaCtx = buildVisaReferenceContext(visaRouting("学生ビザで働けますか？").entries, { now: NOW }) ?? "";
  assert(visaCtx.includes("答えの長さは**質問の広さに合わせてください**"), "ビザ側も質問の広さに合わせる");
  assert(visaCtx.includes("聞かれていない項目へ話を広げないでください"), "聞かれていない項目へ広げない");
  const cityCtx = buildCityReferenceContext(
    CITY_SEED.filter((e) => e.cityKey === "sydney" && e.category === "transport"),
    ["sydney"],
  ) ?? "";
  assert(cityCtx.includes("答えの長さは**質問の広さに合わせ**"), "都市側も質問の広さに合わせる");
  // 出典パネルのコンポーネントは今回変更していない
  const component = readFileSync("components/chat/SourceDisclosure.tsx", "utf8");
  assert(/参考情報 \{sources\.length\}件/.test(component), "出典パネルの表示は従来どおり");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
