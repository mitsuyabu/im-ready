/**
 * 都市別 生活費データ（構造化）
 *
 * 数値の唯一の出所はこのファイル。lib/knowledge.ts はここから文章を生成する。
 * 数値を直すときは該当レコードを編集し fetchedAt を更新するだけでよい。
 *
 * データ運用ルール（README も参照）:
 * - Numbeo のデータ（スクレイピング・手入力を問わず）は使用しないこと。
 *   Numbeo は商用利用をデータライセンス契約者に限定しており、手入力で写した数値でも
 *   同じ制限を受ける。
 * - 使ってよいのは (a) 各国政府・州政府・大学等の公式サイトで公開されている数値、
 *   または (b) Numbeo の API/Data License を契約して得た数値のみ。
 * - confidence: "official" は政府・大学等の一次情報から直接取得したもの。
 *   "secondary" は一次情報に到達できず、検索エンジンの要約や二次情報源に頼った
 *   暫定値。次回データ更新時に一次情報での再確認を優先すること。
 */

export type Currency = "AUD";
export type Period = "week" | "month" | "meal" | "year";

export interface MoneyRange {
  min: number;
  max: number;
  period: Period;
}

export interface CityCostOfLiving {
  /** 安定ID。都市名は世界で一意ではないため国コード付きで持つ（例: sydney-au） */
  citySlug: string;
  country: string;
  city: string;
  currency: Currency;
  /** 家賃（シェアハウス〜学生向け住居の実勢レンジ） */
  rent: MoneyRange;
  /** 食費（自炊中心の目安） */
  food?: MoneyRange;
  /** 外食1食あたり */
  eatingOut?: MoneyRange;
  /** 交通費 */
  transport?: MoneyRange;
  /** 州の平均週収（税引前、ABS統計。都市単位ではなく州単位の参考値） */
  stateAvgWeeklyEarningsPreTaxAUD?: number;
  /** 街の特徴（編集者による説明文。数値データではないためライセンス上の制約対象外） */
  characteristics: string;
  /** 向いている人 */
  suitedFor: string;
  /** 出所（機関名） */
  source: string;
  sourceUrl: string;
  /** データ取得日（ISO日付） */
  fetchedAt: string;
  /** 一次情報から直接取得できたか */
  confidence: "official" | "secondary";
  /** データの限界・注記（州全体の値を代用、等） */
  notes?: string;
}

/** 学生ビザ（サブクラス500）の資金要件。全都市共通の国レベルの値なので都市レコードとは分離して持つ */
export const AUSTRALIA_STUDENT_VISA_MIN_LIVING_COST = {
  amount: 29710,
  currency: "AUD" as Currency,
  period: "year" as Period,
  source: "オーストラリア内務省（Department of Home Affairs）学生ビザ（サブクラス500）資金要件",
  sourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
  fetchedAt: "2026-07-16",
  confidence: "official" as const,
};

