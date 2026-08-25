/**
 * 提案パイプライン 第2層: フィット指標（事実の要約）。
 *
 * 順位付けはしない。点数（合計・パーセント）も出さない。第3層（未実装）でLLMが候補を選ぶ際に
 * 読む「事実の手がかり」を、カルテと学校データから機械的に作るだけ。
 *
 * データが無い項目は必ず "unknown" にする（推測で埋めない）。これにより、第3層のLLMが
 * 「unknownを根拠に語る」ことを防ぐ土台にする。
 *
 * 評価・レビュー数（rating/userRatingCount）はここでは一切使わない
 * （表示時に Places から実行時取得する方針のため）。
 */

import type { Karte } from "@/lib/karte";
import type { CourseCategory, FeeRange } from "@/lib/data/schools";
import type { BudgetStatus, HardFilterSurvivor } from "./hardFilter";
import { detectCourseCategory, findRelatedTags } from "./matching";

/**
 * 予算の手がかり。方針②により為替換算はしない。
 * 学校の週授業料(AUD)とカルテの予算(円)を、変換せずそのまま並べるだけ。
 * 金額の大小比較・換算判断は第3層に委ねる。
 */
export interface BudgetHint {
  tuitionWeeklyAUD: FeeRange | "unknown";
  karteTotalCapJPY: number | "unknown";
  karteMonthlyCapJPY: number | "unknown";
}

/**
 * 語学レベルの手がかり。自由記述同士の一致判定は信頼性が低いため、
 * "合っている/いない" を機械的に判定するのではなく、両方の生データをそのまま並べるだけにする。
 */
export interface LevelHint {
  karteLevel: string | "unknown";
  schoolLevels: string;
}

export interface SchoolFitHints {
  schoolSlug: string;
  /** 第1層(hardFilter)の結果。今回は常に "unknown"（方針②） */
  budgetStatus: BudgetStatus;
  budgetHint: BudgetHint;
  /** 「レベルが合うか」の判定ではなく、カルテのレベルと学校のレベル記載を並べた事実 */
  levelHint: LevelHint | "unknown";
  japaneseRatioHint: string | "unknown";
  /** 希望コース種別のうち、学校の courseCategories と一致したもの（空配列＝一致なしという事実） */
  courseHints: CourseCategory[] | "unknown";
  /** School型にある範囲（hasPathway, accommodationOptions）だけを事実として拾う */
  supportHints: string[] | "unknown";
  /** 学校のtagsのうち、カルテの重視点とキーワードが関連しそうなもの（空配列＝関連なしという事実） */
  tagHints: string[] | "unknown";
}

export function buildFitHints(karte: Karte, survivors: HardFilterSurvivor[]): SchoolFitHints[] {
  const courseCategory = detectCourseCategory(karte.schoolPrefs.courseType.value);

  const priorities = [
    ...(karte.constraints.nonNegotiables.value ?? []),
    karte.lifestyle.cityVsNature.value,
    karte.lifestyle.climate.value,
    karte.lifestyle.safetyImportance.value,
    karte.lifestyle.priceSensitivity.value,
    karte.lifestyle.japaneseRatioPref.value,
  ].filter((v): v is string => !!v);

  return survivors.map(({ school, budgetStatus }): SchoolFitHints => {
    const budgetHint: BudgetHint = {
      tuitionWeeklyAUD: school.tuitionWeekly ?? "unknown",
      karteTotalCapJPY: karte.budget.totalCap.value ?? "unknown",
      karteMonthlyCapJPY: karte.budget.monthlyCap.value ?? "unknown",
    };

    const levelHint: LevelHint | "unknown" = school.levels
      ? { karteLevel: karte.language.selfLevel.value ?? "unknown", schoolLevels: school.levels }
      : "unknown";

    const japaneseRatioHint = school.japaneseRatio ?? "unknown";

    let courseHints: CourseCategory[] | "unknown" = "unknown";
    if (courseCategory && school.courseCategories) {
      courseHints = school.courseCategories.filter((c) => c === courseCategory);
    }

    const supportFacts: string[] = [];
    if (school.hasPathway !== undefined) {
      supportFacts.push(`進学パスウェイ: ${school.hasPathway ? "あり" : "なし"}`);
    }
    if (school.accommodationOptions && school.accommodationOptions.length > 0) {
      supportFacts.push(`滞在オプション: ${school.accommodationOptions.join(", ")}`);
    }
    const supportHints: string[] | "unknown" = supportFacts.length > 0 ? supportFacts : "unknown";

    let tagHints: string[] | "unknown" = "unknown";
    if (priorities.length > 0 && school.tags && school.tags.length > 0) {
      tagHints = findRelatedTags(priorities, school.tags);
    }

    return {
      schoolSlug: school.schoolSlug,
      budgetStatus,
      budgetHint,
      levelHint,
      japaneseRatioHint,
      courseHints,
      supportHints,
      tagHints,
    };
  });
}
