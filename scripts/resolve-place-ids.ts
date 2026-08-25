/**
 * 【開発時にローカルで実行するスクリプト。DBもAdmin APIも作らない】
 *
 * lib/data/schools.ts の各学校（address を持つもの）を、
 * Places API (New) Text Search で name + address から解決し、
 * placeId / lat / lng / placeIdRefreshedAt を schools.ts に書き戻す。
 *
 * 【大原則】保存してよいのは placeId と（使う場合のみ）lat/lng だけ。
 * Text Search のレスポンスに含まれる可能性のある名前・評価等の本文は、
 * このスクリプトの出力にも書き戻し先にも一切含めない
 * （fieldMask を places.id, places.location のみに絞っている）。
 *
 * placeIdRefreshedAt が12か月を超えている、または未設定のレコードのみを対象にする。
 * address が無い学校（ホームステイ型等、固定キャンパスが無い）はそもそも対象外。
 *
 * 実行方法:
 *   GOOGLE_MAPS_SERVER_KEY=xxx npx tsx scripts/resolve-place-ids.ts [--dry-run] [--force]
 *
 *   --dry-run  ファイルを書き換えず、結果をコンソール表示するだけ
 *   --force    12か月以内でも address を持つ全件を再解決する
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUSTRALIA_SCHOOLS, type School } from "../lib/data/schools";

const SCHOOLS_FILE = resolve(__dirname, "../lib/data/schools.ts");
const REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 365; // 12ヶ月

const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

interface ResolvedPlace {
  placeId: string;
  lat?: number;
  lng?: number;
}

interface TextSearchResponse {
  places?: Array<{
    id: string;
    location?: { latitude: number; longitude: number };
  }>;
}

function needsRefresh(school: School): boolean {
  if (!school.address) return false; // 固定キャンパスが無い学校は対象外
  if (force) return true;
  if (!school.placeId || !school.placeIdRefreshedAt) return true;
  const age = Date.now() - new Date(school.placeIdRefreshedAt).getTime();
  return age > REFRESH_THRESHOLD_MS;
}

async function resolveOne(school: School): Promise<ResolvedPlace | null> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey!,
        // place_id と座標だけが目的。それ以外のフィールド（名前・評価等）は取得しない。
        "X-Goog-FieldMask": "places.id,places.location",
      },
      body: JSON.stringify({
        textQuery: `${school.name}, ${school.address}`,
        languageCode: "en",
      }),
    },
  );

  if (!res.ok) {
    console.error(`[NG] ${school.schoolSlug}: HTTP ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as TextSearchResponse;
  const top = data.places?.[0];
  if (!top) {
    console.warn(`[見つからず] ${school.schoolSlug}: "${school.name}, ${school.address}"`);
    return null;
  }
  return {
    placeId: top.id,
    lat: top.location?.latitude,
    lng: top.location?.longitude,
  };
}

/** schools.ts 内の該当レコードのブロックだけを見つけて、置換用の新ブロックを組み立てる */
function writeBack(
  source: string,
  schoolSlug: string,
  result: ResolvedPlace,
): string {
  const blockRe = new RegExp(
    `(\\{\\s*schoolSlug:\\s*"${schoolSlug}"[\\s\\S]*?)\\n(  \\},)`,
  );
  const match = source.match(blockRe);
  if (!match) {
    throw new Error(`schools.ts 内に schoolSlug: "${schoolSlug}" のブロックが見つかりません`);
  }

  // 既存の placeId / lat / lng / placeIdRefreshedAt 行を一旦除去してから付け直す
  const cleanedBlock = match[1].replace(
    /\n\s*(placeId|lat|lng|placeIdRefreshedAt):[^\n]*,?/g,
    "",
  );

  const today = new Date().toISOString().slice(0, 10);
  const newFields = [
    `    placeId: "${result.placeId}",`,
    result.lat !== undefined ? `    lat: ${result.lat},` : null,
    result.lng !== undefined ? `    lng: ${result.lng},` : null,
    `    placeIdRefreshedAt: "${today}",`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const updatedBlock = `${cleanedBlock}\n${newFields}`;
  return source.replace(match[0], `${updatedBlock}\n${match[2]}`);
}

async function main() {
  if (!apiKey) {
    console.error("環境変数 GOOGLE_MAPS_SERVER_KEY が未設定です。");
    process.exit(1);
  }

  const targets = AUSTRALIA_SCHOOLS.filter(needsRefresh);
  if (targets.length === 0) {
    console.log("リフレッシュ対象のレコードはありません。");
    return;
  }

  console.log(`対象: ${targets.length}件${force ? "（--force）" : ""}${dryRun ? "（--dry-run）" : ""}\n`);

  let source = readFileSync(SCHOOLS_FILE, "utf-8");
  let updatedCount = 0;

  for (const school of targets) {
    const result = await resolveOne(school);
    if (!result) continue;

    console.log(
      `[OK] ${school.schoolSlug}: placeId=${result.placeId} lat=${result.lat ?? "-"} lng=${result.lng ?? "-"}`,
    );

    if (!dryRun) {
      source = writeBack(source, school.schoolSlug, result);
      updatedCount++;
    }
  }

  if (dryRun) {
    console.log("\n--dry-run のため lib/data/schools.ts は書き換えていません。");
    return;
  }

  if (updatedCount > 0) {
    writeFileSync(SCHOOLS_FILE, source, "utf-8");
    console.log(`\n${updatedCount}件を lib/data/schools.ts に書き戻しました。差分を確認してください。`);
  } else {
    console.log("\n書き戻し対象はありませんでした。");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
