/**
 * ビザリファレンスの読み取り（Server 側専用）。
 *
 * - 読むのは **sanitized view（visa_reference_public / visa_reference_sources_public）だけ**。
 *   base table は anon / authenticated から select も含めて権限が無く、内部メモ（review_note）は
 *   view に含まれない。「どの列を出すか」はこのファイルの SELECT ではなく DB 側の view で決まる。
 * - 既存の Server Supabase client（anon key・service role 不使用）で読む。
 * - Plan / Karte / Worksheet の RLS には一切触れない（別 table・別権限）。
 * - 読み取り失敗時は「情報が無い」として扱い、Chat を止めない（捏造もしない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isVisaCategory,
  isVisaKey,
  isVisaSourceType,
  type VisaCategory,
  type VisaKey,
  type VisaReferenceEntry,
  type VisaReferenceSource,
} from "@/lib/visaReference";

const ENTRY_COLUMNS = "id, visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at";
const SOURCE_COLUMNS =
  "entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseSource(raw: unknown): { entryId: string; source: VisaReferenceSource } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const entryId = str(row.entry_id);
  const sourceName = str(row.source_name);
  const sourceUrl = str(row.source_url);
  if (!entryId || !sourceName || !sourceUrl) return null;
  // http(s) 以外（javascript: 等）は弾く。
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  if (!isVisaSourceType(row.source_type)) return null;
  return {
    entryId,
    source: {
      sourceName,
      sourceUrl,
      sourceType: row.source_type,
      sourcePublishedAt: str(row.source_published_at),
      sourceUpdatedAt: str(row.source_updated_at),
      accessedAt: str(row.accessed_at),
    },
  };
}

/** view の行 → VisaReferenceEntry（sources は空で返し、呼び出し側で埋める）。 */
export function parseVisaReferenceEntry(raw: unknown): VisaReferenceEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = str(row.id);
  const summary = str(row.summary);
  const reviewedAt = str(row.reviewed_at);
  const visaCode = str(row.visa_code);
  const visaName = str(row.visa_name);
  if (!id || !summary || !reviewedAt || !visaCode || !visaName) return null;
  if (!isVisaKey(row.visa_key)) return null;
  if (!isVisaCategory(row.category)) return null;

  const details =
    row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};

  return {
    id,
    visaKey: row.visa_key,
    visaCode,
    visaName,
    countryCode: str(row.country_code) ?? "AU",
    category: row.category,
    summary,
    details,
    reviewedAt,
    sources: [],
  };
}

/**
 * 指定のビザ × category の行だけを読む（必要な範囲だけ取得する）。
 * 出典は別 view から1クエリで取得して紐づける。
 * 出典が1件も無い entry は使わない（出典の追跡がこのデータの前提）。
 * 行が無い・読み取りに失敗した場合は空配列（呼び出し側が「情報なし」として扱う）。
 */
export async function loadVisaReferenceEntries(
  supabase: SupabaseClient,
  visaKeys: VisaKey[],
  categories: VisaCategory[],
): Promise<VisaReferenceEntry[]> {
  if (visaKeys.length === 0 || categories.length === 0) return [];

  const { data, error } = await supabase
    .from("visa_reference_public")
    .select(ENTRY_COLUMNS)
    .in("visa_key", visaKeys)
    .in("category", categories);

  if (error) {
    console.error("visa_reference_public load error:", error.message);
    return [];
  }

  const entries: VisaReferenceEntry[] = [];
  for (const raw of data ?? []) {
    const entry = parseVisaReferenceEntry(raw);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return [];

  const { data: sourceRows, error: sourceError } = await supabase
    .from("visa_reference_sources_public")
    .select(SOURCE_COLUMNS)
    .in(
      "entry_id",
      entries.map((e) => e.id),
    );

  if (sourceError) {
    // 出典が読めない状態で制度の説明をさせない（出典の追跡が前提のデータなので落とす）。
    console.error("visa_reference_sources_public load error:", sourceError.message);
    return [];
  }

  const byEntry = new Map<string, VisaReferenceSource[]>();
  for (const raw of sourceRows ?? []) {
    const parsed = parseSource(raw);
    if (!parsed) continue;
    const list = byEntry.get(parsed.entryId) ?? [];
    list.push(parsed.source);
    byEntry.set(parsed.entryId, list);
  }

  return entries
    .map((entry) => ({ ...entry, sources: byEntry.get(entry.id) ?? [] }))
    .filter((entry) => entry.sources.length > 0)
    // ビザ → category の順で安定させる（prompt の並びを毎回同じにする）。
    .sort((a, b) => (a.visaKey === b.visaKey ? a.category.localeCompare(b.category) : a.visaKey.localeCompare(b.visaKey)));
}
