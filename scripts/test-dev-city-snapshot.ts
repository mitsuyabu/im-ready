/**
 * 開発・検証専用 snapshot（外部サイトで人間が手入力した指数）の確認スクリプト。
 *
 *   npx tsx scripts/test-dev-city-snapshot.ts
 *
 * 仕様の Test 1〜10 に対応。ネットワークへは接続しない。
 * ここで使う数値は **テスト用の架空の値**であり、実際に外部サイトで確認した値ではない。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  DEV_SNAPSHOT_FILE,
  DEV_SNAPSHOT_SOURCE,
  buildDevCitySnapshotContext,
  hasAnyDevSnapshotValue,
  isDevCitySnapshotEnabled,
  missingDevSnapshotSourceUrls,
  loadDevCitySnapshots,
  parseDevCitySnapshotFile,
  type DevCitySnapshot,
} from "@/lib/devCitySnapshot";
import {
  buildCityReferenceContext,
  buildCityReferenceNoDataContext,
} from "@/lib/cityReferenceContext";
import { CITY_ADMIN_AREA, type CityKey, type CityReferenceEntry } from "@/lib/cityReference";

let pass = 0;
let fail = 0;

/**
 * コメントを除いたコード部分だけを返す。禁止事項を説明したコメント自身に
 * 検出パターンが当たって誤検出になるのを防ぐため。
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

const PROD = { NODE_ENV: "production", CITY_REFERENCE_DEV_SNAPSHOT: "true" };
const DEV_ON = { NODE_ENV: "development", CITY_REFERENCE_DEV_SNAPSHOT: "true" };
const DEV_OFF = { NODE_ENV: "development", CITY_REFERENCE_DEV_SNAPSHOT: "false" };
const DEV_UNSET = { NODE_ENV: "development" };

/** テスト用の架空 snapshot（実際に確認した値ではない）。 */
function snapshot(cityKey: CityKey, overrides: Partial<DevCitySnapshot> = {}): DevCitySnapshot {
  return {
    cityKey,
    sourceUrls: {
      safety: "https://example.invalid/placeholder-safety",
      costOfLiving: "https://example.invalid/placeholder-cost",
    },
    capturedAt: "2026-09-30",
    safety: {
      safetyIndex: 55,
      crimeIndex: 45,
      safetyWalkingAloneDaylight: 78,
      safetyWalkingAloneNight: 48,
    },
    cost: {
      costOfLivingIndex: 75,
      rentIndex: 42,
      groceriesIndex: 70,
      restaurantPriceIndex: 65,
    },
    ...overrides,
  };
}

/** テスト用の架空の公的情報 entry。 */
function publicEntry(cityKey: CityKey): CityReferenceEntry {
  return {
    id: `${cityKey}-safety`,
    cityKey,
    countryCode: "AU",
    adminArea: CITY_ADMIN_AREA[cityKey],
    category: "safety",
    summary: "公的情報にもとづくテスト用の要約",
    notes: null,
    estimates: [],
    reviewedAt: "2026-09-30",
    sources: [
      {
        sourceName: "テスト用の公的出典",
        sourceUrl: "https://example.gov.au/test",
        sourceType: "police",
        sourcePublishedAt: null,
        sourceUpdatedAt: null,
        note: null,
      },
    ],
  };
}

/**
 * route と同じ優先順位を再現する:
 *   公的情報があればそれだけ → 無ければ（開発時のみ）snapshot → それも無ければ「情報なし」
 */
function simulateContext(input: {
  cityKeys: CityKey[];
  publicEntries: CityReferenceEntry[];
  snapshots: DevCitySnapshot[];
  env: { NODE_ENV?: string; CITY_REFERENCE_DEV_SNAPSHOT?: string };
}): { context: string; usedDevSnapshot: boolean } {
  if (input.publicEntries.length > 0) {
    return {
      context: buildCityReferenceContext(input.publicEntries, input.cityKeys) ?? "",
      usedDevSnapshot: false,
    };
  }
  if (isDevCitySnapshotEnabled(input.env)) {
    const usable = input.snapshots.filter((s) => input.cityKeys.includes(s.cityKey));
    const devContext = buildDevCitySnapshotContext(usable);
    if (devContext) return { context: devContext, usedDevSnapshot: true };
  }
  return { context: buildCityReferenceNoDataContext(input.cityKeys), usedDevSnapshot: false };
}

