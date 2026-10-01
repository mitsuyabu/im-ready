/**
 * 【開発・検証専用】data/dev/numbeo/australia.json（人間が手入力した snapshot）から、
 * **開発用 DB にだけ**入れる SQL を生成する。
 *
 * 実行方法:
 *   npx tsx scripts/generate-dev-city-snapshot-sql.ts            # SQL をファイルへ出力
 *   npx tsx scripts/generate-dev-city-snapshot-sql.ts --stdout   # 標準出力へ
 *   npx tsx scripts/generate-dev-city-snapshot-sql.ts --check     # 検証だけ
 *
 * 設計:
 *   - **migration にはしない**。schema の履歴と、開発用の外部データ内容を分けるため
 *     （公的情報は reviewed seed、これは dev 専用 seed）。production の migration 履歴に混ぜない。
 *   - table は public ではなく **dev_snapshot スキーマ**に作る。Supabase / PostgREST は
 *     公開対象スキーマ（既定では public）しか API へ出さないため、このスキーマの table は
 *     REST API から到達できない。加えて anon / authenticated の権限も明示的に落とす。
 *   - アプリ側はこの table を読まない（lib/devCitySnapshot.ts はファイルを読む）。
 *     この SQL は、別サービスと同じように dev DB で中身を確認・クエリしたい場合のためのもの。
 *   - 取得コードは無い（fetch / scraping / crawling / browser automation を一切持たない）。
 *   - 数値が1つも入っていない都市は出力しない（空の行を作らない）。
 *   - remote / production DB へは適用しない。生成した SQL は人間が目視確認してから
 *     開発用 DB にだけ流す。
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  DEV_SNAPSHOT_FILE,
  DEV_SNAPSHOT_SOURCE,
  missingDevSnapshotSourceUrls,
  parseDevCitySnapshotFile,
  type DevCitySnapshot,
} from "../lib/devCitySnapshot";

const OUT_DIR = resolve(__dirname, "../supabase/seed");
const OUT_FILE = join(OUT_DIR, "dev_city_snapshot.generated.sql");

const args = new Set(process.argv.slice(2));
const toStdout = args.has("--stdout");
const checkOnly = args.has("--check");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}

function sqlNumber(value: number | null): string {
  return value === null ? "null" : String(value);
}

/** dev 専用スキーマと table。public に作らないことが公開されないための一番の担保。 */
const SCHEMA_SQL = `-- 開発・検証専用のスキーマ。public に置かないため PostgREST の API からは到達できない。
create schema if not exists dev_snapshot;

-- anon / authenticated にはスキーマの使用権限すら与えない（default privileges の影響も受けない）。
revoke all on schema dev_snapshot from anon, authenticated;

create table if not exists dev_snapshot.city_index_snapshot (
  city_key text primary key,
  -- 出典（現時点では numbeo のみ）。production の正式データとは別物であることを明示する。
  source text not null,
  -- 人間が参照したページの URL（用途別）と、目で確認した日。自動取得はしない。
  source_url_safety text,
  source_url_cost_of_living text,
  captured_at date,
  -- 治安（利用者アンケートに基づく指数。公的犯罪統計ではない）
  safety_index numeric,
  crime_index numeric,
  safety_walking_alone_daylight numeric,
  safety_walking_alone_night numeric,
  -- 生活費（指数）
  cost_of_living_index numeric,
  rent_index numeric,
  groceries_index numeric,
  restaurant_price_index numeric,
  inserted_at timestamptz not null default now()
);

comment on table dev_snapshot.city_index_snapshot is
  '開発・検証専用。人間が外部サイトで一度だけ確認して手入力した指数。production では使用しない。公開 view を作らないこと。';

revoke all on table dev_snapshot.city_index_snapshot from anon, authenticated;

-- 以前の版（1都市1URL）で作成済みの dev DB でも列が揃うようにしておく。
alter table dev_snapshot.city_index_snapshot add column if not exists source_url_safety text;
alter table dev_snapshot.city_index_snapshot add column if not exists source_url_cost_of_living text;`;

