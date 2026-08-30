/**
 * lib/schoolComparisonBodyView.ts の pure parser を確認するスクリプト（Step 27）。
 *
 * fixture は lib/schoolComparisonFormatter.ts の実出力の構造に合わせた固定テキスト
 * （formatter を import して結合しすぎない）。
 *
 * 確認する契約:
 * - `■ 今回比較する学校` を canonical としてのみ学校ブロックを認識する（完全一致）
 * - 少しでも曖昧・矛盾・未知構造なら null（間違った比較表より plain text fallback）
 * - verdict は固定 3 種のみ / orphan な「根拠：」は null
 * - budget を fit 化しない / ranking・recommendation・score を生成しない
 * - 出現順を保持し、非空テキスト行を失わない / deterministic
 *
 * 実行方法: npx tsx scripts/test-school-comparison-body-view.ts
 */

import { parseSchoolComparisonBodyView } from "@/lib/schoolComparisonBodyView";

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

const STANDARD = [
  "現在の学校候補の比較",
  "金額は学校データ取得時点の目安です。最新の費用は各学校の案内をご確認ください。",
  "",
  "■ 今回比較する学校",
  "",
  "Alpha College",
  "日本語名：アルファ カレッジ",
  "都市：Sydney",
  "区分：候補",
  "",
  "Beta Institute",
  "都市：Melbourne",
  "区分：参考候補",
  "",
  "■ あなたが大切にしている条件",
  "希望する都市：Sydney",
  "総予算：2000000円",
  "希望する期間：24週間",
  "",
  "■ 学校ごとの比較",
  "",
  "Alpha College",
  "都市：Sydney",
  "国：Australia",
  "コース：一般英語、進学英語",
  "滞在：ホームステイ",
  "進学パスウェイ：あり",
  "授業料目安：情報なし",
  "参照先：https://alpha.example.com/fees",
  "",
  "Beta Institute",
  "都市：Melbourne",
  "国：Australia",
  "コース：情報なし",
  "滞在：学生寮",
  "進学パスウェイ：なし",
  "",
  "■ 条件との合い方",
  "",
  "Alpha College",
  "希望する都市：条件に合っている",
  "根拠：希望：Sydney／学校：Sydney",
  "進学パスウェイ：判断材料なし",
  "根拠：パスウェイの有無が登録されていません",
  "",
  "Beta Institute",
  "希望する都市：確認が必要",
  "根拠：希望：Sydney／学校：Melbourne",
  "",
  "■ まだ比較できないこと",
  "予算条件は入力されていますが、学校の授業料だけでは留学全体の総予算との適合を判断できないため、ここでは一致判定をしていません。",
  "",
  "■ 候補として提示された理由・メモ",
  "以下は候補提示時のマッチング説明であり、学校の客観的な事実情報とは別のものです。",
  "",
  "Alpha College",
  "候補として提示された理由：都市と予算の条件に近いため",
].join("\n");

console.log("Case 1: 2 校 standard parse");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v !== null, "null でない");
  assert(v?.schools.length === 2, "候補校 2 校");
  assert(v?.facts.length === 2, "facts 2 校");
  assert(v?.fits.length === 2, "fits 2 校");
}

console.log("Case 2: 3 校");
{
  const body = STANDARD.replace(
    "Beta Institute\n都市：Melbourne\n区分：参考候補",
    "Beta Institute\n都市：Melbourne\n区分：参考候補\n\nGamma School\n都市：Brisbane\n区分：参考候補",
  ).replace(
    "Beta Institute\n都市：Melbourne\n国：Australia\nコース：情報なし\n滞在：学生寮\n進学パスウェイ：なし",
    "Beta Institute\n都市：Melbourne\n国：Australia\nコース：情報なし\n滞在：学生寮\n進学パスウェイ：なし\n\nGamma School\n都市：Brisbane\n国：Australia",
  );
  const v = parseSchoolComparisonBodyView(body);
  assert(v?.schools.length === 3, "候補校 3 校");
  assert(v?.schools[2].name === "Gamma School", "3 校目の名前");
}

console.log("Case 3: candidate order");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.schools.map((s) => s.name).join(",") === "Alpha College,Beta Institute", "宣言順のまま（並べ替えない）");
}

console.log("Case 4: name");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.schools[0].name === "Alpha College", "英語名");
  assert(v?.schools[0].nameJa === "アルファ カレッジ", "日本語名を捨てない");
}

console.log("Case 5: city");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.schools[0].city === "Sydney", "Alpha の都市");
  assert(v?.schools[1].city === "Melbourne", "Beta の都市");
}

console.log("Case 6: category（変換しない）");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.schools[0].category === "候補", "body の区分ラベルそのまま");
  assert(v?.schools[1].category === "参考候補", "body の区分ラベルそのまま");
}