/* ------------------------------------------------------------------ */
console.log("Test 1: production mode → snapshot を絶対に使わない");
{
  assert(!isDevCitySnapshotEnabled(PROD), "NODE_ENV=production ではフラグが true でも無効");
  assert(
    !isDevCitySnapshotEnabled({ NODE_ENV: "production", CITY_REFERENCE_DEV_SNAPSHOT: "TRUE" }),
    "大文字 TRUE でも production では無効",
  );
  assert(loadDevCitySnapshots(PROD).length === 0, "production ではファイルも読まない");

  const result = simulateContext({
    cityKeys: ["cairns"],
    publicEntries: [],
    snapshots: [snapshot("cairns")],
    env: PROD,
  });
  assert(!result.usedDevSnapshot, "production では snapshot を使わない");
  assert(result.context.includes("参照できる確認済みの情報がありません"), "production では「情報なし」になる");
  assert(!result.context.includes("開発・検証用"), "production の prompt に開発用データが混ざらない");
}

console.log("Test 2: development / flag OFF → 使わない");
{
  assert(!isDevCitySnapshotEnabled(DEV_OFF), "フラグが false なら無効");
  assert(!isDevCitySnapshotEnabled(DEV_UNSET), "フラグ未設定なら無効（default OFF）");
  assert(!isDevCitySnapshotEnabled({ CITY_REFERENCE_DEV_SNAPSHOT: "1" }), "'1' では有効にしない（'true' のみ）");
  assert(loadDevCitySnapshots(DEV_OFF).length === 0, "フラグ OFF ではファイルを読まない");

  const result = simulateContext({
    cityKeys: ["cairns"],
    publicEntries: [],
    snapshots: [snapshot("cairns")],
    env: DEV_OFF,
  });
  assert(!result.usedDevSnapshot, "フラグ OFF では snapshot を使わない");
}

console.log("Test 3: development / flag ON → 公的情報が無い場合だけ利用");
{
  assert(isDevCitySnapshotEnabled(DEV_ON), "開発環境 + フラグ true で有効");

  const result = simulateContext({
    cityKeys: ["cairns"],
    publicEntries: [],
    snapshots: [snapshot("cairns")],
    env: DEV_ON,
  });
  assert(result.usedDevSnapshot, "公的情報が無ければ snapshot を使う");
  assert(result.context.includes("開発・検証用の暫定データ"), "開発用データであることを明示する");
  assert(result.context.includes("ケアンズ"), "対象都市の値が入る");
}

console.log("Test 4: 公的情報がある → snapshot で上書きしない");
{
  const result = simulateContext({
    cityKeys: ["sydney"],
    publicEntries: [publicEntry("sydney")],
    snapshots: [snapshot("sydney")],
    env: DEV_ON,
  });
  assert(!result.usedDevSnapshot, "公的情報があれば snapshot は使わない");
  assert(result.context.includes("公的情報にもとづくテスト用の要約"), "公的情報が使われる");
  assert(!result.context.includes("開発・検証用の暫定データ"), "開発用データは混ざらない");
  assert(!result.context.includes("安全感の指標"), "snapshot の指数は入らない");
}

console.log("Test 5: client → snapshot へ直接アクセス不可");
{
  const src = readFileSync("lib/devCitySnapshot.ts", "utf8");
  assert(src.includes('typeof window !== "undefined"'), "ブラウザで読み込まれたら例外を投げる");
  assert(!/^import .*australia\.json/m.test(src), "JSON を static import しない（bundle に入らない）");
  assert(src.includes("readFileSync"), "実行時にサーバー側でファイルを読む");

  // 実際にブラウザ環境を模して例外になることを確認する
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  g.window = {};
  let threw = false;
  try {
    loadDevCitySnapshots(DEV_ON);
  } catch {
    threw = true;
  }
  if (!had) delete g.window;
  assert(threw, "window があると loadDevCitySnapshots は例外になる");

  // Client Component から import されていないこと
  const clientFiles = readdirSync("components").filter((f) => f.endsWith(".tsx"));
  const offenders = clientFiles.filter((f) => readFileSync(`components/${f}`, "utf8").includes("devCitySnapshot"));
  assert(offenders.length === 0, `Client Component から import されていない（${offenders.join(", ") || "なし"}）`);
}

