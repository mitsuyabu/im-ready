/**
 * 【運用者がローカルで実行するスクリプト】
 * data/cities/<country>/<city>.json（人間が出典を確認して書いた都市リファレンス）を検証し、
 * city_reference_data / city_reference_sources 用の**冪等な SQL** を生成する。
 *
 * 実行方法:
 *   npx tsx scripts/import-city-reference-data.ts            # 検証して SQL をファイルへ出力
 *   npx tsx scripts/import-city-reference-data.ts --stdout   # 標準出力へ
 *   npx tsx scripts/import-city-reference-data.ts --check     # 検証だけ（SQL を出さない）
 *
 * 設計理由:
 *   - **DB へ直接書き込まない**。base table には書き込み policy が無く anon key では書けない。
 *     このプロジェクトは service role key を使わない方針なので、SQL を生成し、内容を人間が
 *     確認してから Supabase へ適用する形にしている（アプリのコードに書き込み権限を持たせない）。
 *   - **自動取得をしない**（クローラー・スクレイピング・外部 API 連携を持たない）。入力は
 *     人間が確認して書いた JSON だけ。
 *   - 検証に通らない entry は SQL に出さない（出典の無い要約・未記入のテンプレート文が
 *     そのまま公開データになるのを防ぐ）。
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  CITY_ADMIN_AREA,
  CITY_KEYS,
  CITY_REFERENCE_CATEGORIES,
  SOURCE_TYPES,
  isCityReferenceCategory,
  isSourceType,
  type CityKey,
} from "../lib/cityReference";

const DATA_ROOT = resolve(__dirname, "../data/cities");
const OUT_DIR = resolve(__dirname, "../supabase/seed");
const OUT_FILE = join(OUT_DIR, "city_reference_data.generated.sql");

const args = new Set(process.argv.slice(2));
const toStdout = args.has("--stdout");
const checkOnly = args.has("--check");

/** テンプレートの未記入マーカー。これを含む文章は「未確認」として弾く。 */
const PLACEHOLDER = /[（(]例[:：]|（出典を確認|（この金額の出典|（内部メモ|（前提|（参照した範囲|（住居費について|（例:/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Problem = { file: string; message: string };
const problems: Problem[] = [];

function fail(file: string, message: string) {
  problems.push({ file, message });
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}

type ValidEstimate = {
  sourceName: string;
  label: string;
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
  basis: string | null;
};

type ValidSource = {
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  note: string | null;
};

type ValidEntry = {
  cityKey: CityKey;
  countryCode: string;
  adminArea: string | null;
  category: string;
  summary: string;
  notes: string | null;
  reviewedAt: string;
  reviewNote: string | null;
  estimates: ValidEstimate[];
  sources: ValidSource[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nullableNumber(value: unknown, file: string, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  fail(file, `${label} は数値または null にしてください`);
  return null;
}

function nullableDate(value: unknown, file: string, label: string): string | null {
  if (value === null || value === undefined) return null;
  const date = text(value);
  if (!date || !ISO_DATE.test(date)) {
    fail(file, `${label} は YYYY-MM-DD または null にしてください（不明な日付を作らない）`);
    return null;
  }
  return date;
}

function validateFile(file: string, raw: unknown): ValidEntry[] {
  if (!raw || typeof raw !== "object") {
    fail(file, "JSON のトップレベルがオブジェクトではありません");
    return [];
  }
  const doc = raw as Record<string, unknown>;

  const cityKey = text(doc.cityKey);
  if (!cityKey || !(CITY_KEYS as string[]).includes(cityKey)) {
    fail(file, `cityKey が対象都市ではありません（対象: ${CITY_KEYS.join(" / ")}）`);
    return [];
  }
  const countryCode = text(doc.countryCode) ?? "AU";
  const adminArea = text(doc.adminArea) ?? CITY_ADMIN_AREA[cityKey as CityKey] ?? null;

  if (!Array.isArray(doc.entries) || doc.entries.length === 0) {
    fail(file, "entries が空です");
    return [];
  }

  const valid: ValidEntry[] = [];
  const seenCategories = new Set<string>();

  for (const [index, rawEntry] of doc.entries.entries()) {
    const at = `entries[${index}]`;
    if (!rawEntry || typeof rawEntry !== "object") {
      fail(file, `${at} がオブジェクトではありません`);
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;

    if (!isCityReferenceCategory(entry.category)) {
      fail(file, `${at}.category が不正です（対象: ${CITY_REFERENCE_CATEGORIES.join(" / ")}）`);
      continue;
    }
    if (seenCategories.has(entry.category)) {
      fail(file, `${at}.category（${entry.category}）が重複しています（1都市1categoryにつき1件）`);
      continue;
    }

    const summary = text(entry.summary);
    if (!summary) {
      fail(file, `${at}.summary が空です`);
      continue;
    }
    if (PLACEHOLDER.test(summary)) {
      fail(file, `${at}.summary がテンプレートの未記入文のままです（出典を確認して書き換えてください）`);
      continue;
    }

    const reviewedAt = text(entry.reviewedAt);
    if (!reviewedAt || !ISO_DATE.test(reviewedAt)) {
      fail(file, `${at}.reviewedAt は確認した日（YYYY-MM-DD）が必須です`);
      continue;
    }

    // 出典が1件も無い要約は登録しない（出典の追跡がこのデータの前提）。
    const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
    const sources: ValidSource[] = [];
    for (const [sIndex, rawSource] of rawSources.entries()) {
      const sAt = `${at}.sources[${sIndex}]`;
      if (!rawSource || typeof rawSource !== "object") {
        fail(file, `${sAt} がオブジェクトではありません`);
        continue;
      }
      const source = rawSource as Record<string, unknown>;
      const sourceName = text(source.sourceName);
      const sourceUrl = text(source.sourceUrl);
      if (!sourceName || PLACEHOLDER.test(sourceName)) {
        fail(file, `${sAt}.sourceName が未記入です`);
        continue;
      }
      if (!sourceUrl || !/^https:\/\//i.test(sourceUrl) || sourceUrl.includes("example.gov.au")) {
        fail(file, `${sAt}.sourceUrl は実際の https URL にしてください`);
        continue;
      }
      if (!isSourceType(source.sourceType)) {
        fail(file, `${sAt}.sourceType が不正です（対象: ${SOURCE_TYPES.join(" / ")}）`);
        continue;
      }
      sources.push({
        sourceName,
        sourceUrl,
        sourceType: source.sourceType,
        sourcePublishedAt: nullableDate(source.sourcePublishedAt, file, `${sAt}.sourcePublishedAt`),
        sourceUpdatedAt: nullableDate(source.sourceUpdatedAt, file, `${sAt}.sourceUpdatedAt`),
        note: text(source.note) && !PLACEHOLDER.test(text(source.note)!) ? text(source.note) : null,
      });
    }
    if (sources.length === 0) {
      fail(file, `${at} に有効な出典がありません（出典の無い要約は登録しません）`);
      continue;
    }

    const sourceNames = new Set(sources.map((s) => s.sourceName));
    const rawEstimates = Array.isArray(entry.estimates) ? entry.estimates : [];
    const estimates: ValidEstimate[] = [];
    for (const [eIndex, rawEstimate] of rawEstimates.entries()) {
      const eAt = `${at}.estimates[${eIndex}]`;
      if (!rawEstimate || typeof rawEstimate !== "object") continue;
      const est = rawEstimate as Record<string, unknown>;
      const sourceName = text(est.sourceName);
      const label = text(est.label);
      if (!sourceName || !label || PLACEHOLDER.test(sourceName) || PLACEHOLDER.test(label)) {
        fail(file, `${eAt} の sourceName / label が未記入です`);
        continue;
      }
      // どの出典の数字なのかを辿れないものは入れない（平均せず出典ごとに持つ前提）。
      if (!sourceNames.has(sourceName)) {
        fail(file, `${eAt}.sourceName が sources のいずれとも一致しません`);
        continue;
      }
      const min = nullableNumber(est.min, file, `${eAt}.min`);
      const max = nullableNumber(est.max, file, `${eAt}.max`);
      if (min === null && max === null) {
        fail(file, `${eAt} は min / max のどちらかが必要です（金額が無いなら estimates に入れない）`);
        continue;
      }
      const basis = text(est.basis);
      estimates.push({
        sourceName,
        label,
        min,
        max,
        currency: text(est.currency),
        period: text(est.period),
        basis: basis && !PLACEHOLDER.test(basis) ? basis : null,
      });
    }

    const notes = text(entry.notes);
    const reviewNote = text(entry.reviewNote);
    seenCategories.add(entry.category);
    valid.push({
      cityKey: cityKey as CityKey,
      countryCode,
      adminArea,
      category: entry.category,
      summary,
      notes: notes && !PLACEHOLDER.test(notes) ? notes : null,
      reviewedAt,
      reviewNote: reviewNote && !PLACEHOLDER.test(reviewNote) ? reviewNote : null,
      estimates,
      sources,
    });
  }

  return valid;
}

/**
 * 1 entry ぶんの SQL。unique(city_key, category) に対する upsert で冪等にし、
 * 出典はその entry のぶんを一度消してから入れ直す（出典の増減を正しく反映するため）。
 */
function buildSql(entry: ValidEntry): string {
  const details = entry.estimates.length > 0 ? JSON.stringify({ estimates: entry.estimates }) : "{}";
  const sourceRows = entry.sources
    .map(
      (s) =>
        `      (${sqlString(s.sourceName)}, ${sqlString(s.sourceUrl)}, ${sqlString(s.sourceType)}, ${sqlNullableString(s.sourcePublishedAt)}::date, ${sqlNullableString(s.sourceUpdatedAt)}::date, ${sqlNullableString(s.note)})`,
    )
    .join(",\n");

  return `-- ${entry.cityKey} / ${entry.category}（確認日: ${entry.reviewedAt}）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    ${sqlString(entry.cityKey)}, ${sqlString(entry.countryCode)}, ${sqlNullableString(entry.adminArea)},
    ${sqlString(entry.category)}, ${sqlString(entry.summary)}, ${sqlNullableString(entry.notes)},
    ${sqlString(details)}::jsonb, ${sqlString(entry.reviewedAt)}::date, ${sqlNullableString(entry.reviewNote)}, now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
${sourceRows}
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);`;
}

function main() {
  if (!existsSync(DATA_ROOT)) {
    console.error(`データディレクトリがありません: ${DATA_ROOT}`);
    process.exit(1);
  }

  const files: string[] = [];
  for (const country of readdirSync(DATA_ROOT, { withFileTypes: true })) {
    if (!country.isDirectory()) continue;
    const dir = join(DATA_ROOT, country.name);
    for (const file of readdirSync(dir)) {
      // 先頭が _ のファイル（テンプレート等）は取り込み対象外。
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      files.push(join(dir, file));
    }
  }

  if (files.length === 0) {
    console.log("取り込み対象の都市ファイルがありません（data/cities/<country>/<city>.json）。");
    console.log("テンプレート: data/cities/australia/_template.json をコピーし、出典を確認して記入してください。");
    console.log("出典を確認していない都市は、空のまま（データ未登録）で構いません。");
    return;
  }

  const entries: ValidEntry[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      fail(file, `JSON として読めません: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const valid = validateFile(file, parsed);
    entries.push(...valid);
    console.log(`  ${valid.length > 0 ? "OK  " : "SKIP"} ${file}（有効な entry: ${valid.length}件）`);
  }

  if (problems.length > 0) {
    console.error("\n検証で問題が見つかりました（該当 entry は SQL に含めません）:");
    for (const problem of problems) {
      console.error(`  - ${problem.file}: ${problem.message}`);
    }
  }

  if (entries.length === 0) {
    console.error("\n有効な entry が無いため、SQL は出力しません。");
    process.exit(problems.length > 0 ? 1 : 0);
  }

  if (checkOnly) {
    console.log(`\n--check のため SQL は出力しません（有効な entry: ${entries.length}件）。`);
    return;
  }

  const header = [
    "-- city_reference_data / city_reference_sources の登録用 SQL",
    "-- scripts/import-city-reference-data.ts が data/cities/ の JSON から生成",
    `-- 生成: ${new Date().toISOString()}`,
    `-- entry 数: ${entries.length}`,
    "-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。",
    "",
  ].join("\n");

  const sql = `${header}\n${entries.map(buildSql).join("\n\n")}\n`;

  if (toStdout) {
    console.log(`\n${sql}`);
  } else {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, sql, "utf8");
    console.log(`\n${entries.length}件ぶんの SQL を書き出しました: ${OUT_FILE}`);
  }
}

main();
