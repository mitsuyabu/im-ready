/**
 * 【運用者がローカルで実行するスクリプト】
 * data/visas/<country>/<visa>.json（人間が公式情報を確認して書いたビザ情報）を検証し、
 * visa_reference_data / visa_reference_sources 用の**冪等な SQL** を生成する。
 *
 * 実行方法:
 *   npx tsx scripts/import-visa-reference-data.ts            # 検証して SQL をファイルへ出力
 *   npx tsx scripts/import-visa-reference-data.ts --stdout   # 標準出力へ
 *   npx tsx scripts/import-visa-reference-data.ts --check     # 検証だけ（SQL を出さない）
 *
 * 設計:
 *   - **DB へ直接書き込まない**。base table には書き込み policy が無く anon key では書けない。
 *     service role key を使わない方針のため、SQL を生成し、人間が確認してから適用する。
 *   - **自動取得をしない**（クローラー・スクレイピング・外部 API 連携を持たない）。
 *     Home Affairs は自動アクセスを拒否するため、回避策も作らない。入力は人間が書いた JSON だけ。
 *   - 検証に通らない entry は SQL に出さない（未確認の内容がそのまま公開データになるのを防ぐ）。
 *   - 対象 entry 以外を DELETE しない（upsert のみ。出典だけはその entry 分を入れ替える）。
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  VISA_CATEGORIES,
  VISA_KEYS,
  VISA_META,
  VISA_SOURCE_TYPES,
  isVisaCategory,
  isVisaKey,
  isVisaSourceType,
} from "../lib/visaReference";

const DATA_ROOT = resolve(__dirname, "../data/visas");
const OUT_DIR = resolve(__dirname, "../supabase/seed");
const OUT_FILE = join(OUT_DIR, "visa_reference_data.generated.sql");

const args = new Set(process.argv.slice(2));
const toStdout = args.has("--stdout");
const checkOnly = args.has("--check");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** テンプレートの未記入マーカー。これを含む文章は「未確認」として弾く。 */
const PLACEHOLDER = /[（(]例[:：]|（公式ページで確認|（内部メモ|（参照した箇所|（この金額|（出典を確認/;

/** 置き換えを忘れたテンプレート URL。 */
const PLACEHOLDER_URL = /example\.(gov\.au|com|invalid)/i;

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

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

type ValidSource = {
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  accessedAt: string | null;
  notes: string | null;
};

type ValidEntry = {
  visaKey: string;
  visaCode: string;
  visaName: string;
  countryCode: string;
  category: string;
  summary: string;
  details: Record<string, unknown>;
  reviewedAt: string;
  reviewNote: string | null;
  sources: ValidSource[];
};

function nullableDate(value: unknown, file: string, label: string): string | null {
  if (value === null || value === undefined) return null;
  const date = text(value);
  if (!date || !ISO_DATE.test(date)) {
    fail(file, `${label} は YYYY-MM-DD または null にしてください（不明な日付を作らない）`);
    return null;
  }
  return date;
}

/**
 * details の構造検証。数値には必ず単位・通貨を要求する
 * （単位の無い数値は Chat が意味を誤解するため登録しない）。
 */
function validateDetails(details: Record<string, unknown>, file: string, at: string): boolean {
  let ok = true;

  // 就労時間: limit があるなら unit が必須
  if (details.limit !== null && details.limit !== undefined) {
    if (typeof details.limit !== "number" || !Number.isFinite(details.limit)) {
      fail(file, `${at}.details.limit は数値または null にしてください`);
      ok = false;
    } else if (!text(details.unit)) {
      fail(file, `${at}.details.limit があるなら unit（例: hours_per_fortnight）が必須です`);
      ok = false;
    }
  }

  // 金額: amount があるなら currency が必須
  if (details.amount !== null && details.amount !== undefined) {
    if (typeof details.amount !== "number" || !Number.isFinite(details.amount)) {
      fail(file, `${at}.details.amount は数値または null にしてください`);
      ok = false;
    } else {
      const currency = text(details.currency);
      if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        fail(file, `${at}.details.amount があるなら currency（例: AUD）が必須です`);
        ok = false;
      }
      if (details.per !== undefined && details.per !== null && !text(details.per)) {
        fail(file, `${at}.details.per は文字列または null にしてください`);
        ok = false;
      }
    }
  }

  // 期間: duration があるなら durationUnit が必須
  if (details.duration !== null && details.duration !== undefined) {
    if (typeof details.duration !== "number" || !Number.isFinite(details.duration)) {
      fail(file, `${at}.details.duration は数値または null にしてください`);
      ok = false;
    } else if (!text(details.durationUnit)) {
      fail(file, `${at}.details.duration があるなら durationUnit（例: years_max）が必須です`);
      ok = false;
    }
  }

  // 0 で埋めていないか（unknown を 0 にするのは禁止）
  for (const key of ["limit", "amount", "duration"]) {
    if (details[key] === 0) {
      fail(file, `${at}.details.${key} が 0 です。未確認なら null にしてください（0 で埋めない）`);
      ok = false;
    }
  }

  // 日付形式
  for (const key of ["effectiveFrom"]) {
    const value = details[key];
    if (value === undefined || value === null) continue;
    const date = text(value);
    if (!date || !ISO_DATE.test(date)) {
      fail(file, `${at}.details.${key} は YYYY-MM-DD にしてください`);
      ok = false;
    }
  }

  // exceptions の形
  if (details.exceptions !== undefined && details.exceptions !== null) {
    if (!Array.isArray(details.exceptions)) {
      fail(file, `${at}.details.exceptions は配列にしてください`);
      ok = false;
    } else {
      for (const [i, raw] of details.exceptions.entries()) {
        if (!raw || typeof raw !== "object") {
          fail(file, `${at}.details.exceptions[${i}] がオブジェクトではありません`);
          ok = false;
          continue;
        }
        const e = raw as Record<string, unknown>;
        if (!text(e.appliesTo) || !text(e.note)) {
          fail(file, `${at}.details.exceptions[${i}] は appliesTo と note が必要です`);
          ok = false;
        }
      }
    }
  }

  return ok;
}

