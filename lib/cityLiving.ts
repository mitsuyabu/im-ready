/**
 * 都市の治安・生活費の**外部データ**を扱う層（環境非依存の型と純粋関数）。
 *
 * 役割分担:
 *   - lib/data/cities.ts … 公的情報ベースの実額（A$/週 等）。従来どおり常時プロンプトに入る。
 *   - このファイル       … 外部ソース（まずは Numbeo）の指数・体感値。都市を聞かれたときだけ使う。
 *   Chat には「実額は cities.ts 側、都市間の相対比較はこちら」という前提で渡す（混ぜて断定させない）。
 *
 * 都市キーは lib/planCover.ts の resolvePlanCoverKey を再利用する（表記揺れの吸収も含めて
 * 既存の1箇所に任せ、新しい都市辞書を作らない）。
 *
 * Numbeo のデータについて（README の「データソースに関する制約」に従う）:
 *   - Web ページのスクレイピングはしない。公式 API（API key 必須）だけを使う。
 *   - API / Data License を契約していない場合、numbeo を source とする行を作ってはいけない。
 *   - Crime / Safety Index は **サイト訪問者アンケートに基づく体感値**であり、警察・政府の
 *     公式犯罪統計ではない（Numbeo 自身が methodology で明記している）。この区別は
 *     buildCityLivingContext() が毎回プロンプトへ書き込む。
 */

import { resolvePlanCoverKey, type PlanCoverKey } from "@/lib/planCover";

/** 対象都市キー。現時点はオーストラリア6都市（= 既存 PlanCoverKey と同一）。 */
export type CityKey = PlanCoverKey;

/** 表示用の日本語都市名。プロンプト・将来の City Guide で共用する。 */
export const CITY_LABELS: Record<CityKey, string> = {
  sydney: "シドニー",
  melbourne: "メルボルン",
  brisbane: "ブリスベン",
  goldcoast: "ゴールドコースト",
  cairns: "ケアンズ",
  perth: "パース",
};

/** Numbeo API に渡す都市名（query）。同期スクリプトが使う。 */
export const CITY_QUERY: Record<CityKey, string> = {
  sydney: "Sydney, Australia",
  melbourne: "Melbourne, Australia",
  brisbane: "Brisbane, Australia",
  goldcoast: "Gold Coast, Australia",
  cairns: "Cairns, Australia",
  perth: "Perth, Australia",
};

export const CITY_KEYS = Object.keys(CITY_LABELS) as CityKey[];

/** 自由記述の都市文字列 → CityKey。判定は既存 resolvePlanCoverKey に委譲する。 */
export function toCityKey(city: string | null | undefined): CityKey | null {
  return resolvePlanCoverKey(city);
}

/* ------------------------------------------------------------------ */
/* 行の型                                                              */
/* ------------------------------------------------------------------ */

export type CityPriceItem = {
  itemId: number;
  label: string;
  average: number | null;
  low: number | null;
  high: number | null;
  dataPoints: number | null;
};

export type CityLivingRow = {
  cityKey: CityKey;
  countryCode: string;
  source: string;
  safety: {
    safetyIndex: number | null;
    crimeIndex: number | null;
    safeAloneDaylight: number | null;
    safeAloneNight: number | null;
    worriedMuggedRobbed: number | null;
    worriedHomeBroken: number | null;
  };
  cost: {
    costIndex: number | null;
    costAndRentIndex: number | null;
    rentIndex: number | null;
    groceriesIndex: number | null;
    restaurantPriceIndex: number | null;
  };
  prices: Record<string, CityPriceItem>;
  currency: string | null;
  contributors: number | null;
  crimeContributors: number | null;
  /** 外部ソース側の更新時点（YYYY-MM-DD。月初日で保存している）。 */
  sourceUpdatedAt: string | null;
  /** こちらが取得した時刻（ISO）。 */
  fetchedAt: string;
};