console.log("Test 6: source metadata → numbeo として保持");
{
  assert(DEV_SNAPSHOT_SOURCE === "numbeo", "source を numbeo として保持する");
  const doc = JSON.parse(readFileSync(DEV_SNAPSHOT_FILE, "utf8"));
  assert(doc.source === "numbeo", "テンプレートに source がある");
  assert(doc.usage === "development_only", "テンプレートに development_only が明記されている");
  assert(
    doc.cities.every(
      (c: { sourceUrls?: { safety?: unknown; costOfLiving?: unknown }; capturedAt?: unknown }) =>
        !!c.sourceUrls && "safety" in c.sourceUrls && "costOfLiving" in c.sourceUrls && "capturedAt" in c,
    ),
    "都市ごとに用途別の sourceUrls（safety / costOfLiving）と capturedAt を記録できる",
  );

  const parsed = parseDevCitySnapshotFile({ ...doc, cities: [{ ...doc.cities[0], safety: { safetyIndex: 50 } }] });
  assert(parsed.length === 1, "数値が入った都市は読める");

  // source / usage が違うファイルは読まない
  assert(parseDevCitySnapshotFile({ ...doc, source: "other" }).length === 0, "source が違うファイルは読まない");
  assert(parseDevCitySnapshotFile({ ...doc, usage: "production" }).length === 0, "usage が production のファイルは読まない");

  const context = buildDevCitySnapshotContext([snapshot("perth")]) ?? "";
  assert(context.includes("source = numbeo"), "prompt の内部メタデータに source を残す");
  assert(context.includes("公式犯罪統計ではありません"), "公式犯罪統計として扱わせない");
  assert(context.includes("確認日: 2026-09-30"), "人間が確認した日を渡す");
  assert(!context.includes("https://"), "URL は prompt 本文に出さない");

  // 入力済みの区分にだけ、その区分の出典 URL を要求する
  const both = snapshot("perth");
  assert(missingDevSnapshotSourceUrls(both).length === 0, "両方の URL があれば不足なし");

  const noSafetyUrl = snapshot("perth", { sourceUrls: { safety: null, costOfLiving: "https://example.invalid/c" } });
  assert(
    missingDevSnapshotSourceUrls(noSafetyUrl).join(",") === "safety",
    "治安の数値があるのに safety URL が無ければ不足として検出する",
  );

  const noCostUrl = snapshot("perth", { sourceUrls: { safety: "https://example.invalid/s", costOfLiving: null } });
  assert(
    missingDevSnapshotSourceUrls(noCostUrl).join(",") === "costOfLiving",
    "生活費の数値があるのに costOfLiving URL が無ければ不足として検出する",
  );

  const safetyOnly = snapshot("perth", {
    sourceUrls: { safety: "https://example.invalid/s", costOfLiving: null },
    cost: { costOfLivingIndex: null, rentIndex: null, groceriesIndex: null, restaurantPriceIndex: null },
  });
  assert(
    missingDevSnapshotSourceUrls(safetyOnly).length === 0,
    "数値が無い区分の URL は要求しない（治安だけ入力した場合）",
  );

  const bothMissing = snapshot("perth", { sourceUrls: { safety: null, costOfLiving: null } });
  assert(missingDevSnapshotSourceUrls(bothMissing).length === 2, "両方欠けていれば2件とも検出する");

  // generator が警告として扱うこと
  const generatorSrc = readFileSync("scripts/generate-dev-city-snapshot-sql.ts", "utf8");
  assert(generatorSrc.includes("missingDevSnapshotSourceUrls"), "generator が不足 URL を判定する");
  assert(generatorSrc.includes("出典メタデータの警告が"), "generator が警告件数を報告する");
  assert(
    generatorSrc.includes("source_url_safety") && generatorSrc.includes("source_url_cost_of_living"),
    "生成 SQL が用途別の URL 列を持つ",
  );
}

console.log("Test 7: 数値欠損 → 捏造しない");
{
  const partial = snapshot("perth", {
    safety: { safetyIndex: 60, crimeIndex: null, safetyWalkingAloneDaylight: null, safetyWalkingAloneNight: null },
    cost: { costOfLivingIndex: null, rentIndex: null, groceriesIndex: null, restaurantPriceIndex: null },
  });
  const context = buildDevCitySnapshotContext([partial]) ?? "";
  assert(context.includes("安全感の指標"), "入っている値は出る");
  assert(!context.includes("犯罪の体感指標"), "入っていない値は出さない");
  assert(!context.includes("家賃の指数"), "未入力の生活費は出さない");
  assert(!context.includes(": 0"), "0 で埋めない");
  assert(context.includes("情報があるかのように話さないでください"), "無い項目を話させない指示が入る");

  const empty = snapshot("perth", {
    safety: { safetyIndex: null, crimeIndex: null, safetyWalkingAloneDaylight: null, safetyWalkingAloneNight: null },
    cost: { costOfLivingIndex: null, rentIndex: null, groceriesIndex: null, restaurantPriceIndex: null },
  });
  assert(!hasAnyDevSnapshotValue(empty), "全て未入力の都市は使わない");
  assert(buildDevCitySnapshotContext([empty]) === null, "全て未入力なら prompt を作らない");

  // 文字列・0 以外の型は採用しない
  const doc = JSON.parse(readFileSync(DEV_SNAPSHOT_FILE, "utf8"));
  const hostile = parseDevCitySnapshotFile({
    ...doc,
    cities: [{ cityKey: "perth", safety: { safetyIndex: "55" }, cost: { rentIndex: 42 } }],
  });
  assert(hostile[0]?.safety.safetyIndex === null, "文字列の数値は採用しない");
  assert(hostile[0]?.cost.rentIndex === 42, "数値はそのまま採用する");
}

