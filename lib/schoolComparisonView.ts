/**
 * Plan Karte + すでに提示済みの候補校 + 学校マスタ → school_comparison（候補校比較 Document）
 * 生成の入力データへの変換レイヤー（Step 23）。
 * DB・Supabase・Anthropic・Web・Google Places へは一切アクセスしない pure function のみ。
 *
 * lib/documentsKarteView.ts / lib/myNoteView.ts / lib/studyPlanView.ts は import も拡張もしない。
 * school_comparison は「karte.proposals.presented（type="school"）× 学校マスタの解決」＋
 * 「学校比較に関係する stated 条件の抽出」という別の入力・別の安全基準が要る。共通の下位ロジック
 * （getKarteSummaryItems / getFieldLabel）は lib/karte.ts から直接再利用し、コピペはしない。
 *
 * このファイルが決める安全境界:
 *   - 比較してよい候補校: proposals.presented の type==="school" だけ。マスタ解決できたものだけ。
 *     area / agent / 新しい学校検索 / selectProposals 再実行 / マスタからの候補追加 は一切しない。
 *   - 表示してよい学校事実: School マスタの「Document 向け安全サブセット」だけ（SchoolComparisonFacts）。
 *     placeId / lat / lng / placeIdRefreshedAt / notes / tags / totalStudents / address は含めない。
 *     Google Places 由来（評価・写真・営業時間・googleMapsUri）は構造的に扱わない。
 *   - 比較軸にしてよい本人条件: 学校比較に関係する stated field だけ（inferred / unknown / conflict 中 は除外）。
 *   - conflict: 学校比較に関係する field の conflict のトピックのラベルだけ（値・source は持たない）。
 *   - unresolved candidate: マスタ解決できなかった slug を内部状態として記録（本文には出さない）。
 *   - 生成可否: 解決済みユニーク候補校 2 校以上 かつ userCriteria 1 件以上。
 *
 * fit 判定（city match / budget fit / pathway fit / no_data / check 等）・文章化・「情報なし」への
 * 変換・費用計算・表示表現は一切しない。それは Step 24 以降の formatter / fit の責務。
 */

import type { BlockName, Field, FieldSource, Karte } from "@/lib/karte";
import { getFieldLabel, getKarteSummaryItems } from "@/lib/karte";
import type {
  AccommodationOption,
  CourseCategory,
  FeeRange,
  School,
} from "@/lib/data/schools";

/**
 * Document に出してよい School マスタの安全サブセット。
 * 実在する School の optional field をそのまま（言い換えずに）コピーする。欠けている field は
 * undefined のまま（「情報なし」等の文字列変換は Step 24 formatter 側。View で表現とデータを混ぜない）。
 */
export type SchoolComparisonFacts = {
  courseCategories?: CourseCategory[];
  courses?: string[];
  intakeNote?: string;
  scheduleNote?: string;
  accommodationOptions?: AccommodationOption[];
  accommodationNote?: string;
  hasPathway?: boolean;
  pathwayNotes?: string;
  ageRange?: string;
  classSizeAvg?: number;
  classSizeMax?: number;
  classSizeNote?: string;
  tuitionWeekly?: FeeRange;
  tuitionWeeklyNote?: string;
  enrollmentFee?: FeeRange;
  enrollmentFeeNote?: string;
  materialFee?: FeeRange;
  materialFeeNote?: string;
  japaneseRatio?: string;
  nationalityDiversity?: string;
  levels?: string;
  accreditation?: string;
  refundPolicy?: string;
  /** 変動値（tuition/fee 等）の出所。Step 24 で「source + fetchedAt が揃うときだけ費用を表示」に使う。 */
  source?: string;
  sourceUrl?: string[];
  fetchedAt?: string;
};

export type SchoolComparisonSchool = {
  slug: string;
  name: string;
  nameJa?: string;
  city?: string;
  country?: string;
  category: "match" | "reference";
  /** ProposalRecord.reason（AI / マッチングロジック由来。学校の事実ではない）。trim 後空なら undefined。
   *  facts へは混ぜない。 */
  presentedReason?: string;
  /** ProposalRecord.caveat（同上。学校の客観的欠点として扱わない）。trim 後空なら undefined。 */
  presentedCaveat?: string;
  facts: SchoolComparisonFacts;
};

