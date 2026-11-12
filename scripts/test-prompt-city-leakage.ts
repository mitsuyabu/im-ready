/**
 * 最終 system prompt への「都市別金額」混入を防ぐ回帰テスト。
 *
 *   npx tsx scripts/test-prompt-city-leakage.ts
 *
 * 既存の都市テスト（test-city-reference-data / test-city-answer-rules / test-dev-city-snapshot）は
 * **都市リファレンス層が生成する context 文字列だけ**を検査していた。そのため
 * lib/data/cities.ts → lib/knowledge.ts → lib/prompt.ts の経路で**毎ターン注入されていた
 * 都市別の実額**（例: メルボルンの家賃 約A$150〜400/週）が、どのテストの視野にも入っておらず、
 * 「formal city reference が無い都市の金額が回答に出る」という漏れを検出できなかった。
 *
 * このテストは buildSystemPrompt() の**最終出力**を直接検査する。
 *
 * ルール:
 *   - 都市名 + 具体的な金額を prompt へ渡してよいのは formal city reference data だけ
 *   - 常時注入の知識ベースは、都市別の金額を持たない（国レベルの目安だけ）
 *   - formal data が無い都市・費目では、国レベルの目安を「その都市の金額」へ変換させない
 *   - dev snapshot（Numbeo 指数）は production 相当の経路で最終 prompt に入らない
 *
 * ネットワーク・remote DB へは接続しない（curated JSON と純粋関数だけを使う）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { AUSTRALIA_KNOWLEDGE } from "@/lib/knowledge";
import { buildSystemPrompt } from "@/lib/prompt";
import { CITY_ADMIN_AREA, type CityKey, type CityReferenceCategory, type CityReferenceEntry } from "@/lib/cityReference";
import { detectCityReferenceIntent, resolveCityKeysForChat } from "@/lib/cityReferenceIntent";
import {
  buildCityReferenceContext,
  buildCityReferenceNoDataContext,
} from "@/lib/cityReferenceContext";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import { buildVisaReferenceContext } from "@/lib/visaReferenceContext";
import type { VisaCategory, VisaKey, VisaReferenceEntry } from "@/lib/visaReference";
import { isDevCitySnapshotEnabled, loadDevCitySnapshots } from "@/lib/devCitySnapshot";

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

const NOW = new Date("2026-11-12T00:00:00Z");
const PROD_ENV = { NODE_ENV: "production", CITY_REFERENCE_DEV_SNAPSHOT: "true" };

/** 都市名（prompt 本文に出てくる日本語表記）。 */
const CITY_NAMES = ["シドニー", "メルボルン", "ブリスベン", "ゴールドコースト", "ケアンズ", "パース"];

/** 金額を表す書き方。 */
const AMOUNT = /A\$|AUD|豪ドル|\d\s*ドル/;

/**
 * lib/data/cities.ts に残っている都市別の実額（知識ベースから外した値）。
 * 1つでも最終 prompt に現れたら、常時注入経路へ戻ってしまっている。
 */
const LEGACY_CITY_AMOUNTS = [
  "約A$150〜400/週", // メルボルン 家賃
  "約A$80〜120/週", // メルボルン 食費
  "約A$35〜45/週", // メルボルン 交通
  "約A$2,014", // VIC 州平均週収
  "約A$980〜3,500/月", // シドニー 家賃
  "約A$1,000〜2,500/月", // シドニー 食費
  "約A$130〜800/月", // シドニー 交通
  "約A$2,084", // NSW 州平均週収
  "約A$150〜600/週", // ブリスベン 家賃
  "約A$60〜150/週", // ブリスベン 食費
  "約A$15〜40/食", // ブリスベン 外食
  "約A$1,995", // QLD 州平均週収
  "約A$200〜400/週", // ゴールドコースト 家賃
  "約A$480〜1,760/月", // ケアンズ 家賃
  "約A$294〜659/週", // パース 家賃
];

/** 国レベルの目安（残す値）。 */
const COUNTRY_LEVEL_ESTIMATES = [
  "週A$300〜500",
  "週A$250〜350",
  "週A$200〜400",
  "月A$400〜600",
  "月A$150〜220",
];

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
        countryCode: d.countryCode ?? "AU",
        category: e.category as VisaCategory,
        summary: e.summary,
        details: e.details ?? {},
        reviewedAt: e.reviewedAt,
        sources: e.sources ?? [],
      } as VisaReferenceEntry);
    }
  }
  return out;
}

const CITY_SEED = loadCitySeed();
const VISA_SEED = loadVisaSeed();