console.log("Test 8: unsupported city → 使わない");
{
  const doc = JSON.parse(readFileSync(DEV_SNAPSHOT_FILE, "utf8"));
  const parsed = parseDevCitySnapshotFile({
    ...doc,
    cities: [
      { cityKey: "vancouver", safety: { safetyIndex: 70 }, cost: {} },
      { cityKey: "tokyo", safety: { safetyIndex: 80 }, cost: {} },
      { cityKey: "perth", safety: { safetyIndex: 61 }, cost: {} },
    ],
  });
  assert(parsed.length === 1 && parsed[0].cityKey === "perth", "対象6都市以外は捨てる");

  // 質問された都市以外の snapshot は渡さない
  const result = simulateContext({
    cityKeys: ["cairns"],
    publicEntries: [],
    snapshots: [snapshot("perth"), snapshot("cairns")],
    env: DEV_ON,
  });
  assert(result.context.includes("ケアンズ") && !result.context.includes("パース"), "対象都市の分だけ渡す");
}

console.log("Test 9: 外部サイトへの network request → 0");
{
  const files = [
    "lib/devCitySnapshot.ts",
    "scripts/generate-dev-city-snapshot-sql.ts",
    "app/api/chat/route.ts",
    "lib/cityReference.ts",
    "lib/cityReferenceIntent.ts",
    "lib/cityReferenceContext.ts",
    "lib/cityReferenceServer.ts",
    "scripts/import-city-reference-data.ts",
  ].filter((f) => existsSync(f));

  for (const file of files) {
    const src = codeOnly(readFileSync(file, "utf8"));
    assert(!/numbeo\.com/i.test(src), `${file}: 外部サイトの URL を持たない`);
    assert(!/\bfetch\s*\(/.test(src), `${file}: fetch を持たない`);
    assert(!/axios|puppeteer|playwright|cheerio|jsdom/i.test(src), `${file}: 取得・解析ライブラリを使わない`);
  }

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of ["puppeteer", "playwright", "cheerio", "jsdom", "axios"]) {
    assert(!(name in deps), `${name} を依存に追加していない`);
  }
  assert(!("NUMBEO_API_KEY" in process.env), "API key を使う設計になっていない");
}

console.log("Test 10: production build → 公開データ経路へ出ない");
{
  // 公開 view / 公開スキーマに dev 用オブジェクトを作らない
  const migrations = readdirSync("supabase/migrations");
  for (const file of migrations) {
    const src = readFileSync(`supabase/migrations/${file}`, "utf8");
    assert(!/dev_snapshot|city_index_snapshot/i.test(src), `${file}: migration に dev 用オブジェクトが無い`);
  }

  const generator = readFileSync("scripts/generate-dev-city-snapshot-sql.ts", "utf8");
  assert(generator.includes("create schema if not exists dev_snapshot"), "dev 専用スキーマに作る（public に置かない）");
  assert(
    /revoke all on schema dev_snapshot from anon, authenticated/.test(generator),
    "anon / authenticated にスキーマ権限を与えない",
  );
  assert(
    /revoke all on table dev_snapshot\.city_index_snapshot from anon, authenticated/.test(generator),
    "table 権限も落とす",
  );
  assert(!/create view|create or replace view/i.test(generator), "公開 view を作らない");

  // アプリは dev 用 table を SELECT しない（＝production のコード上に SELECT 経路が無い）
  const appFiles = ["app/api/chat/route.ts", "lib/devCitySnapshot.ts", "lib/cityReferenceServer.ts"];
  for (const file of appFiles) {
    const src = codeOnly(readFileSync(file, "utf8"));
    assert(!/dev_snapshot|city_index_snapshot/.test(src), `${file}: dev 用 table を参照しない`);
  }

  // 公的データの読み取り層に dev の概念が混ざっていない
  const serverSrc = codeOnly(readFileSync("lib/cityReferenceServer.ts", "utf8"));
  assert(!/devCitySnapshot|numbeo/i.test(serverSrc), "公的データの読み取り層は dev snapshot を知らない");

  // 既存の公的 seed（production 候補）を壊していない
  assert(existsSync("data/cities/australia/sydney.json"), "Sydney の公的 seed が残っている");
  assert(existsSync("data/cities/australia/gold-coast.json"), "Gold Coast の公的 seed が残っている");
  const sydney = JSON.parse(readFileSync("data/cities/australia/sydney.json", "utf8"));
  assert(
    JSON.stringify(sydney).toLowerCase().includes("numbeo") === false,
    "公的 seed に外部サイト由来のデータが混ざっていない",
  );
}

