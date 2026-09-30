/**
 * 【運用者がローカル / 定期ジョブで実行するスクリプト】
 * 対象6都市の治安・生活費データを Numbeo 公式 API から取得し、city_living_data 用の
 * **冪等な upsert SQL** を出力する。
 *
 * 実行方法:
 *   NUMBEO_API_KEY=xxx npx tsx scripts/sync-city-living-data.ts            # SQL をファイルへ出力
 *   NUMBEO_API_KEY=xxx npx tsx scripts/sync-city-living-data.ts --stdout   # 標準出力へ
 *   npx tsx scripts/sync-city-living-data.ts --check                       # 設定と対象都市の確認だけ
 *
 * 設計理由:
 *   - **DB へ直接書き込まない**。city_living_data には書き込み policy が無く、anon key では
 *     書けない。このプロジェクトは service role key を使わない方針（lib/supabase/server.ts）の
 *     ため、その方針を崩さずに済む「SQL を出力し、運用者が Supabase の SQL エディタ /
 *     migration として適用する」形にしている。自動化する場合も、この SQL を適用する権限は
 *     アプリのコードには持たせない。
 *   - NUMBEO_API_KEY が無ければ **何も出力せず終了**する。Numbeo のデータは Data License
 *     契約者のみ商用利用できるため、契約前に numbeo 由来の値を作ってはいけない（README 参照）。
 *   - 取得に失敗した都市はスキップし、その都市の SQL を出さない。既存データを消したり、
 *     部分的な値で上書きしたりしない（既に入っている有効なデータを保つ）。
 *   - スクレイピングは一切しない（公式 API のみ）。
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CITY_KEYS,
  CITY_LABELS,
  CITY_QUERY,
  hasAnyCityLivingValue,
  normalizeNumbeoCity,
  type CityLivingRow,
} from "../lib/cityLiving";
import { fetchNumbeoCity, isNumbeoConfigured } from "../lib/numbeoClient";

const OUT_FILE = resolve(__dirname, "../supabase/seed/city_living_data.generated.sql");

const args = new Set(process.argv.slice(2));
const toStdout = args.has("--stdout");
const checkOnly = args.has("--check");

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null): string {
  return value === null ? "null" : String(value);
}

function sqlJson(value: unknown): string {
  // 生成した JSON は自前の構造（数値と自前ラベルのみ）。念のためシングルクオートはエスケープする。
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

/** 1都市ぶんの upsert。unique(city_key, source) に対する on conflict で冪等にする。 */
function buildUpsert(row: CityLivingRow, raw: unknown): string {
  return `insert into city_living_data (
  city_key, country_code, source,
  safety_index, crime_index, safe_alone_daylight, safe_alone_night,
  worried_mugged_robbed, worried_home_broken,
  cost_index, cost_and_rent_index, rent_index, groceries_index, restaurant_price_index,
  prices, currency, contributors, crime_contributors,
  source_updated_at, fetched_at, raw, updated_at
) values (
  ${sqlString(row.cityKey)}, ${sqlString(row.countryCode)}, ${sqlString(row.source)},
  ${sqlNumber(row.safety.safetyIndex)}, ${sqlNumber(row.safety.crimeIndex)}, ${sqlNumber(row.safety.safeAloneDaylight)}, ${sqlNumber(row.safety.safeAloneNight)},
  ${sqlNumber(row.safety.worriedMuggedRobbed)}, ${sqlNumber(row.safety.worriedHomeBroken)},
  ${sqlNumber(row.cost.costIndex)}, ${sqlNumber(row.cost.costAndRentIndex)}, ${sqlNumber(row.cost.rentIndex)}, ${sqlNumber(row.cost.groceriesIndex)}, ${sqlNumber(row.cost.restaurantPriceIndex)},
  ${sqlJson(row.prices)}, ${row.currency ? sqlString(row.currency) : "null"}, ${sqlNumber(row.contributors)}, ${sqlNumber(row.crimeContributors)},
  ${row.sourceUpdatedAt ? sqlString(row.sourceUpdatedAt) : "null"}, ${sqlString(row.fetchedAt)}, ${sqlJson(raw)}, now()
)
on conflict (city_key, source) do update set
  country_code = excluded.country_code,
  safety_index = excluded.safety_index,
  crime_index = excluded.crime_index,
  safe_alone_daylight = excluded.safe_alone_daylight,
  safe_alone_night = excluded.safe_alone_night,
  worried_mugged_robbed = excluded.worried_mugged_robbed,
  worried_home_broken = excluded.worried_home_broken,
  cost_index = excluded.cost_index,
  cost_and_rent_index = excluded.cost_and_rent_index,
  rent_index = excluded.rent_index,
  groceries_index = excluded.groceries_index,
  restaurant_price_index = excluded.restaurant_price_index,
  prices = excluded.prices,
  currency = excluded.currency,
  contributors = excluded.contributors,
  crime_contributors = excluded.crime_contributors,
  source_updated_at = excluded.source_updated_at,
  fetched_at = excluded.fetched_at,
  raw = excluded.raw,
  updated_at = now();`;
}

