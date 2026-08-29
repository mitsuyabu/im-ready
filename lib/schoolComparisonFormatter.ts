/**
 * SchoolComparisonView（Step 23）を、既存 Documents と同じプレーンテキスト（{ format: "text", body }）
 * へ **決定的に** 整形する pure function（Step 24）。Anthropic は一切使わない。
 *
 * 入力は SchoolComparisonView だけ。AUSTRALIA_SCHOOLS / Web / Places / Karte / proposal pipeline を
 * 直接読まない。同じ View なら必ず同じ文字列を返す（Date.now / 乱数を使わない）。
 *
 * 出さないもの: おすすめ・ベスト・一番合う・第一候補・順位・最適・スコア・％・星・ranking。
 * budget と学校授業料の fit 判定はしない（総予算 ≠ 学費・円 ≠ 現地通貨・為替換算禁止）。
 * 変動金額（授業料・入学金・教材費）は source と fetchedAt が両方そろう学校でのみ表示する。
 * Markdown 記法（**, 表, バッククォート, 行頭 -）は使わない。見出しは「■ 」、項目は「項目：値」。
 */

import type {
  SchoolComparisonCriterion,
  SchoolComparisonSchool,
  SchoolComparisonView,
} from "@/lib/schoolComparisonView";
import type { FeeRange } from "@/lib/data/schools";
import { computeFit, type SchoolFitVerdict } from "@/lib/schoolComparisonFit";

export const SCHOOL_COMPARISON_DEFAULT_TITLE = "現在の学校候補の比較";

const PRICE_DISCLAIMER =
  "金額は学校データ取得時点の目安です。最新の費用は各学校の案内をご確認ください。";
const INFO_NASHI_DISCLAIMER =
  "「情報なし」は、当サービスの学校データにその情報が登録されていないことを示します。学校にその制度や情報自体が存在しないという意味ではありません。";
const REASON_DISCLAIMER =
  "以下は候補提示時のマッチング説明であり、学校の客観的な事実情報とは別のものです。";
const BUDGET_DISCLAIMER =
  "予算条件は入力されていますが、学校の授業料だけでは留学全体の総予算との適合を判断できないため、ここでは一致判定をしていません。";

/** hasEnoughContext をそのまま返すだけ。別条件は再計算しない。 */
export function canGenerateSchoolComparison(view: SchoolComparisonView): boolean {
  return view.hasEnoughContext;
}

function verdictLabel(v: SchoolFitVerdict): string {
  if (v === "match") return "条件に合っている";
  if (v === "check") return "確認が必要";
  return "判断材料なし";
}

/** match / reference をユーザー向けラベルへ。順位・おすすめには変換しない。 */
function categoryLabel(c: "match" | "reference"): string {
  return c === "match" ? "候補" : "参考候補";
}

function feeRangeText(fee: FeeRange, perWeek: boolean): string {
  const amount = fee.min === fee.max ? `${fee.min}` : `${fee.min}〜${fee.max}`;
  return `${fee.currency} ${amount}${perWeek ? " / 週" : ""}`;
}

/** 変動金額を表示してよい学校か（source と fetchedAt が両方そろう）。 */
function showFees(facts: SchoolComparisonSchool["facts"]): boolean {
  return (
    typeof facts.source === "string" &&
    facts.source.trim().length > 0 &&
    typeof facts.fetchedAt === "string" &&
    facts.fetchedAt.trim().length > 0
  );
}

function freshnessSuffix(facts: SchoolComparisonSchool["facts"]): string {
  return `（${facts.source}、${facts.fetchedAt}時点）`;
}

function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ---- 「■ 学校ごとの比較」の行定義（存在する学校が 1 校以上ある行だけ描画） ----

type FactRow = { label: string; get: (s: SchoolComparisonSchool) => string | undefined };

function courseText(s: SchoolComparisonSchool): string | undefined {
  const f = s.facts;
  if (f.courses && f.courses.length > 0) return f.courses.join("、");
  if (f.courseCategories && f.courseCategories.length > 0) return f.courseCategories.join("、");
  return undefined;
}

function accommodationText(s: SchoolComparisonSchool): string | undefined {
  const f = s.facts;
  const parts: string[] = [];
  if (f.accommodationOptions && f.accommodationOptions.length > 0) {
    parts.push(f.accommodationOptions.join("、"));
  }
  if (nonEmptyStr(f.accommodationNote)) parts.push(f.accommodationNote);
  return parts.length > 0 ? parts.join("／") : undefined;
}

