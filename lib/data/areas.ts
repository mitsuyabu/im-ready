/**
 * エリア（国・都市）構造化データ
 *
 * 提案パイプライン（lib/proposal/engine.ts、未実装）のハード足切り・LLM選定に使う「器」。
 * 生活費（家賃・食費等）はここでは持たない。既存の lib/data/cities.ts（CityCostOfLiving）を
 * citySlug をキーに参照する。cities.ts 自体は据え置き（このファイルからは読むだけで変更しない）。
 *
 * 治安データは Google Places から取得できないため、safetyTrend は編集者による監修値として持つ
 * （cities.ts の source/fetchedAt とは別ソース前提）。
 *
 * データ運用ルール（cities.ts, schools.ts と同様）:
 * - ビザ・治安・比率等の中身をAIが創作して埋めないこと。一次情報（政府・大学等の公式サイト）を出所にする。
 * - 変動しうる値には必ず source と fetchedAt を付ける。
 * - 特定の国に構造を限定しない。通貨・費用等の単位が国ごとに異なるため、固定リテラルではなく
 *   柔軟な自由記述 or string で持つ（cities.ts 側の Currency="AUD" 固定は据え置きでよいが、
 *   このファイルは複数国を想定した汎用構造にする）。
 */

import { AUSTRALIA_CITIES, type CityCostOfLiving } from "./cities";

/** 都市の規模感 */
export type CitySize = "major_city" | "regional";

export interface CountryArea {
  country: string;
  /** 通貨コード（例: "AUD"）。国ごとに異なるため固定リテラルにしない */
  currency: string;
  /** 学生ビザの就労可否・条件。国によって制度が大きく異なるため固定選択肢にせず自由記述で持つ */
  visaSummary: string;
  workingHolidayAvailable: boolean;
  /** ワーキングホリデーの年齢上限。制度が無い/不明な場合は省略 */
  workingHolidayAgeLimit?: number;
  /** 就労条件の概要（週の就労可能時間の上限等を含む自由記述） */
  workRightsSummary: string;
  /** 学費・生活費の大まかな目安（自由記述）。詳細な数値は cities.ts 側の一次情報を使う */
  costRange?: string;
  /** ビザ取得の難易度感（監修値。固定選択肢にせず自由記述） */
  visaDifficulty?: string;
  tags: string[];
  source: string;
  sourceUrl?: string;
  /** データ取得日（ISO日付） */
  fetchedAt: string;
}

export interface CityArea {
  /** 安定ID。cities.ts の CityCostOfLiving.citySlug と同じ値を使い、生活費データはそちら側を参照する */
  citySlug: string;
  /** どの国のエリアか（CountryArea.country と同じ値でリンクする） */
  country: string;
  city: string;
  /** 日本人比率の傾向（監修値。自由記述。例: "多め" "少なめ" "年々増加傾向"） */
  japaneseRatioTrend?: string;
  /** 治安の傾向（監修値。Google Placesからは取れないため編集者評価。別ソース前提） */
  safetyTrend?: string;
  climate?: string;
  citySize?: CitySize;
  /** 語学学習環境（日本人の少なさ・英語漬けになりやすいか等の自由記述） */
  languageEnvironment?: string;
  tags: string[];
  source: string;
  sourceUrl?: string;
  /** データ取得日（ISO日付） */
  fetchedAt: string;
}

// 実データ（値）は今回投入しない。オーストラリアの実データは人が後で監修して入れる。
export const COUNTRY_AREAS: CountryArea[] = [];
export const CITY_AREAS: CityArea[] = [];

/**
 * CityArea に対応する生活費データ（cities.ts）を citySlug で引く。
 * TODO: オーストラリア以外の国が cities.ts 側に追加されたら、対象の配列を横断検索するようにする
 * （現状 cities.ts のエクスポートは AUSTRALIA_CITIES のみのため、それだけを見ている）。
 */
export function getCityCostOfLiving(citySlug: string): CityCostOfLiving | undefined {
  return AUSTRALIA_CITIES.find((c) => c.citySlug === citySlug);
}