function validateFile(file: string, raw: unknown): ValidEntry[] {
  if (!raw || typeof raw !== "object") {
    fail(file, "JSON のトップレベルがオブジェクトではありません");
    return [];
  }
  const doc = raw as Record<string, unknown>;

  const visaKey = text(doc.visaKey);
  if (!visaKey || !isVisaKey(visaKey)) {
    fail(file, `visaKey が対象外です（対象: ${VISA_KEYS.join(" / ")}）`);
    return [];
  }
  const meta = VISA_META[visaKey];
  const visaCode = text(doc.visaCode) ?? meta.code;
  const visaName = text(doc.visaName) ?? meta.name;
  const countryCode = text(doc.countryCode) ?? "AU";

  // サブクラスの食い違いを防ぐ（417 と 462 の混同対策）
  if (visaCode !== meta.code) {
    fail(file, `visaCode（${visaCode}）が visaKey（${visaKey} = ${meta.code}）と一致しません`);
    return [];
  }

  if (!Array.isArray(doc.entries)) {
    fail(file, "entries が配列ではありません");
    return [];
  }
  if (doc.entries.length === 0) {
    // 空は正常（未確認のビザは登録しない）。
    return [];
  }

  const valid: ValidEntry[] = [];
  const seen = new Set<string>();

  for (const [index, rawEntry] of doc.entries.entries()) {
    const at = `entries[${index}]`;
    if (!rawEntry || typeof rawEntry !== "object") {
      fail(file, `${at} がオブジェクトではありません`);
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;

    if (!isVisaCategory(entry.category)) {
      fail(file, `${at}.category が不正です（対象: ${VISA_CATEGORIES.join(" / ")}）`);
      continue;
    }
    if (seen.has(entry.category)) {
      fail(file, `${at}.category（${entry.category}）が重複しています（1ビザ1categoryにつき1件）`);
      continue;
    }

    const summary = text(entry.summary);
    if (!summary) {
      fail(file, `${at}.summary が空です`);
      continue;
    }
    if (PLACEHOLDER.test(summary)) {
      fail(file, `${at}.summary がテンプレートの未記入文のままです（公式情報を確認して書き換えてください）`);
      continue;
    }

    const reviewedAt = text(entry.reviewedAt);
    if (!reviewedAt || !ISO_DATE.test(reviewedAt)) {
      fail(file, `${at}.reviewedAt は確認した日（YYYY-MM-DD）が必須です`);
      continue;
    }

    const details =
      entry.details && typeof entry.details === "object" && !Array.isArray(entry.details)
        ? (entry.details as Record<string, unknown>)
        : {};
    if (!validateDetails(details, file, at)) continue;

    // 出典が1件も無い要約は登録しない
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
      if (!sourceUrl || !/^https:\/\//i.test(sourceUrl) || PLACEHOLDER_URL.test(sourceUrl)) {
        fail(file, `${sAt}.sourceUrl は実際の https URL にしてください`);
        continue;
      }
      if (!isVisaSourceType(source.sourceType)) {
        fail(file, `${sAt}.sourceType が不正です（対象: ${VISA_SOURCE_TYPES.join(" / ")}）`);
        continue;
      }
      const notes = text(source.notes);
      sources.push({
        sourceName,
        sourceUrl,
        sourceType: source.sourceType,
        sourcePublishedAt: nullableDate(source.sourcePublishedAt, file, `${sAt}.sourcePublishedAt`),
        sourceUpdatedAt: nullableDate(source.sourceUpdatedAt, file, `${sAt}.sourceUpdatedAt`),
        accessedAt: nullableDate(source.accessedAt, file, `${sAt}.accessedAt`),
        notes: notes && !PLACEHOLDER.test(notes) ? notes : null,
      });
    }
    if (sources.length === 0) {
      fail(file, `${at} に有効な出典がありません（出典の無い内容は登録しません）`);
      continue;
    }

    const reviewNote = text(entry.reviewNote);
    seen.add(entry.category);
    valid.push({
      visaKey,
      visaCode,
      visaName,
      countryCode,
      category: entry.category,
      summary,
      details,
      reviewedAt,
      reviewNote: reviewNote && !PLACEHOLDER.test(reviewNote) ? reviewNote : null,
      sources,
    });
  }

  return valid;
}