/** route と同じ都市経路（匿名 /widget 相当。My Plan / Karte なし・production 相当）。 */
function cityContextFor(message: string): { context: string | null; cityKeys: CityKey[]; usedFormal: boolean } {
  const intent = detectCityReferenceIntent(message);
  if (!intent) return { context: null, cityKeys: [], usedFormal: false };
  const resolution = resolveCityKeysForChat({
    citiesInMessage: intent.citiesInMessage,
    myPlanCity: null,
    karteStatedCity: null,
    karteCityInConflict: false,
  });
  if (resolution.kind === "needsCity") return { context: null, cityKeys: [], usedFormal: false };
  const entries = CITY_SEED.filter(
    (e) => resolution.cityKeys.includes(e.cityKey) && intent.categories.includes(e.category),
  );
  // production 相当では dev snapshot は読まれない（isDevCitySnapshotEnabled が false）。
  if (entries.length === 0) {
    return { context: buildCityReferenceNoDataContext(resolution.cityKeys), cityKeys: resolution.cityKeys, usedFormal: false };
  }
  return {
    context: buildCityReferenceContext(entries, resolution.cityKeys, NOW),
    cityKeys: resolution.cityKeys,
    usedFormal: true,
  };
}

/** route と同じビザ経路。 */
function visaContextFor(message: string): string | null {
  const intent = detectVisaIntent(message);
  if (!intent) return null;
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind !== "resolved") return null;
  const entries = VISA_SEED.filter(
    (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
  );
  return entries.length > 0 ? buildVisaReferenceContext(entries, { now: NOW }) : null;
}

/** そのターンに LLM へ渡る最終 system prompt。 */
function finalPrompt(message: string): string {
  return buildSystemPrompt(null, null, null, null, {
    cityReferenceContextText: cityContextFor(message).context,
    visaReferenceContextText: visaContextFor(message),
  });
}

/** 都市名と金額が同じ行に並んでいる行を返す（formal data の行は呼び出し側で除外する）。 */
function cityAmountLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => AMOUNT.test(line) && CITY_NAMES.some((city) => line.includes(city)));
}

console.log("Test 1: 常時注入の知識ベースは都市別の金額を持たない");
{
  for (const value of LEGACY_CITY_AMOUNTS) {
    assert(!AUSTRALIA_KNOWLEDGE.includes(value), `知識ベースに都市別の実額「${value}」が無い`);
  }
  const leaked = cityAmountLines(AUSTRALIA_KNOWLEDGE);
  assert(
    leaked.length === 0,
    `知識ベースに「都市名 + 金額」の行が無い（実際: ${leaked.slice(0, 2).join(" / ")}）`,
  );
  // 都市セクション自体（定性情報）は残っている
  for (const city of CITY_NAMES) {
    assert(AUSTRALIA_KNOWLEDGE.includes(`### ${city}`), `${city}の定性セクションは残っている`);
  }
  assert(AUSTRALIA_KNOWLEDGE.includes("- 特徴:"), "都市の特徴は残っている");
  assert(AUSTRALIA_KNOWLEDGE.includes("- 向いている人:"), "向いている人は残っている");
  assert(!AUSTRALIA_KNOWLEDGE.includes("- 家賃:"), "都市ごとの家賃行は無い");
  assert(!AUSTRALIA_KNOWLEDGE.includes("- 食費（自炊中心）:"), "都市ごとの食費行は無い");
  assert(!AUSTRALIA_KNOWLEDGE.includes("- 交通費:"), "都市ごとの交通費行は無い");
  assert(!AUSTRALIA_KNOWLEDGE.includes("州平均週収"), "州平均週収は無い");
  // 国レベルの目安は残り、国全体のものだと書かれている
  for (const value of COUNTRY_LEVEL_ESTIMATES) {
    assert(AUSTRALIA_KNOWLEDGE.includes(value), `国レベルの目安「${value}」は残っている`);
  }
  assert(
    AUSTRALIA_KNOWLEDGE.includes("この表は**オーストラリア全体の一般的な目安**です。**特定の都市の相場ではありません**。"),
    "国レベルの目安であることが明記されている",
  );
  assert(
    AUSTRALIA_KNOWLEDGE.includes("都市別の家賃・食費・交通費を、この知識ベースから答えることはできません"),
    "知識ベースから都市別金額を答えられないと明記されている",
  );
}

console.log("Test 2: 合計額を自分で作らせない / 単位を変えさせない指示がある");
{
  assert(
    AUSTRALIA_KNOWLEDGE.includes("記載されている費目と単位のまま"),
    "費目と単位のまま伝える指示がある",
  );
  assert(
    AUSTRALIA_KNOWLEDGE.includes("合計額を作らないでください"),
    "費目を足して合計額を作らない指示がある",
  );
  assert(
    AUSTRALIA_KNOWLEDGE.includes("「〇〇（都市名）では」"),
    "国の目安を都市の相場へ言い換えない指示がある",
  );
}

