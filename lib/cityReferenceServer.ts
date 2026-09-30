/**
 * 都市リファレンスの読み取り（Server 側専用）。
 *
 * - 読むのは **sanitized view（city_reference_public / city_reference_sources_public）だけ**。
 *   base table は anon / authenticated から select も含めて権限が無く、内部メモ（review_note）は
 *   view に含まれない。「どの列を出すか」はこのファイルの SELECT ではなく DB 側の view で決まる。
 * - 既存の Server Supabase client（anon key・service role 不使用）で読む。
 * - Plan / Karte / Worksheet の RLS には一切触れない（別 table・別権限）。
 * - 読み取り失敗時は「情報が無い」として扱い、Chat を止めない（捏造もしない）。
 * - 同じ view を将来の City Guide / Media からも使う（Chat 専用の構造にしない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CITY_KEYS,
  isCityReferenceCategory,
  isSourceType,
  type CityKey,
  type CityReferenceCategory,
  type CityReferenceEntry,
  type CityReferenceEstimate,
  type CityReferenceSource,
} from "@/lib/cityReference";

const ENTRY_COLUMNS = "id, city_key, country_code, admin_area, category, summary, notes, details, reviewed_at";
const SOURCE_COLUMNS = "entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** details.estimates を検証する。想定外の形は捨てる（部分的に壊れていても他は使う）。 */
function parseEstimates(details: unknown): CityReferenceEstimate[] {
  if (!details || typeof details !== "object") return [];
  const list = (details as Record<string, unknown>).estimates;
  if (!Array.isArray(list)) return [];
  const out: CityReferenceEstimate[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const sourceName = str(e.sourceName);
    const label = str(e.label);
    // どの出典の数字かが分からない estimate は使わない（出典の追跡を最優先する）。
    if (!sourceName || !label) continue;
    out.push({
      sourceName,
      label,
      min: num(e.min),
      max: num(e.max),
      currency: str(e.currency),
      period: str(e.period),
      basis: str(e.basis),
    });
    if (out.length >= 20) break;
  }
  return out;
}

function parseSource(raw: unknown): { entryId: string; source: CityReferenceSource } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const entryId = str(row.entry_id);
  const sourceName = str(row.source_name);
  const sourceUrl = str(row.source_url);
  if (!entryId || !sourceName || !sourceUrl) return null;
  // http(s) 以外の URL（javascript: 等）は保存されない想定だが、読み取り側でも弾く。
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  return {
    entryId,
    source: {
      sourceName,
      sourceUrl,
      sourceType: isSourceType(row.source_type) ? row.source_type : "other",
      sourcePublishedAt: str(row.source_published_at),
      sourceUpdatedAt: str(row.source_updated_at),
      note: str(row.note),
    },
  };
}

/** view の行 → CityReferenceEntry（sources は空で返し、呼び出し側で埋める）。 */
export function parseCityReferenceEntry(raw: unknown): CityReferenceEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = str(row.id);
  const cityKey = str(row.city_key);
  const summary = str(row.summary);
  const reviewedAt = str(row.reviewed_at);
  if (!id || !cityKey || !summary || !reviewedAt) return null;
  if (!(CITY_KEYS as string[]).includes(cityKey)) return null;
  if (!isCityReferenceCategory(row.category)) return null;

  return {
    id,
    cityKey: cityKey as CityKey,
    countryCode: str(row.country_code) ?? "AU",
    adminArea: str(row.admin_area),
    category: row.category,
    summary,
    notes: str(row.notes),
    estimates: parseEstimates(row.details),
    reviewedAt,
    sources: [],
  };
}

/**
 * 指定の都市 × category の行だけを読む（必要な範囲だけ取得する）。
 * 出典は別 view から1クエリで取得して紐付ける。
 * 行が無い・読み取りに失敗した場合は空配列（呼び出し側が「情報なし」として扱う）。
 */
export async function loadCityReferenceEntries(
  supabase: SupabaseClient,
  cityKeys: CityKey[],
  categories: CityReferenceCategory[],
): Promise<CityReferenceEntry[]> {
  if (cityKeys.length === 0 || categories.length === 0) return [];

  const { data, error } = await supabase
    .from("city_reference_public")
    .select(ENTRY_COLUMNS)
    .in("city_key", cityKeys)
    .in("category", categories);

  if (error) {
    console.error("city_reference_public load error:", error.message);
    return [];
  }

  const entries: CityReferenceEntry[] = [];
  for (const raw of data ?? []) {
    const entry = parseCityReferenceEntry(raw);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return [];

  const { data: sourceRows, error: sourceError } = await supabase
    .from("city_reference_sources_public")
    .select(SOURCE_COLUMNS)
    .in(
      "entry_id",
      entries.map((e) => e.id),
    );

  if (sourceError) {
    // 出典が読めない場合、要約だけを出典不明で使わせない（出典の追跡が前提のデータなので落とす）。
    console.error("city_reference_sources_public load error:", sourceError.message);
    return [];
  }

  const byEntry = new Map<string, CityReferenceSource[]>();
  for (const raw of sourceRows ?? []) {
    const parsed = parseSource(raw);
    if (!parsed) continue;
    const list = byEntry.get(parsed.entryId) ?? [];
    list.push(parsed.source);
    byEntry.set(parsed.entryId, list);
  }

  // 出典が1件も無い entry は使わない（登録漏れの要約を出典なしで語らせない）。
  return entries
    .map((entry) => ({ ...entry, sources: byEntry.get(entry.id) ?? [] }))
    .filter((entry) => entry.sources.length > 0)
    // 都市 → category の順で安定させる（プロンプトの並びを毎回同じにする）。
    .sort((a, b) => (a.cityKey === b.cityKey ? a.category.localeCompare(b.category) : 0));
}
