/**
 * ビザリファレンス（人間が公式情報を確認して蓄積したビザ・手続き情報）の型と純粋関数。
 *
 * 役割分担:
 *   - lib/knowledge.ts の VISA_SECTION … 正式データが無い間の安全な fallback（高レベルの大枠のみ）
 *   - visa_reference_data             … 出典と確認日を持つ正式データ。category 単位で必要時だけ読む
 *   - このファイル                     … その型・category 定義・鮮度の扱い（環境非依存）
 *
 * 方針:
 *   - 未確認の値は持たない（null のまま）。0 や推測で埋めない
 *   - 数値は必ず単位つきで details に持つ（summary の文章から数値を推測させない）
 *   - 417 と 462 を混同しない（visa_key にサブクラスまで含める）
 *   - 法律・移民・税務の個別助言はしない（境界は lib/visaReferenceContext.ts が prompt に書く）
 */

/* ------------------------------------------------------------------ */
/* ビザ種別                                                            */
/* ------------------------------------------------------------------ */

export const VISA_KEYS = [
  "australia_student_500",
  "australia_working_holiday_417",
  // 462（Work and Holiday）は schema 上は扱えるようにするが、初期 seed の対象にはしない。
  "australia_work_and_holiday_462",
] as const;

export type VisaKey = (typeof VISA_KEYS)[number];

export const VISA_META: Record<VisaKey, { code: string; name: string; labelJa: string }> = {
  australia_student_500: {
    code: "500",
    name: "Student visa (subclass 500)",
    labelJa: "学生ビザ（サブクラス500）",
  },
  australia_working_holiday_417: {
    code: "417",
    name: "Working Holiday visa (subclass 417)",
    labelJa: "ワーキングホリデービザ（サブクラス417）",
  },
  australia_work_and_holiday_462: {
    code: "462",
    name: "Work and Holiday visa (subclass 462)",
    labelJa: "ワークアンドホリデービザ（サブクラス462）",
  },
};