console.log("Test 3: ビザの資金質問（§11 A）— 都市層は起動せず、都市別金額も渡らない");
{
  for (const message of ["ワーホリの資金はいくら必要？", "ワーホリで必要な貯金はいくら？", "ワーホリの資金証明はいくら？"]) {
    assert(detectCityReferenceIntent(message) === null, `「${message}」→ 都市層を起動しない`);
    const prompt = finalPrompt(message);
    for (const value of LEGACY_CITY_AMOUNTS) {
      assert(!prompt.includes(value), `「${message}」→ 都市別の実額「${value}」が渡らない`);
    }
    const leaked = cityAmountLines(prompt);
    assert(
      leaked.length === 0,
      `「${message}」→ 「都市名 + 金額」の行が無い（実際: ${leaked.slice(0, 2).join(" / ")}）`,
    );
  }
  // 417 の確認済みの資金要件は渡る（こちらは formal data）
  const prompt = finalPrompt("ワーホリの資金はいくら必要？");
  assert(prompt.includes("5,000") || prompt.includes("5000"), "417 の確認済みの資金額は渡る");
  // 国レベルの目安が残る場合も、都市名と結びついていない
  assert(prompt.includes("週A$200〜400"), "国レベルの目安は残る");
  assert(
    prompt.includes("**特定の都市の相場ではありません**"),
    "国レベルの目安が都市の相場ではないと明記されている",
  );
}

console.log("Test 4: メルボルン（§11 B）— formal data が無い都市では都市別金額を渡さない");
{
  const message = "メルボルンの生活費はいくら？";
  const city = cityContextFor(message);
  assert(city.cityKeys.join(",") === "melbourne", "対象はメルボルンだけ");
  assert(city.usedFormal === false, "メルボルンの formal entry は無い");
  const prompt = finalPrompt(message);
  for (const value of LEGACY_CITY_AMOUNTS) {
    assert(!prompt.includes(value), `legacy のメルボルン金額「${value}」が渡らない`);
  }
  const leaked = cityAmountLines(prompt);
  assert(leaked.length === 0, `「都市名 + 金額」の行が無い（実際: ${leaked.slice(0, 2).join(" / ")}）`);
  assert(
    prompt.includes("メルボルンについて、今参照できる確認済みの情報がありません"),
    "確認済みデータが無いことが渡る",
  );
  assert(
    prompt.includes("メルボルン固有の水準を断定しないでください"),
    "都市固有の水準を断定させない指示が渡る",
  );
  assert(
    prompt.includes("オーストラリア全体の一般的な目安であって、この都市の数値ではない"),
    "一般の目安は全国のものだと明示させる指示が渡る",
  );
  assert(prompt.includes("週A$200〜400"), "国レベルの目安は使える");
}

console.log("Test 5: シドニー（§11 C）— 一部 category だけ formal data がある都市");
{
  const message = "シドニーの生活費は？";
  const city = cityContextFor(message);
  assert(city.cityKeys.join(",") === "sydney", "対象はシドニーだけ");
  assert(city.usedFormal === true, "シドニーの formal entry が渡る");
  const context = city.context ?? "";
  const prompt = finalPrompt(message);
  // formal な住居費・交通が渡る
  assert(context.includes("住居費"), "formal の住居費が渡る");
  assert(context.includes("交通"), "formal の交通が渡る");
  assert(/AUD\s?[\d,]/.test(context), "formal の金額が渡る");
  // legacy の都市別実額は渡らない
  for (const value of ["約A$980〜3,500/月", "約A$1,000〜2,500/月", "約A$130〜800/月", "約A$2,084"]) {
    assert(!prompt.includes(value), `legacy のシドニー金額「${value}」が渡らない`);
  }
  // 確認済みの項目が明示され、食費がそこに含まれない（formal data が無いため）
  assert(
    context.includes("シドニーについて確認済みなのは次の項目だけです:"),
    "確認済みの項目が明示される",
  );
  const providedLine = context.split("\n").find((l) => l.includes("シドニーについて確認済みなのは")) ?? "";
  assert(!providedLine.includes("食費"), "食費は確認済みの項目に含まれない");
  assert(providedLine.includes("住居費") && providedLine.includes("交通"), "住居費・交通は含まれる");
  // 一般の目安を都市の金額へ変換させない指示
  assert(
    context.includes("この都市の金額として言ってよいのは、**下のデータに書かれている金額だけ**です"),
    "都市の金額は formal data だけという指示が渡る",
  );
  assert(
    context.includes("国全体の参考値としてだけ"),
    "知識ベースの目安は国全体の参考値としてだけ使う指示が渡る",
  );
  assert(
    !context.includes("知識ベースに載っている費用の目安も併せて使ってかまいません"),
    "旧い許可（知識ベースの目安をそのまま使ってよい）が残っていない",
  );
}