/** 1 entry ぶんの SQL。unique(visa_key, category) に対する upsert で冪等にする。 */
function buildSql(entry: ValidEntry): string {
  const sourceRows = entry.sources
    .map(
      (s) =>
        `      (${sqlString(s.sourceName)}, ${sqlString(s.sourceUrl)}, ${sqlString(s.sourceType)}, ${sqlNullableString(s.sourcePublishedAt)}::date, ${sqlNullableString(s.sourceUpdatedAt)}::date, ${sqlNullableString(s.accessedAt)}::date, ${sqlNullableString(s.notes)})`,
    )
    .join(",\n");

  return `-- ${entry.visaKey} / ${entry.category}（確認日: ${entry.reviewedAt}）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    ${sqlString(entry.visaKey)}, ${sqlString(entry.visaCode)}, ${sqlString(entry.visaName)}, ${sqlString(entry.countryCode)},
    ${sqlString(entry.category)}, ${sqlString(entry.summary)}, ${sqlString(JSON.stringify(entry.details))}::jsonb,
    ${sqlString(entry.reviewedAt)}::date, ${sqlNullableString(entry.reviewNote)}, now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
${sourceRows}
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);`;
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
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      files.push(join(dir, file));
    }
  }

  if (files.length === 0) {
    console.log("取り込み対象のビザファイルがありません（data/visas/<country>/<visa>.json）。");
    console.log("テンプレート: data/visas/australia/_template.json をコピーして記入してください。");
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
    console.log(`  ${valid.length > 0 ? "OK  " : "---"} ${file}（有効な entry: ${valid.length}件）`);
  }

  if (problems.length > 0) {
    console.error("\n検証で問題が見つかりました（該当 entry は SQL に含めません）:");
    for (const problem of problems) {
      console.error(`  - ${problem.file}: ${problem.message}`);
    }
  }

  if (entries.length === 0) {
    console.log("\n有効な entry が無いため、SQL は出力しません。");
    console.log("公式情報を確認できていないビザは、未登録のままで構いません（Chat は数値を推測しません）。");
    process.exit(problems.length > 0 ? 1 : 0);
  }

  if (checkOnly) {
    console.log(`\n--check のため SQL は出力しません（有効な entry: ${entries.length}件）。`);
    return;
  }

  const byVisa = new Map<string, number>();
  for (const entry of entries) byVisa.set(entry.visaKey, (byVisa.get(entry.visaKey) ?? 0) + 1);

  const header = [
    "-- visa_reference_data / visa_reference_sources の登録用 SQL",
    "-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成",
    `-- 生成: ${new Date().toISOString()}`,
    `-- entry 数: ${entries.length}（${[...byVisa.entries()].map(([k, n]) => `${k}: ${n}`).join(" / ")}）`,
    "-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。",
    "-- 対象 entry 以外は変更しない（upsert のみ。DELETE は対象 entry の出典の入れ替えだけ）。",
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