console.log("Case 7: criteria");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.criteria.length === 3, "条件 3 個");
  assert(v?.criteria[0].label === "希望する都市" && v?.criteria[0].value === "Sydney", "1 個目の条件");
  assert(v?.criteria[2].label === "希望する期間" && v?.criteria[2].value === "24週間", "期間も条件として保持");
}

console.log("Case 8: facts");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alpha = v?.facts[0];
  assert(alpha?.name === "Alpha College", "facts の学校名");
  assert(alpha?.items.find((i) => i.label === "コース")?.value === "一般英語、進学英語", "コースの値そのまま");
}

console.log("Case 9: 情報なし を保持");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alpha = v?.facts[0];
  assert(alpha?.items.find((i) => i.label === "授業料目安")?.value === "情報なし", "「情報なし」も value として保持");
}

console.log("Case 10: source URL を保持");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alpha = v?.facts[0];
  const ref = alpha?.items.find((i) => i.label === "参照先");
  assert(ref?.value === "https://alpha.example.com/fees", "参照先 URL をそのまま保持（validation/fetch しない）");
}

console.log("Case 11: fit match");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alphaFit = v?.fits[0].fits.find((f) => f.label === "希望する都市");
  assert(alphaFit?.verdict === "条件に合っている", "match verdict");
  assert(alphaFit?.basis === "希望：Sydney／学校：Sydney", "basis に value 内の ： を保持");
}

console.log("Case 12: fit check");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const betaFit = v?.fits[1].fits.find((f) => f.label === "希望する都市");
  assert(betaFit?.verdict === "確認が必要", "check verdict");
}

console.log("Case 13: fit no_data");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alphaPathway = v?.fits[0].fits.find((f) => f.label === "進学パスウェイ");
  assert(alphaPathway?.verdict === "判断材料なし", "no_data verdict");
}

console.log("Case 14: basis 対応");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  const alphaPathway = v?.fits[0].fits.find((f) => f.label === "進学パスウェイ");
  assert(alphaPathway?.basis === "パスウェイの有無が登録されていません", "直前の fit 項目に basis が対応");
}

console.log("Case 15: budget は criteria だけ（fit 化しない）");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.criteria.some((c) => c.label === "総予算"), "総予算は criteria に残る");
  const anyBudgetFit = v?.fits.some((s) => s.fits.some((f) => f.label.includes("予算")));
  assert(anyBudgetFit === false, "予算を fit 項目として作らない");
}

console.log("Case 16: unresolved text");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.unresolvedText.length === 1, "まだ比較できないこと 1 行");
  assert(v?.unresolvedText[0].includes("一致判定をしていません"), "元文のまま保持");
}

console.log("Case 17: reason memo");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.reasonMemoText.some((l) => l.includes("マッチング説明")), "免責文を保持");
  assert(v?.reasonMemoText.some((l) => l === "Alpha College"), "学校名行も保持");
  assert(v?.reasonMemoText.some((l) => l.includes("都市と予算の条件に近いため")), "理由本文を保持");
}

console.log("Case 18: school name mismatch → null");
{
  const body = STANDARD.replace("Alpha College\n都市：Sydney\n国：Australia", "Alpha  College\n都市：Sydney\n国：Australia");
  assert(parseSchoolComparisonBodyView(body) === null, "facts の学校名が候補校名と食い違う → null");
}

console.log("Case 19: unknown school → null");
{
  const body = STANDARD.replace(
    "Beta Institute\n都市：Melbourne\n国：Australia",
    "Delta Academy\n都市：Melbourne\n国：Australia",
  );
  assert(parseSchoolComparisonBodyView(body) === null, "候補に無い学校ブロックがある → null");
}

console.log("Case 20: duplicate school → null");
{
  const body = STANDARD.replace(
    "Beta Institute\n都市：Melbourne\n区分：参考候補",
    "Alpha College\n都市：Melbourne\n区分：参考候補",
  );
  assert(parseSchoolComparisonBodyView(body) === null, "同名の候補校が複数 → null");
}

console.log("Case 21: unknown verdict → null");
{
  const body = STANDARD.replace("希望する都市：条件に合っている", "希望する都市：ばっちり");
  assert(parseSchoolComparisonBodyView(body) === null, "固定 3 種以外の判定ラベル → null");
}

console.log("Case 22: orphan basis → null");
{
  const body = STANDARD.replace(
    "Beta Institute\n希望する都市：確認が必要\n根拠：希望：Sydney／学校：Melbourne",
    "Beta Institute\n根拠：対応する fit の無い根拠",
  );
  assert(parseSchoolComparisonBodyView(body) === null, "対応先の無い「根拠：」→ null");
}

console.log("Case 23: fuzzy name matching しない");
{
  const lowerBody = STANDARD.replaceAll("Alpha College", "alpha college");
  // 候補一覧・facts・fits・reason memo すべて小文字化 → 内部整合は取れるので parse は成立するが、
  // 大文字版の候補一覧だけ残すケースで一致しないことを確認する。
  const partialBody = STANDARD.replace(
    "Alpha College\n都市：Sydney\n国：Australia",
    "alpha college\n都市：Sydney\n国：Australia",
  );
  assert(parseSchoolComparisonBodyView(partialBody) === null, "大文字小文字違いを同一視しない → null");
  assert(parseSchoolComparisonBodyView(lowerBody) !== null, "（参考）全体を一貫して小文字化した body は完全一致で成立する");
}