console.log("Test 11: 手入力データの不変条件（人間が入れた値だけが使われる）");
{
  type CityRow = {
    cityKey: string;
    sourceUrls: { safety: unknown; costOfLiving: unknown };
    capturedAt: unknown;
    safety: Record<string, unknown>;
    cost: Record<string, unknown>;
  };
  const doc = JSON.parse(readFileSync(DEV_SNAPSHOT_FILE, "utf8"));
  assert(doc.cities.length === 6, "対象6都市ぶんの記入欄がある");
  assert(
    doc._readme.join(" ").includes("production では絶対に使わない"),
    "テンプレートに production 禁止が明記されている",
  );

  const cities = doc.cities as CityRow[];
  const values = (c: CityRow) => [...Object.values(c.safety), ...Object.values(c.cost)];
  const filled = cities.filter((c) => values(c).some((v) => v !== null));
  const empty = cities.filter((c) => values(c).every((v) => v === null));
  console.log(`       入力済み: ${filled.map((c) => c.cityKey).join(", ") || "なし"} / 未入力: ${empty.length}都市`);

  // 未入力の都市は null のまま（0 や空文字で埋めない）
  for (const city of empty) {
    assert(
      values(city).every((v) => v === null) &&
        city.sourceUrls.safety === null &&
        city.sourceUrls.costOfLiving === null &&
        city.capturedAt === null,
      `${city.cityKey}: 未入力の項目は null のまま`,
    );
  }

  for (const city of filled) {
    // 型: 数値は必ず number（文字列で書かれていたら読み捨てられてしまう）
    for (const [key, value] of [...Object.entries(city.safety), ...Object.entries(city.cost)]) {
      assert(value === null || typeof value === "number", `${city.cityKey}.${key}: 数値は number（文字列にしない）`);
    }
    // 範囲: 安全・犯罪は 0〜100 の指数。生活費系は NY=100 を基準とする相対指数なので 100 を超え得る
    for (const key of ["safetyIndex", "crimeIndex", "safetyWalkingAloneDaylight", "safetyWalkingAloneNight"]) {
      const value = city.safety[key];
      if (typeof value === "number") {
        assert(value >= 0 && value <= 100, `${city.cityKey}.${key}: 0〜100 の範囲`);
      }
    }
    for (const key of ["costOfLivingIndex", "rentIndex", "groceriesIndex", "restaurantPriceIndex"]) {
      const value = city.cost[key];
      if (typeof value === "number") {
        assert(value >= 0 && value <= 300, `${city.cityKey}.${key}: 極端な外れ値でない（入力ミス検出）`);
      }
    }
    // 追跡可能性: いつ確認した値かは必須（sourceUrl は generator が警告する）
    assert(
      typeof city.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(city.capturedAt),
      `${city.cityKey}: capturedAt が YYYY-MM-DD で記録されている`,
    );
    for (const [key, url] of Object.entries(city.sourceUrls)) {
      assert(url === null || (typeof url === "string" && /^https:\/\//.test(url)), `${city.cityKey}.sourceUrls.${key}: https URL か未記入（null）`);
    }
    // 入力済みの区分には出典 URL が揃っていること（不足は generator が警告する）
    const loaded = loadDevCitySnapshots(DEV_ON).find((s) => s.cityKey === city.cityKey);
    assert(loaded !== undefined, `${city.cityKey}: 読み込める`);
    if (loaded) {
      assert(
        missingDevSnapshotSourceUrls(loaded).length === 0,
        `${city.cityKey}: 入力済みの区分の出典 URL が揃っている`,
      );
    }
  }

  // 読み込み結果が入力済みの都市数と一致する（未入力の都市は読み込まれない）
  assert(
    loadDevCitySnapshots(DEV_ON).length === filled.length,
    "読み込まれるのは数値が入力済みの都市だけ",
  );
  assert(loadDevCitySnapshots(PROD).length === 0, "production では入力済みでも読み込まれない");
}

/* ------------------------------------------------------------------ */
console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