/* ------------------------------------------------------------------ */
/* Numbeo レスポンスの正規化                                            */
/* ------------------------------------------------------------------ */

/**
 * 保存対象の price 項目。Numbeo /api/city_prices は数十項目を返すが、留学・ワーホリの
 * 生活費説明で実際に使うものだけを保存する（item_id は Numbeo の固定 ID）。
 *
 * item_id はこちらで採番したものではなく Numbeo 側の ID であり、API を契約していない状態では
 * 実レスポンスで突き合わせできない。そのため同期時は **item_id と item_name の両方**で照合し、
 * どちらも一致しなければその項目は保存しない（存在しない項目を作らない）。
 */
export const PRICE_ITEMS: { slug: string; itemId: number; label: string; match: RegExp }[] = [
  { slug: "rentOneBedCenter", itemId: 26, label: "1LDK（市中心部）の家賃", match: /apartment.*1 bedroom.*city cent/i },
  { slug: "rentOneBedOutside", itemId: 27, label: "1LDK（中心部以外）の家賃", match: /apartment.*1 bedroom.*outside of cent/i },
  { slug: "mealInexpensive", itemId: 1, label: "安めの外食（1食）", match: /meal, inexpensive restaurant/i },
  { slug: "monthlyTransportPass", itemId: 20, label: "公共交通の定期（月）", match: /monthly pass/i },
  { slug: "basicUtilities", itemId: 30, label: "光熱費など（月）", match: /basic .*electricity/i },
  { slug: "internet", itemId: 33, label: "インターネット（月）", match: /internet/i },
];

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