/** 学校比較に使う可能性がある本人の stated 条件。Step 23 では「安全に保持」まで（fit 判定はしない）。 */
export type SchoolComparisonCriterion = {
  block: BlockName;
  key: string;
  label: string;
  value: string;
  /** 将来の safety 用の内部情報。source を理由に criterion を除外はしない。本文へは出さない。 */
  source?: FieldSource;
};

export type SchoolComparisonView = {
  /** 比較する候補校。proposals.presented（type="school"）の元順を維持、同一 slug は最初の 1 件のみ、
   *  マスタ解決できたものだけ。 */
  schools: SchoolComparisonSchool[];
  /** 学校比較に関係する本人の stated 条件（inferred / unknown / conflict 中 / trueGoalHypothesis は含まない）。 */
  userCriteria: SchoolComparisonCriterion[];
  /** timing.durationWeeks（stated かつ非 conflict）の値を文字列化したもの。
   *  「学校に求める条件」ではないため userCriteria には入れず、将来の費用計算等の文脈値として持つ。 */
  durationWeeks?: string;
  /** 学校比較に関係する field の conflict のトピックのラベルだけ。値・source は持たない。
   *  trim・重複除去済み、元の順序を維持。 */
  conflictTopics: string[];
  /** proposals.presented にあるがマスタ解決できなかった school slug（内部状態。本文には出さない）。
   *  重複除去済み、元の順序を維持。 */
  unresolvedSlugs: string[];
  /** 解決済みユニーク候補校が 2 校以上 かつ userCriteria が 1 件以上 なら true。
   *  durationWeeks 単独 / inferred のみ / conflict 中のみ / category の組み合わせ は条件に含めない。 */
  hasEnoughContext: boolean;
};

/**
 * 学校比較に使う可能性がある stated 条件の (block, key)。
 * ここに timing.durationWeeks は含めない（専用 top-level で扱う）。
 * budget.totalCap / monthlyCap は「本人が入力した予算条件」として保持するだけで、
 * 学校授業料との直接比較可否は Step 24 で別途安全判定する（完了報告 R 参照）。
 */
const CRITERION_FIELDS: ReadonlyArray<readonly [BlockName, string]> = [
  ["schoolPrefs", "preferredCity"],
  ["schoolPrefs", "courseType"],
  ["schoolPrefs", "accommodation"],
  ["schoolPrefs", "sizeNationality"],
  ["schoolPrefs", "startFlexibility"],
  ["language", "pathwayIntent"],
  ["language", "selfLevel"],
  ["budget", "totalCap"],
  ["budget", "monthlyCap"],
  ["constraints", "avoidCountries"],
];

const CRITERION_KEYS: ReadonlySet<string> = new Set(
  CRITERION_FIELDS.map(([b, k]) => `${b}.${k}`),
);

/** conflictTopics の対象。criterion 候補 field ＋ durationWeeks。 */
const CONFLICT_RELEVANT_KEYS: ReadonlySet<string> = new Set([
  ...CRITERION_KEYS,
  "timing.durationWeeks",
]);

function nonEmpty(raw: string): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

/** trim して空文字を捨て、最初に出た順を保ったまま重複を除去する。 */
function dedupePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * School マスタから Document 向け安全サブセットへコピーする。
 * 配列・FeeRange は新しい object/配列へコピーし、元 School の参照を facts に残さない。
 * 値は一切言い換えない。存在しない optional field は undefined のまま（キー自体を作らない）。
 */
