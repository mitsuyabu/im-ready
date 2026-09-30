/**
 * 都市リファレンス（公的・信頼できる公開情報を人間が確認して蓄積したもの）の型と純粋関数。
 *
 * 役割分担:
 *   - lib/data/cities.ts   … コードに直接持つ編集済みの費用目安（従来どおり常時プロンプトに入る）
 *   - city_reference_data  … DB に持つ都市情報。category ごとの要約＋出典。Chat は聞かれたときだけ読む
 *   - このファイル         … その型・category 定義・鮮度の扱い（環境非依存）
 *
 * 方針（重要）:
 *   - **独自の合成スコアを作らない**。Safety Index / 生活費指数のような単一指標は持たない。
 *   - 生活費は housing / food / transport / utilities / everyday に分けて扱う。
 *   - 出典ごとに前提が違うため、複数の estimate を**平均しない**（そのまま並べる）。
 *   - 都市キーは lib/planCover.ts の resolvePlanCoverKey を再利用する（都市辞書を作らない）。
 */

import { resolvePlanCoverKey, type PlanCoverKey } from "@/lib/planCover";

/** 対象都市キー。現時点はオーストラリア6都市（= 既存 PlanCoverKey と同一）。 */
export type CityKey = PlanCoverKey;

export const CITY_LABELS: Record<CityKey, string> = {
  sydney: "シドニー",
  melbourne: "メルボルン",
  brisbane: "ブリスベン",
  goldcoast: "ゴールドコースト",
  cairns: "ケアンズ",
  perth: "パース",
};

/**
 * 都市が属する州。犯罪統計は州ごとに集計機関・罪種の定義・公表期間が違うため、
 * **州をまたぐ単純比較をさせない**判断に使う（同じ州内なら同一機関の統計なので、
 * 注意付きで違いに触れてよい）。
 */
export const CITY_ADMIN_AREA: Record<CityKey, string> = {
  sydney: "NSW",
  melbourne: "VIC",
  brisbane: "QLD",
  goldcoast: "QLD",
  cairns: "QLD",
  perth: "WA",
};

export const CITY_KEYS = Object.keys(CITY_LABELS) as CityKey[];

/** 自由記述の都市文字列 → CityKey。判定は既存 resolvePlanCoverKey に委譲する。 */
export function toCityKey(city: string | null | undefined): CityKey | null {
  return resolvePlanCoverKey(city);
}

/* ------------------------------------------------------------------ */
/* category                                                            */
/* ------------------------------------------------------------------ */

export const CITY_REFERENCE_CATEGORIES = [
  "safety",
  "housing",
  "food",
  "transport",
  "utilities",
  "everyday",
] as const;

export type CityReferenceCategory = (typeof CITY_REFERENCE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CityReferenceCategory, string> = {
  safety: "治安・安全",
  housing: "住居費",
  food: "食費",
  transport: "交通",
  utilities: "光熱・通信",
  everyday: "日常の出費",
};

export function isCityReferenceCategory(value: unknown): value is CityReferenceCategory {
  return typeof value === "string" && (CITY_REFERENCE_CATEGORIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* 出典                                                                */
/* ------------------------------------------------------------------ */

export const SOURCE_TYPES = [
  "government_statistics",
  "police",
  "government_information",
  "university",
  "transport_authority",
  "other",
] as const;

export type CityReferenceSourceType = (typeof SOURCE_TYPES)[number];

/**
 * Chat のプロンプトに出す出典の種別表記。「公的な犯罪統計」と「大学の試算」を
 * 同じ重みで語らせないために、種別ごとに言い方を固定する。
 */
export const SOURCE_TYPE_LABELS: Record<CityReferenceSourceType, string> = {
  government_statistics: "公的統計",
  police: "州警察の公表情報",
  government_information: "政府の公式情報",
  university: "大学が公表している試算",
  transport_authority: "公共交通機関の公式情報",
  other: "その他の公開情報",
};

export function isSourceType(value: unknown): value is CityReferenceSourceType {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}

export type CityReferenceSource = {
  sourceName: string;
  sourceUrl: string;
  sourceType: CityReferenceSourceType;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  note: string | null;
};

/** details.estimates に入る、出典ごとの金額レンジ（平均せずそのまま持つ）。 */
export type CityReferenceEstimate = {
  sourceName: string;
  label: string;
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
  basis: string | null;
};

export type CityReferenceEntry = {
  id: string;
  cityKey: CityKey;
  countryCode: string;
  adminArea: string | null;
  category: CityReferenceCategory;
  summary: string;
  notes: string | null;
  estimates: CityReferenceEstimate[];
  reviewedAt: string;
  sources: CityReferenceSource[];
};

/* ------------------------------------------------------------------ */
/* 鮮度（固定の staleness ルールは作らない）                            */
/* ------------------------------------------------------------------ */

/**
 * 「何ヶ月以上前の確認なら、より慎重な言い方にするか」の目安を **category ごと**に持つ。
 * 情報の種類で更新頻度が違うため、全 category 共通の「30日で stale」のような固定ルールは作らない。
 * ここでの値は、実際の公表頻度を調べたうえで決めている:
 *   - transport … 運賃は制度変更で変わり得る（例: QLD の運賃制度変更）。短め。
 *   - safety    … 州の犯罪統計は四半期〜年次公表。
 *   - housing / food / utilities / everyday … ABS の CPI は月次・四半期だが、大学等の
 *     生活費ガイドは年次更新が中心。
 * この値は**表示上の言い方を慎重にするためだけ**に使い、データの除外には使わない
 * （古い情報を隠すのではなく、古いことを伝えたうえで使う）。
 */
export const REVIEW_CAUTION_MONTHS: Record<CityReferenceCategory, number> = {
  safety: 12,
  housing: 12,
  food: 12,
  transport: 6,
  utilities: 12,
  everyday: 12,
};

const MONTH_MS = (1000 * 60 * 60 * 24 * 365.25) / 12;

/** reviewed_at からの経過月数。日付が不正なら null。 */
export function monthsSinceReview(entry: CityReferenceEntry, now: Date = new Date()): number | null {
  const reviewed = new Date(`${entry.reviewedAt}T00:00:00Z`).getTime();
  if (Number.isNaN(reviewed)) return null;
  return (now.getTime() - reviewed) / MONTH_MS;
}

/** その category の目安を超えて確認が古いか（言い方を慎重にするかの判断）。 */
export function needsReviewCaution(entry: CityReferenceEntry, now: Date = new Date()): boolean {
  const months = monthsSinceReview(entry, now);
  if (months === null) return true;
  return months > REVIEW_CAUTION_MONTHS[entry.category];
}

/* ------------------------------------------------------------------ */
/* 比較可能性（§12）                                                    */
/* ------------------------------------------------------------------ */

/**
 * 治安について複数都市を比べられるか。州をまたぐ場合、犯罪統計の集計機関・罪種の定義・
 * 公表期間・地理的境界が違うため、**単純比較はできない**ものとして扱う。
 */
export function isSafetyComparable(cityKeys: CityKey[]): boolean {
  if (cityKeys.length < 2) return true;
  const areas = new Set(cityKeys.map((k) => CITY_ADMIN_AREA[k]));
  return areas.size === 1;
}