function pathwayText(s: SchoolComparisonSchool): string | undefined {
  const f = s.facts;
  if (f.hasPathway === undefined) return undefined;
  const base = f.hasPathway ? "あり" : "なし";
  return nonEmptyStr(f.pathwayNotes) ? `${base}（${f.pathwayNotes}）` : base;
}

function classSizeText(s: SchoolComparisonSchool): string | undefined {
  const f = s.facts;
  const parts: string[] = [];
  if (typeof f.classSizeAvg === "number") parts.push(`平均${f.classSizeAvg}人`);
  if (typeof f.classSizeMax === "number") parts.push(`最大${f.classSizeMax}人`);
  if (nonEmptyStr(f.classSizeNote)) parts.push(f.classSizeNote);
  return parts.length > 0 ? parts.join("／") : undefined;
}

function feeText(fee: FeeRange | undefined, note: string | undefined, s: SchoolComparisonSchool, perWeek: boolean): string | undefined {
  if (!showFees(s.facts)) return undefined;
  const bits: string[] = [];
  if (fee) bits.push(`${feeRangeText(fee, perWeek)}${freshnessSuffix(s.facts)}`);
  if (nonEmptyStr(note)) bits.push(note);
  return bits.length > 0 ? bits.join("／") : undefined;
}

const FACT_ROWS: FactRow[] = [
  { label: "都市", get: (s) => (nonEmptyStr(s.city) ? s.city : undefined) },
  { label: "国", get: (s) => (nonEmptyStr(s.country) ? s.country : undefined) },
  { label: "コース", get: courseText },
  { label: "入学時期", get: (s) => (nonEmptyStr(s.facts.intakeNote) ? s.facts.intakeNote : undefined) },
  { label: "授業スケジュール", get: (s) => (nonEmptyStr(s.facts.scheduleNote) ? s.facts.scheduleNote : undefined) },
  { label: "滞在", get: accommodationText },
  { label: "進学パスウェイ", get: pathwayText },
  { label: "対応レベル", get: (s) => (nonEmptyStr(s.facts.levels) ? s.facts.levels : undefined) },
  { label: "クラス人数", get: classSizeText },
  { label: "生徒の年齢層", get: (s) => (nonEmptyStr(s.facts.ageRange) ? s.facts.ageRange : undefined) },
  { label: "日本人比率", get: (s) => (nonEmptyStr(s.facts.japaneseRatio) ? s.facts.japaneseRatio : undefined) },
  { label: "国籍の多様性", get: (s) => (nonEmptyStr(s.facts.nationalityDiversity) ? s.facts.nationalityDiversity : undefined) },
  { label: "認定", get: (s) => (nonEmptyStr(s.facts.accreditation) ? s.facts.accreditation : undefined) },
  { label: "返金規定", get: (s) => (nonEmptyStr(s.facts.refundPolicy) ? s.facts.refundPolicy : undefined) },
  { label: "授業料目安", get: (s) => feeText(s.facts.tuitionWeekly, s.facts.tuitionWeeklyNote, s, true) },
  { label: "入学金目安", get: (s) => feeText(s.facts.enrollmentFee, s.facts.enrollmentFeeNote, s, false) },
  { label: "教材費目安", get: (s) => feeText(s.facts.materialFee, s.facts.materialFeeNote, s, false) },
];

