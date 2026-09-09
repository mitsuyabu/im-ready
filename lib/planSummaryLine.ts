/**
 * Plan Home Hero 直下カードの下段に出す「Plan のざっくりサマリー」を、My Plan の
 * plan_blueprint 実データから **deterministic** に生成する。
 *
 * - Karte の自由文 summary は使わない / AI 生成しない / fake placeholder を使わない
 * - 見るのは schools / accommodations / workInterests / thingsToDo の保存済みデータだけ
 * - 最大 4 項目（School → Accommodation → Work → Things の順）、存在するものだけ ` + ` 連結
 * - 何も無ければ null（呼び出し側は下段を出さない）
 */

import { accommodationLabel, type BlueprintData } from "@/lib/planBlueprint";

function months(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? `${n}ヶ月` : "";
}

/** 語学学校（＋ 期間がわかれば「Nヶ月」）。校名は並べない。 */
function schoolPart(data: BlueprintData): string | null {
  const rep =
    data.schools.find((s) => s.status === "selected") ??
    data.schools.find((s) => s.status === "preferred") ??
    data.schools.find((s) => s.status === "considering") ??
    null;
  if (!rep) return null;
  return `語学学校${months(rep.durationMonths)}`;
}

/** 最初の保存済み滞在方法（type ラベル ＋ 期間がわかれば「Nヶ月」）。 */
function accommodationPart(data: BlueprintData): string | null {
  const a = data.accommodations[0];
  if (!a) return null;
  const label = accommodationLabel(a).trim();
  if (!label) return null;
  return `${label}${months(a.durationMonths)}`;
}

/** workInterests / thingsToDo の代表 1 件。保存済み label をそのまま使う（言い換えない）。 */
function firstItemLabel(items: BlueprintData["workInterests"]): string | null {
  const t = items[0]?.label?.trim();
  return t && t.length > 0 ? t : null;
}

/**
 * plan_blueprint から 1 行サマリーを組む。空なら null。
 * 例: "語学学校3ヶ月 + ホームステイ1ヶ月 + アルバイト + 観光"
 */
export function buildPlanSummaryLine(data: BlueprintData | null | undefined): string | null {
  if (!data) return null;
  const parts = [
    schoolPart(data),
    accommodationPart(data),
    firstItemLabel(data.workInterests),
    firstItemLabel(data.thingsToDo),
  ].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.slice(0, 4).join(" + ") : null;
}
