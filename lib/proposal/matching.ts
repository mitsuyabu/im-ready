/**
 * hardFilter / buildFitHints で共有する、自由記述テキストの決定論的な照合ヘルパー。
 *
 * ここでのマッチングはすべて単純なキーワード一致であり、意味の推測や補完は行わない。
 * 判定に自信が持てない場合は null（＝「わからない」）を返し、呼び出し側で
 * 「絞らず素通し」「unknown扱い」に倒すことを前提にしている。
 */

import type { CourseCategory } from "@/lib/data/schools";

/** 都市名の自由記述同士を緩く比較する（部分一致・大小文字を無視） */
export function cityMatches(preferredCity: string, schoolCity: string): boolean {
  const a = preferredCity.trim().toLowerCase();
  const b = schoolCity.trim().toLowerCase();
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

const COURSE_CATEGORY_KEYWORDS: Record<CourseCategory, string[]> = {
  exam_preparation: ["ielts", "toefl", "toeic", "試験", "ケンブリッジ", "cambridge"],
  business_english: ["ビジネス", "business"],
  academic_pathway: ["進学", "大学", "パスウェイ", "pathway"],
  general_english: [],
};

const NO_PREFERENCE_PHRASES = ["こだわらない", "こだわりはない", "なんでもいい", "何でもいい", "特になし", "未定", "問わない"];

/**
 * カルテの自由記述（schoolPrefs.courseType 等）から希望コース種別を推定する。
 * - テキストが空、または「こだわらない」等の無希望表現を含む場合は null（判定しない）。
 * - 複数カテゴリのキーワードが同時にマッチする場合も、単一に絞れないため null。
 * - いずれのキーワードにも一致しない場合は "general_english" にフォールバックする
 *   （指示どおりの既定値。これも判定結果の一つであり、絞り込みに使ってよい）。
 */
export function detectCourseCategory(text: string | null): CourseCategory | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (NO_PREFERENCE_PHRASES.some((p) => normalized.includes(p))) return null;

  const matched = (Object.keys(COURSE_CATEGORY_KEYWORDS) as CourseCategory[]).filter(
    (category) =>
      category !== "general_english" &&
      COURSE_CATEGORY_KEYWORDS[category].some((kw) => normalized.includes(kw)),
  );

  if (matched.length > 1) return null; // 複数一致＝曖昧なので判定しない
  if (matched.length === 1) return matched[0];
  return "general_english";
}

/**
 * 2つの自由記述の集合（カルテの重視点・学校のタグ等）から、キーワードの部分一致で
 * 関連していそうなものだけを拾う。順位付け・スコアリングはしない（一致有無の列挙のみ）。
 */
export function findRelatedTags(priorities: string[], tags: string[]): string[] {
  const related = new Set<string>();
  for (const tag of tags) {
    const normalizedTag = tag.toLowerCase();
    for (const priority of priorities) {
      const normalizedPriority = priority.toLowerCase();
      if (!normalizedPriority) continue;
      if (normalizedTag.includes(normalizedPriority) || normalizedPriority.includes(normalizedTag)) {
        related.add(tag);
        break;
      }
      // 短い単語単位でも緩く一致を見る（日本語の助詞混じり文への対応）
      const words = normalizedPriority.split(/[\s・、。,]+/).filter((w) => w.length >= 2);
      if (words.some((w) => normalizedTag.includes(w))) {
        related.add(tag);
        break;
      }
    }
  }
  return [...related];
}