console.log("Test 6: ゴールドコースト（§11 D）— formal data がそのまま渡る");
{
  const message = "ゴールドコーストの生活費は？";
  const city = cityContextFor(message);
  assert(city.cityKeys.join(",") === "goldcoast", "対象はゴールドコーストだけ");
  assert(city.usedFormal === true, "formal entry が渡る");
  const context = city.context ?? "";
  for (const label of ["住居費", "食費", "交通"]) {
    assert(context.includes(label), `formal の${label}が渡る`);
  }
  const providedLine = context.split("\n").find((l) => l.includes("ゴールドコーストについて確認済みなのは")) ?? "";
  for (const label of ["住居費", "食費", "交通"]) {
    assert(providedLine.includes(label), `確認済みの項目に${label}が含まれる`);
  }
  const prompt = finalPrompt(message);
  assert(!prompt.includes("約A$200〜400/週"), "legacy のゴールドコースト家賃行が渡らない");
  assert(!prompt.includes("州平均週収"), "legacy の州平均週収が渡らない");
}

console.log("Test 7: ブリスベン・ケアンズ・パース — 都市別金額なし / 国の目安だけ");
{
  for (const [message, cityKey] of [
    ["ブリスベンの生活費は？", "brisbane"],
    ["ケアンズの生活費は？", "cairns"],
    ["パースの生活費は？", "perth"],
  ] as const) {
    const city = cityContextFor(message);
    assert(city.cityKeys.join(",") === cityKey, `「${message}」→ ${cityKey} だけ`);
    assert(city.usedFormal === false, `${cityKey} の formal entry は無い`);
    const prompt = finalPrompt(message);
    for (const value of LEGACY_CITY_AMOUNTS) {
      assert(!prompt.includes(value), `「${message}」→ legacy の金額「${value}」が渡らない`);
    }
    const leaked = cityAmountLines(prompt);
    assert(leaked.length === 0, `「${message}」→ 「都市名 + 金額」の行が無い`);
    assert(
      prompt.includes("オーストラリア全体の一般的な目安であって、この都市の数値ではない"),
      `「${message}」→ 全国の目安であることを明示させる指示が渡る`,
    );
  }
}

console.log("Test 8: dev snapshot（§12）— production 相当では最終 prompt に入らない");
{
  assert(isDevCitySnapshotEnabled(PROD_ENV) === false, "production ではフラグが立っていても無効");
  assert(loadDevCitySnapshots(PROD_ENV).length === 0, "production では snapshot を読み込まない");
  // 指数の実値（開発用 snapshot にだけ存在する数値）が最終 prompt に無いこと
  const snapshots = loadDevCitySnapshots({ NODE_ENV: "development", CITY_REFERENCE_DEV_SNAPSHOT: "true" });
  assert(snapshots.length > 0, "開発環境では snapshot を読める（テストの前提）");
  const indexValues = new Set<string>();
  for (const s of snapshots) {
    for (const value of [
      s.safety?.safetyIndex,
      s.safety?.crimeIndex,
      s.safety?.safetyWalkingAloneDaylight,
      s.safety?.safetyWalkingAloneNight,
      s.cost?.costOfLivingIndex,
      s.cost?.rentIndex,
      s.cost?.groceriesIndex,
      s.cost?.restaurantPriceIndex,
    ]) {
      // 小数を持つ値だけを見る。整数（例: 71）は他の数値の一部に偶然一致するため、
      // 部分文字列の検査には使えない（指数は小数つきで保持されている）。
      if (typeof value === "number" && !Number.isInteger(value)) indexValues.add(String(value));
    }
  }
  assert(indexValues.size > 0, "snapshot の指数値を取得できた（テストの前提）");
  for (const message of [
    "メルボルンの生活費はいくら？",
    "ブリスベンの生活費は？",
    "ケアンズの生活費は？",
    "パースの生活費は？",
    "ワーホリの資金はいくら必要？",
  ]) {
    const prompt = finalPrompt(message);
    const found = [...indexValues].filter((v) => prompt.includes(v));
    assert(found.length === 0, `「${message}」→ Numbeo 指数値が渡らない（実際: ${found.slice(0, 3).join(",")}）`);
  }
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