async function main() {
  console.log(`対象都市: ${CITY_KEYS.map((k) => CITY_LABELS[k]).join("・")}`);

  if (!isNumbeoConfigured()) {
    console.error(
      [
        "",
        "NUMBEO_API_KEY が設定されていないため、取得を行いません。",
        "Numbeo のデータは Data License 契約の範囲内でのみ利用できます（README の",
        "「データソースに関する制約」を参照）。契約後に API key を環境変数へ設定してから",
        "再実行してください。",
      ].join("\n"),
    );
    // 未設定は「異常」ではなく想定内の状態なので、--check のときは 0 で終える。
    process.exit(checkOnly ? 0 : 1);
  }

  if (checkOnly) {
    console.log("NUMBEO_API_KEY は設定済みです。--check のため取得は行いません。");
    return;
  }

  const statements: string[] = [];
  const failed: string[] = [];

  for (const cityKey of CITY_KEYS) {
    const label = CITY_LABELS[cityKey];
    try {
      const fetched = await fetchNumbeoCity(CITY_QUERY[cityKey]);
      const row = normalizeNumbeoCity({
        cityKey,
        crime: fetched.crime,
        indices: fetched.indices,
        prices: fetched.prices,
        fetchedAt: new Date().toISOString(),
      });
      if (!hasAnyCityLivingValue(row)) {
        // 値が1つも取れなかった場合も「失敗」として扱い、既存行を空で上書きしない。
        failed.push(`${label}: 使える値が取得できませんでした`);
        continue;
      }
      statements.push(buildUpsert(row, fetched));
      console.log(`  OK   ${label}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push(`${label}: ${message}`);
      console.error(`  SKIP ${label}（${message}）`);
    }
  }

  if (statements.length === 0) {
    console.error("\nすべての都市で取得できなかったため、SQL は出力しません（既存データはそのまま）。");
    process.exit(1);
  }

  const header = [
    "-- city_living_data の同期用 SQL（scripts/sync-city-living-data.ts が生成）",
    `-- 生成: ${new Date().toISOString()}`,
    `-- 対象: ${statements.length}都市 / 全${CITY_KEYS.length}都市`,
    failed.length > 0 ? `-- 取得できなかった都市（既存データは変更しない）: ${failed.join(" / ")}` : "",
    "-- 適用方法: Supabase の SQL エディタで実行するか、migration として取り込む。",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const sql = `${header}\n${statements.join("\n\n")}\n`;

  if (toStdout) {
    console.log(`\n${sql}`);
  } else {
    writeFileSync(OUT_FILE, sql, "utf8");
    console.log(`\n${statements.length}都市ぶんの SQL を書き出しました: ${OUT_FILE}`);
  }
  if (failed.length > 0) {
    console.error(`\n取得できなかった都市: ${failed.length}件（既存データは維持されます）`);
  }
}

void main();
