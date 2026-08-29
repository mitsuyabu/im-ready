/**
 * SchoolComparisonView の 1 criterion × 1 candidate school について、
 * **決定的に説明できる場合だけ** fit 判定を返す pure function（Step 24）。
 * Anthropic・Web・Places・外部地理知識・辞書・為替 は一切使わない。入力に無いことは推測しない。
 *
 * 判定できないもの（budget、意味を安全に解釈できない自由文条件、対象外の block）は null を返す。
 * 「条件に合っていない」という独立 verdict は作らない（二値判定を過剰に精密に見せないため）。
 * 明確に一致しない場合も "check" ＋ basis で差を見せ、本人の判断に委ねる。
 */

import type {
  SchoolComparisonCriterion,
  SchoolComparisonSchool,
} from "@/lib/schoolComparisonView";
import type { AccommodationOption, CourseCategory } from "@/lib/data/schools";

export type SchoolFitVerdict = "match" | "check" | "no_data";

export type SchoolFitResult = {
  verdict: SchoolFitVerdict;
  /** なぜその verdict なのか（本人条件 × 学校事実 の対応）。数値 score は持たない。 */
  basis: string;
};

/** 外部の地理知識・都市辞書は使わない、最低限の文字列正規化のみ。 */
function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

function present(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function anyPresent(...vals: unknown[]): boolean {
  return vals.some(present);
}

const COURSE_CATEGORY_VALUES = new Set<string>([
  "general_english",
  "exam_preparation",
  "business_english",
  "academic_pathway",
] satisfies CourseCategory[]);

const ACCOMMODATION_VALUES = new Set<string>([
  "dormitory",
  "homestay",
  "not_arranged",
] satisfies AccommodationOption[]);

function courseSummary(facts: SchoolComparisonSchool["facts"]): string {
  if (facts.courses && facts.courses.length > 0) return facts.courses.join("、");
  if (facts.courseCategories && facts.courseCategories.length > 0) {
    return facts.courseCategories.join("、");
  }
  return "";
}

function accommodationSummary(facts: SchoolComparisonSchool["facts"]): string {
  const parts: string[] = [];
  if (facts.accommodationOptions && facts.accommodationOptions.length > 0) {
    parts.push(facts.accommodationOptions.join("、"));
  }
  if (present(facts.accommodationNote)) parts.push(facts.accommodationNote as string);
  return parts.join("／");
}

/** 学校側に関連データが「存在するか」だけを見て check / no_data を返す共通処理（自由文の意味判定はしない）。 */
function dataPresenceCheck(
  criterion: SchoolComparisonCriterion,
  hasData: boolean,
  shortSchoolData: string,
  missingLabel: string,
): SchoolFitResult {
  if (!hasData) {
    return { verdict: "no_data", basis: `学校の${missingLabel}情報がありません` };
  }
  return {
    verdict: "check",
    basis: shortSchoolData
      ? `希望：${criterion.value}／学校データ：${shortSchoolData}`
      : `希望：${criterion.value}／学校データを確認してください`,
  };
}

function cityFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult {
  const got = school.city;
  if (!present(got)) {
    return { verdict: "no_data", basis: "学校所在地の情報がありません" };
  }
  if (norm(criterion.value) === norm(got as string)) {
    return { verdict: "match", basis: `希望：${criterion.value}／学校：${got}` };
  }
  // 文字列として一致しない＝「条件に合わない」とは断定しない。差を見せて本人判断へ。
  return { verdict: "check", basis: `希望都市：${criterion.value}／学校所在地：${got}` };
}

function pathwayFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult {
  const has = school.facts.hasPathway;
  if (has === undefined) {
    return { verdict: "no_data", basis: "学校の進学パスウェイ提携の情報がありません" };
  }
  // criterion.value は getKarteSummaryItems により boolean が "あり" / "なし" へ文字列化されている。
  const wantsPathway = criterion.value === "あり";
  if (!wantsPathway) {
    // 本人が進学を希望していない場合、hasPathway の真偽で match/合致判定をしない。
    return {
      verdict: "check",
      basis: `本人は進学を希望していない／学校の進学パスウェイ提携：${has ? "あり" : "なし"}`,
    };
  }
  if (has) {
    return { verdict: "match", basis: "本人は進学を希望／学校に進学パスウェイ提携あり" };
  }
  return { verdict: "check", basis: "本人は進学を希望／学校に進学パスウェイ提携なし" };
}

function courseTypeFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult {
  const wantCanonical = norm(criterion.value);
  if (
    COURSE_CATEGORY_VALUES.has(wantCanonical) &&
    school.facts.courseCategories?.some((c) => norm(c) === wantCanonical)
  ) {
    return { verdict: "match", basis: `希望コース区分：${criterion.value}／学校の対応区分に含まれています` };
  }
  if (anyPresent(school.facts.courses, school.facts.courseCategories)) {
    return {
      verdict: "check",
      basis: `希望：${criterion.value}／学校のコース：${courseSummary(school.facts)}`,
    };
  }
  return { verdict: "no_data", basis: "学校のコース情報がありません" };
}

function accommodationFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult {
  const wantCanonical = norm(criterion.value);
  if (
    ACCOMMODATION_VALUES.has(wantCanonical) &&
    school.facts.accommodationOptions?.some((a) => norm(a) === wantCanonical)
  ) {
    return { verdict: "match", basis: `希望の滞在形態：${criterion.value}／学校が対応しています` };
  }
  if (anyPresent(school.facts.accommodationOptions, school.facts.accommodationNote)) {
    return {
      verdict: "check",
      basis: `希望：${criterion.value}／学校の滞在：${accommodationSummary(school.facts)}`,
    };
  }
  return { verdict: "no_data", basis: "学校の滞在オプションの情報がありません" };
}

function avoidCountriesFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult | null {
  // criterion.value は string[] を "、" で join した文字列（getKarteSummaryItems の仕様）。
  // その区切りだけを最小限で reverse する（勝手な高度 parse はしない）。
  const avoid = criterion.value
    .split("、")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (avoid.length === 0) return null;

  const country = present(school.country) ? (school.country as string).trim() : "";
  if (country && avoid.includes(country)) {
    return { verdict: "check", basis: `避けたい国「${country}」に該当します` };
  }
  // 「避けたい国に入っていない」＝学校全体が条件に合う、ではない。範囲を限定した事実として match。
  return { verdict: "match", basis: `避けたい国（${avoid.join("、")}）には含まれていません` };
}

/**
 * criterion × school の fit を返す。安全に決定的判定できない場合は null。
 * budget.totalCap / budget.monthlyCap は必ず null（総予算 ≠ 学費・円 ≠ 現地通貨・為替換算禁止）。
 * timing.durationWeeks 等の対象外 key も null。
 */
export function computeFit(
  criterion: SchoolComparisonCriterion,
  school: SchoolComparisonSchool,
): SchoolFitResult | null {
  const key = `${criterion.block}.${criterion.key}`;
  switch (key) {
    case "schoolPrefs.preferredCity":
      return cityFit(criterion, school);
    case "language.pathwayIntent":
      return pathwayFit(criterion, school);
    case "schoolPrefs.courseType":
      return courseTypeFit(criterion, school);
    case "schoolPrefs.accommodation":
      return accommodationFit(criterion, school);
    case "schoolPrefs.sizeNationality":
      return dataPresenceCheck(
        criterion,
        anyPresent(
          school.facts.classSizeAvg,
          school.facts.classSizeMax,
          school.facts.classSizeNote,
          school.facts.japaneseRatio,
          school.facts.nationalityDiversity,
        ),
        [
          school.facts.classSizeNote,
          school.facts.japaneseRatio,
          school.facts.nationalityDiversity,
        ]
          .filter((v): v is string => present(v))
          .join("／"),
        "クラス規模・国籍構成の",
      );
    case "schoolPrefs.startFlexibility":
      return dataPresenceCheck(
        criterion,
        present(school.facts.intakeNote),
        present(school.facts.intakeNote) ? (school.facts.intakeNote as string) : "",
        "入学時期の",
      );
    case "language.selfLevel":
      return dataPresenceCheck(
        criterion,
        present(school.facts.levels),
        present(school.facts.levels) ? (school.facts.levels as string) : "",
        "対応レベルの",
      );
    case "constraints.avoidCountries":
      return avoidCountriesFit(criterion, school);
    case "budget.totalCap":
    case "budget.monthlyCap":
      return null;
    default:
      return null;
  }
}