console.log("Case 24-26: ranking / recommendation / score を生成しない");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v !== null && !("ranking" in v), "ranking フィールドを持たない");
  assert(v !== null && !("recommendation" in v) && !("recommended" in v), "recommendation フィールドを持たない");
  assert(v !== null && !("score" in v) && !("scores" in v), "score フィールドを持たない");
  const json = JSON.stringify(v);
  assert(!/"rank"|"1位"|"おすすめ"|"best"|"score"/i.test(json), "view に順位・おすすめ・スコアの語が現れない");
}

console.log("Case 27: 元順維持");
{
  const v = parseSchoolComparisonBodyView(STANDARD);
  assert(v?.facts.map((f) => f.name).join(",") === "Alpha College,Beta Institute", "facts も宣言順");
  assert(v?.fits.map((f) => f.name).join(",") === "Alpha College,Beta Institute", "fits も宣言順");
  assert(
    v?.fits[0].fits.map((f) => f.label).join(",") === "希望する都市,進学パスウェイ",
    "fit 項目の順も body のまま",
  );
}

console.log("Case 28: text loss なし");
{
  const v = parseSchoolComparisonBodyView(STANDARD)!;
  const seen = new Set<string>();
  for (const l of v.preamble) seen.add(l.trim());
  for (const s of v.schools) {
    seen.add(s.name);
    if (s.nameJa) seen.add(s.nameJa);
    if (s.city) seen.add(s.city);
    if (s.category) seen.add(s.category);
  }
  for (const c of v.criteria) seen.add(`${c.label}：${c.value}`);
  for (const s of v.facts) {
    seen.add(s.name);
    for (const it of s.items) seen.add(`${it.label}：${it.value}`);
  }
  for (const s of v.fits) {
    seen.add(s.name);
    for (const f of s.fits) {
      seen.add(`${f.label}：${f.verdict}`);
      if (f.basis) seen.add(f.basis);
    }
  }
  for (const l of v.unresolvedText) seen.add(l.trim());
  for (const l of v.reasonMemoText) seen.add(l.trim());

  for (const important of [
    "現在の学校候補の比較",
    "アルファ カレッジ",
    "希望する都市：Sydney",
    "総予算：2000000円",
    "コース：一般英語、進学英語",
    "授業料目安：情報なし",
    "参照先：https://alpha.example.com/fees",
    "希望：Sydney／学校：Sydney",
    "パスウェイの有無が登録されていません",
    "候補として提示された理由：都市と予算の条件に近いため",
  ]) {
    assert(seen.has(important), `"${important}" が保持されている`);
  }
}

console.log("Case 29: deterministic");
{
  const a = JSON.stringify(parseSchoolComparisonBodyView(STANDARD));
  const b = JSON.stringify(parseSchoolComparisonBodyView(STANDARD));
  assert(a === b, "同じ body なら同じ view");
}

console.log("Case 30: 「■ 今回比較する学校」が無い → null");
{
  const body = ["現在の学校候補の比較", "", "■ 学校ごとの比較", "Alpha College", "都市：Sydney"].join("\n");
  assert(parseSchoolComparisonBodyView(body) === null, "候補一覧が取れなければ null");
}

console.log("Case 31: 認識対象の見出しが重複 → null");
{
  const body = STANDARD + "\n\n■ 学校ごとの比較\nAlpha College\n都市：Sydney";
  assert(parseSchoolComparisonBodyView(body) === null, "同じ既知見出しが 2 回 → null");
}

console.log("Case 32: criteria に KV でない行 → null");
{
  const body = STANDARD.replace("希望する都市：Sydney\n総予算：2000000円", "希望する都市：Sydney\nこれはただの文です\n総予算：2000000円");
  assert(parseSchoolComparisonBodyView(body) === null, "条件セクションの構造ドリフト → null");
}

console.log("Case 33: 未知の「■ 」セクションは otherSections へ（null にしない）");
{
  const body = STANDARD + "\n\n■ 将来追加されたセクション\nなにかのテキスト";
  const v = parseSchoolComparisonBodyView(body);
  assert(v !== null, "未知セクションだけでは null にしない");
  assert(v?.otherSections.length === 1 && v.otherSections[0].heading === "将来追加されたセクション", "otherSections に退避");
  assert(v?.otherSections[0].lines.includes("なにかのテキスト"), "テキストを捨てない");
}

console.log("Case 34: 候補校ブロックに未知属性 → null");
{
  const body = STANDARD.replace("日本語名：アルファ カレッジ", "評価：とても良い");
  assert(parseSchoolComparisonBodyView(body) === null, "許可されない属性ラベル → null");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
