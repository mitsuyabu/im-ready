/**
 * Plan Home Hero 直下の「都市ガイド」カードで使う、都市の魅力の**固定文**。
 *
 * - deterministic（AI 生成しない・DB に保存しない）
 * - MVP は lib/planCover.ts の resolvePlanCoverKey が返す 6 都市キーのみ
 * - 未対応都市 / 都市未設定では description を捏造しない（null を返す）
 * - 「必ず」「絶対」「仕事が見つかる」等の保証表現は使わない
 */

import { resolvePlanCoverKey } from "@/lib/planCover";

/** キーは lib/planCover.ts の PlanCoverKey と 1:1。 */
export const CITY_GUIDES = {
  sydney: {
    description:
      "シドニーは都市の利便性と海辺の開放感をどちらも楽しめる街です。英語を学びながら、仕事や観光など幅広い経験をしたい方に向いています。",
  },
  melbourne: {
    description:
      "メルボルンはカフェやアート、スポーツなど多彩な文化が魅力の街です。落ち着いた都市環境で、英語を学びながら現地らしい生活を楽しめます。",
  },
  brisbane: {
    description:
      "ブリスベンは温暖な気候と穏やかな雰囲気が魅力の街です。都市の便利さを保ちながら、比較的ゆったりとした環境で留学生活を送りたい方に向いています。",
  },
  goldcoast: {
    description:
      "ゴールドコーストは美しいビーチと開放的な雰囲気が魅力です。英語を学びながら、自然や観光、アルバイトなども楽しみたい方に向いています。",
  },
  cairns: {
    description:
      "ケアンズは豊かな自然と温暖な気候が魅力の街です。都市部とは少し違う環境で、英語を学びながら自然や観光を楽しみたい方に向いています。",
  },
  perth: {
    description:
      "パースは美しい海と落ち着いた都市環境が魅力です。比較的ゆったりした雰囲気の中で、英語学習と現地生活をバランスよく楽しめます。",
  },
} as const satisfies Record<string, { description: string }>;

/**
 * 表示用の自由記述 city 文字列（説明文が続くことがある）から、既存の都市キー解決
 * （resolvePlanCoverImage と同じ resolvePlanCoverKey）を再利用して固定の都市説明を返す。
 * 対応が無ければ null。
 */
export function getCityGuideDescription(city: string | null | undefined): string | null {
  const key = resolvePlanCoverKey(city);
  if (!key) return null;
  return CITY_GUIDES[key]?.description ?? null;
}