export function isVisaKey(value: unknown): value is VisaKey {
  return typeof value === "string" && (VISA_KEYS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* category                                                            */
/* ------------------------------------------------------------------ */

export const VISA_CATEGORIES = [
  "eligibility",
  "stay",
  "study_rights",
  "work_rights",
  "same_employer",
  "application",
  "documents",
  "costs",
  "processing",
  "second_third",
  "specified_work",
  "health_insurance",
  "financial_capacity",
  "genuine_student",
  "arrival_preparation",
] as const;

export type VisaCategory = (typeof VISA_CATEGORIES)[number];

export const VISA_CATEGORY_LABELS: Record<VisaCategory, string> = {
  eligibility: "申請資格",
  stay: "滞在できる期間",
  study_rights: "就学の条件",
  work_rights: "就労の条件",
  same_employer: "同一雇用主での就労",
  application: "申請の流れ",
  documents: "必要書類",
  costs: "申請料",
  processing: "審査期間",
  second_third: "セカンド・サード",
  specified_work: "specified work（指定された仕事）",
  health_insurance: "健康保険（OSHC）",
  financial_capacity: "資金要件",
  genuine_student: "Genuine Student requirement",
  arrival_preparation: "渡航までの準備",
};

export function isVisaCategory(value: unknown): value is VisaCategory {
  return typeof value === "string" && (VISA_CATEGORIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* 出典                                                                */
/* ------------------------------------------------------------------ */

export const VISA_SOURCE_TYPES = [
  "home_affairs",
  "study_australia",
  "fair_work",
  "ato",
  "education",
  "other_government",
] as const;

export type VisaSourceType = (typeof VISA_SOURCE_TYPES)[number];

/**
 * prompt に出す出典の種別表記。一次情報（Home Affairs）と補助的な案内を
 * Chat が同じ重みで語らないように、言い方を固定する。
 */
export const VISA_SOURCE_TYPE_LABELS: Record<VisaSourceType, string> = {
  home_affairs: "Department of Home Affairs（ビザ制度の一次情報）",
  study_australia: "Study Australia（オーストラリア政府の留学情報）",
  fair_work: "Fair Work Ombudsman（労働条件の公的機関）",
  ato: "Australian Taxation Office（税務の公的機関）",
  education: "Department of Education（政府）",
  other_government: "その他の政府機関",
};

/** 一次情報（Home Affairs）かどうか。Chat の言い方を変えるために使う。 */
export function isPrimarySource(sourceType: VisaSourceType): boolean {
  return sourceType === "home_affairs";
}

export function isVisaSourceType(value: unknown): value is VisaSourceType {
  return typeof value === "string" && (VISA_SOURCE_TYPES as readonly string[]).includes(value);
}

export type VisaReferenceSource = {
  sourceName: string;
  sourceUrl: string;
  sourceType: VisaSourceType;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  accessedAt: string | null;
};

export type VisaReferenceEntry = {
  id: string;
  visaKey: VisaKey;
  visaCode: string;
  visaName: string;
  countryCode: string;
  category: VisaCategory;
  summary: string;
  /** 構造化した制度条件。数値の正本（単位つき）。 */
  details: Record<string, unknown>;
  reviewedAt: string;
  sources: VisaReferenceSource[];
};

/* ------------------------------------------------------------------ */
/* 鮮度                                                                */
/* ------------------------------------------------------------------ */

/**
 * ビザは変動性が高いため、**6ヶ月**を超えて確認していない entry には
 * 「再確認推奨」を Chat のコンテキストへ添える（自動削除はしない）。
 */
export const VISA_REVIEW_CAUTION_MONTHS = 6;

const MONTH_MS = (1000 * 60 * 60 * 24 * 365.25) / 12;

export function monthsSinceVisaReview(entry: VisaReferenceEntry, now: Date = new Date()): number | null {
  const reviewed = new Date(`${entry.reviewedAt}T00:00:00Z`).getTime();
  if (Number.isNaN(reviewed)) return null;
  return (now.getTime() - reviewed) / MONTH_MS;
}

/** 再確認を促すべきか（確認日が不正・不明な場合も true 側に倒す）。 */
export function needsVisaReviewCaution(entry: VisaReferenceEntry, now: Date = new Date()): boolean {
  const months = monthsSinceVisaReview(entry, now);
  if (months === null) return true;
  return months > VISA_REVIEW_CAUTION_MONTHS;
}

/* ------------------------------------------------------------------ */
/* details の読み取り（単位を落とさないための helper）                   */
/* ------------------------------------------------------------------ */

/** 就労時間の条件。単位を必ず保持する（週単位へ勝手に換算させない）。 */
export type WorkHourLimit = {
  limit: number;
  /** 'hours_per_fortnight' | 'hours_per_week' 等。prompt では必ずこの単位で表示する。 */
  unit: string;
  /** 'study_terms' | 'breaks' 等、どの期間に適用されるか。 */
  during: string | null;
  exceptions: { appliesTo: string; note: string }[];
};

export function readWorkHourLimit(details: Record<string, unknown>): WorkHourLimit | null {
  const limit = typeof details.limit === "number" && Number.isFinite(details.limit) ? details.limit : null;
  const unit = typeof details.unit === "string" && details.unit.length > 0 ? details.unit : null;
  // 単位の無い数値は使わない（意味が確定しないため）。
  if (limit === null || unit === null) return null;
  const exceptions: { appliesTo: string; note: string }[] = [];
  if (Array.isArray(details.exceptions)) {
    for (const raw of details.exceptions) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const appliesTo = typeof e.appliesTo === "string" ? e.appliesTo : null;
      const note = typeof e.note === "string" ? e.note : null;
      if (!appliesTo || !note) continue;
      exceptions.push({ appliesTo, note });
    }
  }
  return {
    limit,
    unit,
    during: typeof details.during === "string" ? details.during : null,
    exceptions,
  };
}

/** 金額の条件。通貨・単位・「から」などの基準を保持する。 */
export type MoneyFact = {
  amount: number;
  currency: string;
  /** 'from'（〜から）/ 'exact'（確定額）/ 'minimum' 等。 */
  basis: string | null;
  /** 'application' / 'year' 等、何あたりの金額か。 */
  per: string | null;
  effectiveFrom: string | null;
};

export function readMoneyFact(details: Record<string, unknown>): MoneyFact | null {
  const amount = typeof details.amount === "number" && Number.isFinite(details.amount) ? details.amount : null;
  const currency = typeof details.currency === "string" && /^[A-Z]{3}$/.test(details.currency) ? details.currency : null;
  // 通貨の無い金額は使わない（円と豪ドルの混同を防ぐ）。
  if (amount === null || currency === null) return null;
  return {
    amount,
    currency,
    basis: typeof details.basis === "string" ? details.basis : null,
    per: typeof details.per === "string" ? details.per : null,
    effectiveFrom: typeof details.effectiveFrom === "string" ? details.effectiveFrom : null,
  };
}

/** 箇条書きで渡したい事実（必要書類のグループ等）。 */
export function readFactList(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}