/** SchoolComparisonView を Document 本文（プレーンテキスト）へ整形する。入力を mutate しない。 */
export function formatSchoolComparison(view: SchoolComparisonView): string {
  const lines: string[] = [SCHOOL_COMPARISON_DEFAULT_TITLE];

  if (view.schools.length === 0) {
    lines.push("", "比較できる学校情報がありません。");
    return lines.join("\n");
  }

  let infoNashiUsed = false;

  const feeShown = view.schools.some(
    (s) =>
      showFees(s.facts) &&
      (s.facts.tuitionWeekly !== undefined ||
        nonEmptyStr(s.facts.tuitionWeeklyNote) ||
        s.facts.enrollmentFee !== undefined ||
        nonEmptyStr(s.facts.enrollmentFeeNote) ||
        s.facts.materialFee !== undefined ||
        nonEmptyStr(s.facts.materialFeeNote)),
  );
  if (feeShown) {
    lines.push("", PRICE_DISCLAIMER);
  }

  // ■ 今回比較する学校
  lines.push("", "■ 今回比較する学校");
  for (const s of view.schools) {
    lines.push("", s.name);
    if (nonEmptyStr(s.nameJa) && s.nameJa !== s.name) lines.push(`日本語名：${s.nameJa}`);
    if (nonEmptyStr(s.city)) lines.push(`都市：${s.city}`);
    lines.push(`区分：${categoryLabel(s.category)}`);
  }

  // ■ あなたが大切にしている条件（source は出さない。budget もここには出す）
  if (view.userCriteria.length > 0) {
    lines.push("", "■ あなたが大切にしている条件");
    for (const c of view.userCriteria) {
      const suffix = c.block === "budget" ? "円" : "";
      lines.push(`${c.label}：${c.value}${suffix}`);
    }
    if (nonEmptyStr(view.durationWeeks)) {
      lines.push(`希望する期間：${view.durationWeeks}週間`);
    }
  }

  // ■ 学校ごとの比較（他校に情報がある行だけ描画。該当校に無ければ「情報なし」）
  const activeRows = FACT_ROWS.filter((r) => view.schools.some((s) => r.get(s) !== undefined));
  lines.push("", "■ 学校ごとの比較");
  for (const s of view.schools) {
    lines.push("", s.name);
    for (const r of activeRows) {
      const v = r.get(s);
      if (v === undefined) {
        lines.push(`${r.label}：情報なし`);
        infoNashiUsed = true;
      } else {
        lines.push(`${r.label}：${v}`);
      }
    }
    if (s.facts.sourceUrl && s.facts.sourceUrl.length > 0) {
      for (const url of s.facts.sourceUrl) lines.push(`参照先：${url}`);
    }
  }

  // ■ 条件との合い方（computeFit が非 null の criterion だけ。budget は必ず非表示）
  const fitCriteria: SchoolComparisonCriterion[] = view.userCriteria.filter((c) =>
    view.schools.some((s) => computeFit(c, s) !== null),
  );
  if (fitCriteria.length > 0) {
    lines.push("", "■ 条件との合い方");
    for (const s of view.schools) {
      lines.push("", s.name);
      for (const c of fitCriteria) {
        const r = computeFit(c, s);
        if (r === null) continue;
        lines.push(`${c.label}：${verdictLabel(r.verdict)}`);
        lines.push(`根拠：${r.basis}`);
      }
    }
  }

  // ■ まだ比較できないこと（決定的に構築・重複除去）
  const cantCompare: string[] = [];
  for (const t of view.conflictTopics) cantCompare.push(`${t}：情報の整理が必要です`);
  for (const c of view.userCriteria) {
    if (c.block === "budget") continue; // budget は下の固定文で扱う
    const results = view.schools.map((s) => computeFit(c, s));
    if (results.length > 0 && results.every((r) => r !== null && r.verdict === "no_data")) {
      cantCompare.push(`${c.label}：候補校のデータが不足しているため比較できません`);
    }
  }
  if (view.userCriteria.some((c) => c.block === "budget")) {
    cantCompare.push(BUDGET_DISCLAIMER);
  }
  const cantCompareUnique = [...new Set(cantCompare)];
  if (cantCompareUnique.length > 0) {
    lines.push("", "■ まだ比較できないこと");
    for (const item of cantCompareUnique) lines.push(item);
  }

  // ■ 候補として提示された理由・メモ（学校事実とは別。マッチング説明である旨を明示）
  const withReason = view.schools.filter((s) => nonEmptyStr(s.presentedReason) || nonEmptyStr(s.presentedCaveat));
  if (withReason.length > 0) {
    lines.push("", "■ 候補として提示された理由・メモ", REASON_DISCLAIMER);
    for (const s of withReason) {
      lines.push("", s.name);
      if (nonEmptyStr(s.presentedReason)) lines.push(`候補として提示された理由：${s.presentedReason}`);
      if (nonEmptyStr(s.presentedCaveat)) lines.push(`提示時のメモ：${s.presentedCaveat}`);
    }
  }

  if (infoNashiUsed) {
    lines.push("", INFO_NASHI_DISCLAIMER);
  }

  return lines.join("\n");
}
