/**
 * city_living_data の読み取り（Server 側専用）。
 *
 * - 既存の Server Supabase client（anon key・service role 不使用）で読む。
 *   city_living_data は公開情報で、RLS は select のみ許可・書き込み policy 無し。
 * - Plan / Karte の RLS には一切触れない（別 table・別 policy）。
 * - 読み取り失敗時は「データが無い」として扱い、Chat を止めない（捏造もしない）。
 * - raw 列（外部 API の生レスポンス）は取得しない。Chat にも Client にも渡さない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CITY_KEYS, type CityKey, type CityLivingRow, type CityPriceItem } from "@/lib/cityLiving";

const SELECT_COLUMNS = [
  "city_key",
  "country_code",
  "source",
  "safety_index",
  "crime_index",
  "safe_alone_daylight",
  "safe_alone_night",
  "worried_mugged_robbed",
  "worried_home_broken",
  "cost_index",
  "cost_and_rent_index",
  "rent_index",
  "groceries_index",
  "restaurant_price_index",
  "prices",
  "currency",
  "contributors",
  "crime_contributors",
  "source_updated_at",
  "fetched_at",
].join(", ");

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // numeric 列は driver によって文字列で返ることがあるため、数値化できる場合だけ受け入れる。
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

function parsePrices(value: unknown): Record<string, CityPriceItem> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, CityPriceItem> = {};
  for (const [slug, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const itemId = int(item.itemId);
    const label = typeof item.label === "string" ? item.label : null;
    if (itemId === null || !label) continue;
    out[slug] = {
      itemId,
      label,
      average: num(item.average),
      low: num(item.low),
      high: num(item.high),
      dataPoints: int(item.dataPoints),
    };
  }
  return out;
}

/** DB 行 → CityLivingRow。city_key が既知の都市でなければ捨てる。 */
export function parseCityLivingRow(raw: unknown): CityLivingRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const cityKey = row.city_key;
  if (typeof cityKey !== "string" || !(CITY_KEYS as string[]).includes(cityKey)) return null;
  const source = typeof row.source === "string" && row.source.length > 0 ? row.source : null;
  const fetchedAt = typeof row.fetched_at === "string" ? row.fetched_at : null;
  if (!source || !fetchedAt) return null;

  return {
    cityKey: cityKey as CityKey,
    countryCode: typeof row.country_code === "string" ? row.country_code : "AU",
    source,
    safety: {
      safetyIndex: num(row.safety_index),
      crimeIndex: num(row.crime_index),
      safeAloneDaylight: num(row.safe_alone_daylight),
      safeAloneNight: num(row.safe_alone_night),
      worriedMuggedRobbed: num(row.worried_mugged_robbed),
      worriedHomeBroken: num(row.worried_home_broken),
    },
    cost: {
      costIndex: num(row.cost_index),
      costAndRentIndex: num(row.cost_and_rent_index),
      rentIndex: num(row.rent_index),
      groceriesIndex: num(row.groceries_index),
      restaurantPriceIndex: num(row.restaurant_price_index),
    },
    prices: parsePrices(row.prices),
    currency: typeof row.currency === "string" ? row.currency : null,
    contributors: int(row.contributors),
    crimeContributors: int(row.crime_contributors),
    sourceUpdatedAt: typeof row.source_updated_at === "string" ? row.source_updated_at : null,
    fetchedAt,
  };
}

/**
 * 対象6都市ぶんを1クエリで読む（6行しかないため都市ごとの絞り込みはしない）。
 * 呼び出し側は必要な都市だけをプロンプトへ入れ、残りは順位の算出にだけ使う。
 * 同じ都市に複数 source がある場合は、取得日が新しいものを1件だけ採用する。
 */
export async function loadCityLivingRows(supabase: SupabaseClient): Promise<CityLivingRow[]> {
  const { data, error } = await supabase
    .from("city_living_data")
    .select(SELECT_COLUMNS)
    .order("fetched_at", { ascending: false });

  if (error) {
    console.error("city_living_data load error:", error.message);
    return [];
  }

  const byCity = new Map<CityKey, CityLivingRow>();
  for (const raw of data ?? []) {
    const row = parseCityLivingRow(raw);
    if (!row) continue;
    // order で新しい順に来ているため、最初に入ったものを残す。
    if (!byCity.has(row.cityKey)) byCity.set(row.cityKey, row);
  }
  return [...byCity.values()];
}