function pickFacts(s: School): SchoolComparisonFacts {
  const f: SchoolComparisonFacts = {};
  if (s.courseCategories !== undefined) f.courseCategories = [...s.courseCategories];
  if (s.courses !== undefined) f.courses = [...s.courses];
  if (s.intakeNote !== undefined) f.intakeNote = s.intakeNote;
  if (s.scheduleNote !== undefined) f.scheduleNote = s.scheduleNote;
  if (s.accommodationOptions !== undefined) f.accommodationOptions = [...s.accommodationOptions];
  if (s.accommodationNote !== undefined) f.accommodationNote = s.accommodationNote;
  if (s.hasPathway !== undefined) f.hasPathway = s.hasPathway;
  if (s.pathwayNotes !== undefined) f.pathwayNotes = s.pathwayNotes;
  if (s.ageRange !== undefined) f.ageRange = s.ageRange;
  if (s.classSizeAvg !== undefined) f.classSizeAvg = s.classSizeAvg;
  if (s.classSizeMax !== undefined) f.classSizeMax = s.classSizeMax;
  if (s.classSizeNote !== undefined) f.classSizeNote = s.classSizeNote;
  if (s.tuitionWeekly !== undefined) f.tuitionWeekly = { ...s.tuitionWeekly };
  if (s.tuitionWeeklyNote !== undefined) f.tuitionWeeklyNote = s.tuitionWeeklyNote;
  if (s.enrollmentFee !== undefined) f.enrollmentFee = { ...s.enrollmentFee };
  if (s.enrollmentFeeNote !== undefined) f.enrollmentFeeNote = s.enrollmentFeeNote;
  if (s.materialFee !== undefined) f.materialFee = { ...s.materialFee };
  if (s.materialFeeNote !== undefined) f.materialFeeNote = s.materialFeeNote;
  if (s.japaneseRatio !== undefined) f.japaneseRatio = s.japaneseRatio;
  if (s.nationalityDiversity !== undefined) f.nationalityDiversity = s.nationalityDiversity;
  if (s.levels !== undefined) f.levels = s.levels;
  if (s.accreditation !== undefined) f.accreditation = s.accreditation;
  if (s.refundPolicy !== undefined) f.refundPolicy = s.refundPolicy;
  if (s.source !== undefined) f.source = s.source;
  if (s.sourceUrl !== undefined) f.sourceUrl = [...s.sourceUrl];
  if (s.fetchedAt !== undefined) f.fetchedAt = s.fetchedAt;
  return f;
}

/**
 * Karte + 提示済み候補（karte.proposals.presented）+ 学校マスタ から school_comparison 用の
 * pure view を作る。入力（karte / schools）は一切 mutate しない。
 */
export function buildSchoolComparisonView(karte: Karte, schools: School[]): SchoolComparisonView {
  const bySlug = new Map<string, School>();
  for (const s of schools) {
    if (!bySlug.has(s.schoolSlug)) bySlug.set(s.schoolSlug, s);
  }
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));

  // ---- 候補校の解決（type="school" のみ・元順維持・同一 slug は最初の 1 件） ----
  const resultSchools: SchoolComparisonSchool[] = [];
  const seenSlugs = new Set<string>();
  const unresolvedSlugs: string[] = [];
  const seenUnresolved = new Set<string>();

  for (const p of karte.proposals.presented) {
    if (p.type !== "school") continue;
    if (seenSlugs.has(p.id) || seenUnresolved.has(p.id)) continue;

    const master = bySlug.get(p.id);
    if (!master) {
      seenUnresolved.add(p.id);
      unresolvedSlugs.push(p.id);
      continue;
    }

    seenSlugs.add(p.id);
    resultSchools.push({
      slug: p.id,
      name: master.name,
      nameJa: master.nameJa,
      city: master.city,
      country: master.country,
      category: p.category,
      presentedReason: nonEmpty(p.reason),
      presentedCaveat: nonEmpty(p.caveat),
      facts: pickFacts(master),
    });
  }

  // ---- userCriteria（学校比較に関係する stated field だけ・conflict 中は除外） ----
  const userCriteria: SchoolComparisonCriterion[] = [];
  for (const item of getKarteSummaryItems(karte)) {
    if (item.certainty !== "stated") continue;
    const dotKey = `${item.block}.${item.key}`;
    if (!CRITERION_KEYS.has(dotKey)) continue;
    if (conflictKeys.has(dotKey)) continue;

    const rawField = (karte[item.block] as Record<string, Field<unknown>>)[item.key];
    userCriteria.push({
      block: item.block,
      key: item.key,
      label: item.label,
      value: item.value,
      source: rawField?.source,
    });
  }

  // ---- durationWeeks（専用 top-level。stated かつ非 conflict のときだけ） ----
  const dwField = karte.timing.durationWeeks;
  const durationWeeks =
    !conflictKeys.has("timing.durationWeeks") &&
    dwField.certainty === "stated" &&
    dwField.value != null
      ? String(dwField.value)
      : undefined;

  // ---- conflictTopics（学校比較に関係する field だけ・ラベルのみ） ----
  const conflictTopics = dedupePreserveOrder(
    karte.handoff.conflicts
      .filter((c) => CONFLICT_RELEVANT_KEYS.has(`${c.block}.${c.key}`))
      .map((c) => getFieldLabel(c.block, c.key)),
  );

  const hasEnoughContext = resultSchools.length >= 2 && userCriteria.length >= 1;

  return {
    schools: resultSchools,
    userCriteria,
    durationWeeks,
    conflictTopics,
    unresolvedSlugs,
    hasEnoughContext,
  };
}
