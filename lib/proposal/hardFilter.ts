/**
 * 提案パイプライン 第1層: ハードフィルタ。
 *
 * 純粋なコード。点数は付けず、「合う/合わない」で候補を除外するだけ。
 * - 希望都市が指定されていれば、city が一致しない学校を除外。
 * - コース種別の希望があれば、courseCategories に含まれない学校を除外。
 *   ただし courseCategories 自体が未入力（データが無い）学校は「該当するか不明」として
 *   除外しない（budget と同じく、空欄を理由に落とさない）。
 * - 予算は今回フィルタしない（為替換算を行わないため）。全校 budgetStatus="unknown" のまま通す。
 *   換算・予算判定は第3層に委ねる。
 * - カルテに希望が無い条件はフィルタしない（未指定は素通し）。
 *
 * 除外された学校も、理由付きで excluded に保持する。第3層が「生存0〜1件のときの参考候補」を
 * 選ぶのに使う（点数化はしない。あくまで除外理由の記録）。
 */

import type { Karte } from "@/lib/karte";
import type { School } from "@/lib/data/schools";
import { cityMatches, detectCourseCategory } from "./matching";

/**
 * 予算判定。今回は為替換算をしないため常に "unknown"。
 * 型として "within" / "over_removed" を残しているのは、将来換算ロジックを足したときに
 * この形のまま差し替えられるようにするため（今回は使わない）。
 */
export type BudgetStatus = "within" | "over_removed" | "unknown";

export type ExclusionReason = "city" | "courseCategory";

export interface HardFilterSurvivor {
  school: School;
  budgetStatus: BudgetStatus;
}

export interface ExcludedSchool {
  school: School;
  reason: ExclusionReason;
}

export interface HardFilterResult {
  survivors: HardFilterSurvivor[];
  /** 除外された学校（理由付き）。参考候補選定に使う */
  excluded: ExcludedSchool[];
  /** 除外件数の内訳（ログ・デバッグ用の集計。excluded から導出したもの） */
  excludedCounts: {
    city: number;
    courseCategory: number;
    /** 今回は予算での除外を行わないため常に 0 */
    budget: number;
  };
  totalInput: number;
}

export function hardFilter(karte: Karte, schools: School[]): HardFilterResult {
  const preferredCity = karte.schoolPrefs.preferredCity.value;
  const courseCategory = detectCourseCategory(karte.schoolPrefs.courseType.value);

  const survivors: HardFilterSurvivor[] = [];
  const excluded: ExcludedSchool[] = [];

  for (const school of schools) {
    if (preferredCity && !cityMatches(preferredCity, school.city)) {
      excluded.push({ school, reason: "city" });
      continue;
    }

    if (courseCategory && school.courseCategories && !school.courseCategories.includes(courseCategory)) {
      excluded.push({ school, reason: "courseCategory" });
      continue;
    }

    // 予算(方針②): 為替レートを決め打ちしないため、フィルタでは判定しない。全件 unknown で通す。
    survivors.push({ school, budgetStatus: "unknown" });
  }

  return {
    survivors,
    excluded,
    excludedCounts: {
      city: excluded.filter((e) => e.reason === "city").length,
      courseCategory: excluded.filter((e) => e.reason === "courseCategory").length,
      budget: 0,
    },
    totalInput: schools.length,
  };
}

/**
 * 生存0〜1件のときの「参考候補」を、除外リストから選ぶ。
 * - 都市自体が希望と外れた学校（reason: "city"）は参考候補にも出さない。
 * - 都市は合う（reason: "courseCategory"、または希望都市が未指定でコース理由のみで
 *   除外された）学校を優先して拾う。
 * - 無理に件数を揃えない。該当が無ければ空配列を返す。
 */
export function pickReferenceCandidates(result: HardFilterResult, limit: number): School[] {
  return result.excluded
    .filter((e) => e.reason !== "city")
    .slice(0, limit)
    .map((e) => e.school);
}