/** yearLastUpdate / monthLastUpdate → 'YYYY-MM-01'。どちらか欠ければ null。 */
export function toSourceUpdatedAt(year: unknown, month: unknown): string | null {
  const y = int(year);
  const m = int(month);
  if (y === null || m === null) return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/**
 * /api/city_crime・/api/indices・/api/city_prices の3レスポンスを1行へまとめる。
 *
 * 想定していない field は無視し、**存在しない値は null のまま**にする（欠損を 0 で埋めない）。
 * 実際の field 名は Numbeo の API ドキュメントで確認したものに合わせている:
 *   city_crime … index_safety, index_crime, safe_alone_daylight, safe_alone_night,
 *                worried_mugged_robbed, worried_home_broken, contributors,
 *                yearLastUpdate, monthLastUpdate
 *   indices    … cpi_index, cpi_and_rent_index, rent_index, groceries_index,
 *                restaurant_price_index, contributors_cost_of_living, yearLastUpdate, monthLastUpdate
 *   city_prices… prices[{ item_id, item_name, average_price, lowest_price, highest_price, data_points }],
 *                currency, contributors, yearLastUpdate, monthLastUpdate
 */
export function normalizeNumbeoCity(input: {
  cityKey: CityKey;
  countryCode?: string;
  crime?: unknown;
  indices?: unknown;
  prices?: unknown;
  fetchedAt: string;
}): CityLivingRow {
  const crime = (input.crime && typeof input.crime === "object" ? input.crime : {}) as Record<string, unknown>;
  const indices = (input.indices && typeof input.indices === "object" ? input.indices : {}) as Record<string, unknown>;
  const pricesRes = (input.prices && typeof input.prices === "object" ? input.prices : {}) as Record<string, unknown>;

  const prices: Record<string, CityPriceItem> = {};
  const rawList = Array.isArray(pricesRes.prices) ? pricesRes.prices : [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const itemId = int(item.item_id);
    const itemName = typeof item.item_name === "string" ? item.item_name : "";
    // item_id と item_name の両方で確認できたものだけ保存する。
    const spec = PRICE_ITEMS.find((p) => p.itemId === itemId && p.match.test(itemName));
    if (!spec) continue;
    prices[spec.slug] = {
      itemId: spec.itemId,
      label: spec.label,
      average: num(item.average_price),
      low: num(item.lowest_price),
      high: num(item.highest_price),
      dataPoints: int(item.data_points),
    };
  }

  // source_updated_at は、指数側（indices）→ 治安側（crime）→ 価格側の順で、取れた方を使う。
  const sourceUpdatedAt =
    toSourceUpdatedAt(indices.yearLastUpdate, indices.monthLastUpdate) ??
    toSourceUpdatedAt(crime.yearLastUpdate, crime.monthLastUpdate) ??
    toSourceUpdatedAt(pricesRes.yearLastUpdate, pricesRes.monthLastUpdate);

  return {
    cityKey: input.cityKey,
    countryCode: input.countryCode ?? "AU",
    source: "numbeo",
    safety: {
      safetyIndex: num(crime.index_safety),
      crimeIndex: num(crime.index_crime),
      safeAloneDaylight: num(crime.safe_alone_daylight),
      safeAloneNight: num(crime.safe_alone_night),
      worriedMuggedRobbed: num(crime.worried_mugged_robbed),
      worriedHomeBroken: num(crime.worried_home_broken),
    },
    cost: {
      costIndex: num(indices.cpi_index),
      costAndRentIndex: num(indices.cpi_and_rent_index),
      rentIndex: num(indices.rent_index),
      groceriesIndex: num(indices.groceries_index),
      restaurantPriceIndex: num(indices.restaurant_price_index),
    },
    prices,
    currency: typeof pricesRes.currency === "string" ? pricesRes.currency : null,
    contributors: int(indices.contributors_cost_of_living) ?? int(pricesRes.contributors),
    crimeContributors: int(crime.contributors),
    sourceUpdatedAt,
    fetchedAt: input.fetchedAt,
  };
}

/** 治安・生活費のどちらについても値が1つも無い行は、Chat に渡す意味が無い。 */
export function hasAnyCityLivingValue(row: CityLivingRow): boolean {
  return (
    Object.values(row.safety).some((v) => v !== null) ||
    Object.values(row.cost).some((v) => v !== null) ||
    Object.keys(row.prices).length > 0
  );
}

/* ------------------------------------------------------------------ */
/* 鮮度                                                                */
/* ------------------------------------------------------------------ */

/**
 * 鮮度の区分。しきい値は Numbeo 自身の methodology に合わせている（勝手に 30/60/90 日で
 * 切らない）: Numbeo は「最新値の算出には原則 12 ヶ月以内のデータを使い、回答者が少ない
 * 場合は 24 ヶ月前までのデータも使う」と明記しており、手動収集ぶんの投入は年2回。
 * したがって、
 *   current … source_updated_at が 12 ヶ月以内。通常どおり使える。
 *   aging   … 12〜24 ヶ月。使ってよいが「少し前のデータ」と添える。
 *   stale   … 24 ヶ月超、または source_updated_at 不明。比較の根拠には使わない。
 * こちらの取得日時（fetched_at）は別問題（同期が止まっていないかの運用指標）なので、
 * 週1同期に対して 30 日を超えたら needsResync とする。
 */
export type CityDataFreshness = "current" | "aging" | "stale";

const MONTH_MS = 1000 * 60 * 60 * 24 * 365.25 / 12;

export function classifyFreshness(row: CityLivingRow, now: Date = new Date()): CityDataFreshness {
  if (!row.sourceUpdatedAt) return "stale";
  const updated = new Date(`${row.sourceUpdatedAt}T00:00:00Z`).getTime();
  if (Number.isNaN(updated)) return "stale";
  const months = (now.getTime() - updated) / MONTH_MS;
  if (months <= 12) return "current";
  if (months <= 24) return "aging";
  return "stale";
}

/** 同期が止まっていないかの運用判定（週1同期の想定に対して 30 日）。 */
export function needsResync(row: CityLivingRow, now: Date = new Date()): boolean {
  const fetched = new Date(row.fetchedAt).getTime();
  if (Number.isNaN(fetched)) return true;
  return now.getTime() - fetched > 30 * 24 * 60 * 60 * 1000;
}