function buildUpsert(snapshot: DevCitySnapshot): string {
  return `insert into dev_snapshot.city_index_snapshot (
  city_key, source, source_url_safety, source_url_cost_of_living, captured_at,
  safety_index, crime_index, safety_walking_alone_daylight, safety_walking_alone_night,
  cost_of_living_index, rent_index, groceries_index, restaurant_price_index, inserted_at
) values (
  ${sqlString(snapshot.cityKey)}, ${sqlString(DEV_SNAPSHOT_SOURCE)}, ${sqlNullableString(snapshot.sourceUrls.safety)}, ${sqlNullableString(snapshot.sourceUrls.costOfLiving)}, ${snapshot.capturedAt && ISO_DATE.test(snapshot.capturedAt) ? `${sqlString(snapshot.capturedAt)}::date` : "null"},
  ${sqlNumber(snapshot.safety.safetyIndex)}, ${sqlNumber(snapshot.safety.crimeIndex)}, ${sqlNumber(snapshot.safety.safetyWalkingAloneDaylight)}, ${sqlNumber(snapshot.safety.safetyWalkingAloneNight)},
  ${sqlNumber(snapshot.cost.costOfLivingIndex)}, ${sqlNumber(snapshot.cost.rentIndex)}, ${sqlNumber(snapshot.cost.groceriesIndex)}, ${sqlNumber(snapshot.cost.restaurantPriceIndex)}, now()
)
on conflict (city_key) do update set
  source = excluded.source,
  source_url_safety = excluded.source_url_safety,
  source_url_cost_of_living = excluded.source_url_cost_of_living,
  captured_at = excluded.captured_at,
  safety_index = excluded.safety_index,
  crime_index = excluded.crime_index,
  safety_walking_alone_daylight = excluded.safety_walking_alone_daylight,
  safety_walking_alone_night = excluded.safety_walking_alone_night,
  cost_of_living_index = excluded.cost_of_living_index,
  rent_index = excluded.rent_index,
  groceries_index = excluded.groceries_index,
  restaurant_price_index = excluded.restaurant_price_index,
  inserted_at = now();`;
}

function main() {
  const path = resolve(process.cwd(), DEV_SNAPSHOT_FILE);
  if (!existsSync(path)) {
    console.error(`テンプレートがありません: ${DEV_SNAPSHOT_FILE}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`JSON として読めません: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const snapshots = parseDevCitySnapshotFile(parsed);

  // メタデータの欠落は警告（数値自体は使えるが、出典を辿れない状態は望ましくない）。
  // 数値が入っている区分には、その区分の出典ページを要求する。
  const URL_LABEL = { safety: "sourceUrls.safety（治安のページ）", costOfLiving: "sourceUrls.costOfLiving（生活費のページ）" };
  let warnings = 0;
  for (const snapshot of snapshots) {
    for (const key of missingDevSnapshotSourceUrls(snapshot)) {
      warnings += 1;
      console.warn(
        `  警告 ${snapshot.cityKey}: ${URL_LABEL[key]} が未記入です（その区分の数値が入っているため、参照したページを記録してください）`,
      );
    }
    if (!snapshot.capturedAt || !ISO_DATE.test(snapshot.capturedAt)) {
      warnings += 1;
      console.warn(`  警告 ${snapshot.cityKey}: capturedAt が未記入か形式が不正です（YYYY-MM-DD）`);
    }
  }

  if (snapshots.length === 0) {
    console.log("数値が入力されている都市がありません。");
    console.log(`人間が ${DEV_SNAPSHOT_FILE} に手入力してから、もう一度実行してください。`);
    console.log("（このスクリプトは外部サイトへアクセスしません）");
    return;
  }

  console.log(`数値が入力されている都市: ${snapshots.map((s) => s.cityKey).join(", ")}`);

  if (warnings > 0) {
    console.warn(`\n出典メタデータの警告が ${warnings} 件あります（SQL 自体は生成できます）。`);
  }

  if (checkOnly) {
    console.log(`--check のため SQL は出力しません（${snapshots.length}都市）。`);
    return;
  }

  const header = [
    "-- 【開発・検証専用】外部サイトで人間が手入力した指数の snapshot",
    "-- scripts/generate-dev-city-snapshot-sql.ts が data/dev/numbeo/australia.json から生成",
    `-- 生成: ${new Date().toISOString()}`,
    `-- 都市数: ${snapshots.length}`,
    "--",
    "-- production / remote の DB へは適用しないこと。開発用 DB にだけ流す。",
    "-- production 公開時は、外部サイトの利用条件・ライセンスを改めて確認すること。",
    "-- 公開 view を作らないこと（public スキーマへ移さないこと）。",
    "",
  ].join("\n");

  const sql = `${header}\n${SCHEMA_SQL}\n\n${snapshots.map(buildUpsert).join("\n\n")}\n`;

  if (toStdout) {
    console.log(`\n${sql}`);
  } else {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, sql, "utf8");
    console.log(`\n${snapshots.length}都市ぶんの SQL を書き出しました: ${OUT_FILE}`);
    console.log("内容を目視確認してから、開発用 DB にだけ適用してください。");
  }
}

main();