export const AUSTRALIA_CITIES: CityCostOfLiving[] = [
  {
    citySlug: "sydney-au",
    country: "オーストラリア",
    city: "シドニー",
    currency: "AUD",
    rent: { min: 980, max: 3500, period: "month" },
    food: { min: 1000, max: 2500, period: "month" },
    transport: { min: 130, max: 800, period: "month" },
    stateAvgWeeklyEarningsPreTaxAUD: 2084,
    characteristics:
      "オーストラリア最大の都市。語学学校・就職先が最も多い。物価は高め",
    suitedFor: "キャリアアップ・就労志向・大都市が好きな人",
    source: "University of Sydney（公式サイト）",
    sourceUrl:
      "https://www.sydney.edu.au/study/fees-and-loans/other-costs/living-costs.html",
    fetchedAt: "2026-07-16",
    confidence: "official",
  },
  {
    citySlug: "melbourne-au",
    country: "オーストラリア",
    city: "メルボルン",
    currency: "AUD",
    rent: { min: 150, max: 400, period: "week" },
    food: { min: 80, max: 120, period: "week" },
    transport: { min: 35, max: 45, period: "week" },
    stateAvgWeeklyEarningsPreTaxAUD: 2013.7,
    characteristics:
      "文化・アートの都。カフェ文化・住みやすさで毎年世界上位。語学学校も多い",
    suitedFor: "都会的な生活・文化・アートが好きな人、長期滞在",
    source:
      "Study Melbourne（ビクトリア州政府公式サイト）※直接アクセス不可のため検索エンジン経由の要約情報を暫定使用",
    sourceUrl:
      "https://studymelbourne.vic.gov.au/living-here/money-and-budgeting/cost-of-living-calculator",
    fetchedAt: "2026-07-16",
    confidence: "secondary",
    notes:
      "公式ページへの直接アクセスができず（403）、検索結果の要約情報を暫定利用。次回更新時に一次情報を直接確認すること。",
  },
  {
    citySlug: "brisbane-au",
    country: "オーストラリア",
    city: "ブリスベン",
    currency: "AUD",
    rent: { min: 150, max: 600, period: "week" },
    food: { min: 60, max: 150, period: "week" },
    eatingOut: { min: 15, max: 40, period: "meal" },
    stateAvgWeeklyEarningsPreTaxAUD: 1994.5,
    characteristics:
      "温暖な気候。2032年五輪開催予定で開発が進む。シドニーより物価が低め",
    suitedFor: "温暖な気候が好き・コストパフォーマンス重視・アクティブな人",
    source: "Study Queensland（クイーンズランド州政府公式サイト）",
    sourceUrl: "https://www.studyqueensland.qld.gov.au/live/living-expenses",
    fetchedAt: "2026-07-16",
    confidence: "official",
    notes:
      "州公式サイトに都市別の内訳がないため、クイーンズランド州全体の目安値をブリスベンの参考値として使用。",
  },
  {
    citySlug: "goldcoast-au",
    country: "オーストラリア",
    city: "ゴールドコースト",
    currency: "AUD",
    rent: { min: 200, max: 400, period: "week" },
    stateAvgWeeklyEarningsPreTaxAUD: 1994.5,
    characteristics:
      "ビーチリゾート。観光・アクティビティが充実。日本人が多め",
    suitedFor: "ビーチ・サーフィン・リゾート生活が好きな人",
    source: "Bond University（公式サイト）",
    sourceUrl:
      "https://bond.edu.au/fees-and-finance-options/additional-costs-to-consider/living-costs",
    fetchedAt: "2026-07-16",
    confidence: "official",
    notes:
      "Bond University公式ページ記載のシェア/オンキャンパス想定家賃レンジ。都市全体の網羅的統計ではない。",
  },
  {
    citySlug: "cairns-au",
    country: "オーストラリア",
    city: "ケアンズ",
    currency: "AUD",
    rent: { min: 480, max: 1760, period: "month" },
    stateAvgWeeklyEarningsPreTaxAUD: 1994.5,
    characteristics:
      "グレートバリアリーフへの拠点。観光業が盛ん。コンパクトな街",
    suitedFor:
      "自然・海・ダイビングが好きな人、セカンドワーホリ希望者（農業・観光業の仕事あり）",
    source:
      "James Cook University 関連の二次情報（公式サイトに詳細な内訳の掲載なし）",
    sourceUrl:
      "https://www.jcu.edu.au/students/fees-and-financial-support/international-students",
    fetchedAt: "2026-07-16",
    confidence: "secondary",
    notes:
      "JCU公式サイトに生活費の詳細な内訳が掲載されておらず、二次情報源の集計値を暫定使用。次回更新時に一次情報を要再確認。",
  },
  {
    citySlug: "perth-au",
    country: "オーストラリア",
    city: "パース",
    currency: "AUD",
    rent: { min: 294, max: 659, period: "week" },
    food: { min: 70, max: 90, period: "week" },
    transport: { min: 5, max: 35, period: "week" },
    stateAvgWeeklyEarningsPreTaxAUD: 2303.6,
    characteristics:
      "西オーストラリア州の州都。時差がシドニーより3時間遅い。日本人が少なく英語漬けになれる",
    suitedFor: "日本人が少ない環境・英語上達優先・自然が好きな人",
    source: "StudyPerth（西オーストラリア州政府系公式サイト）",
    sourceUrl: "https://www.studyperth.com.au/living-in-perth/cost-of-living/",
    fetchedAt: "2026-07-16",
    confidence: "official",
  },
];
