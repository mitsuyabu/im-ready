/**
 * Consultation Sheet 上部の「相談時に共有する基本情報」。編集 UI ではなく、相談の前提を確認するための短い一覧。
 *
 * 値の優先順位: My Plan に保存した値 > Karte の stated（conflict 中でないもの） > 未定。
 * conflict 中の項目は一方を選ばず「検討中（A / B）」と出す。inferred は使わない。
 * Study Plan の全文をコピーしない（1 項目 1 行の短い値だけ）。
 */

import type { BlockName, Karte } from "@/lib/karte";
import { accommodationLabel, type BlueprintData } from "@/lib/planBlueprint";
import { isUndecidedValue } from "@/lib/myNoteBuckets";

export type ConsultationSummaryRow = {
  label: string;
  value: string;
  /** set = 決まっている / considering = 2つで揺れている / undecided = 未定・まだ分からない */
  status: "set" | "considering" | "undecided";
};

type Field = { value?: unknown; certainty?: string };

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join("、");
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  return String(v ?? "");
}

export function buildConsultationSummary(karte: Karte, blueprint: BlueprintData | null): ConsultationSummaryRow[] {
  const conflicts = karte.handoff?.conflicts ?? [];
  const conflictOf = (block: BlockName, key: string) => conflicts.find((c) => c.block === block && c.key === key);

  /** Karte から 1 項目: conflict → 検討中 / stated → 値（未定系は undecided）/ それ以外 → null */
  const fromKarte = (
    block: BlockName,
    key: string,
    format: (v: unknown) => string = formatValue,
  ): Omit<ConsultationSummaryRow, "label"> | null => {
    const c = conflictOf(block, key);
    if (c) return { value: `検討中（${format(c.existingValue)} / ${format(c.incomingValue)}）`, status: "considering" };
    const f = (karte[block] as unknown as Record<string, Field> | undefined)?.[key];
    if (!f || f.certainty !== "stated" || f.value == null) return null;
    const value = format(f.value);
    if (!value.trim()) return null;
    return { value, status: isUndecidedValue(value) ? "undecided" : "set" };
  };

  const row = (label: string, ...options: (Omit<ConsultationSummaryRow, "label"> | null)[]): ConsultationSummaryRow => {
    const hit = options.find((o) => o !== null);
    return hit ? { label, ...hit } : { label, value: "未定", status: "undecided" };
  };

  const bp = blueprint;
  const mpCity = bp?.destinations.primary?.label?.trim() ? { value: bp.destinations.primary.label, status: "set" as const } : null;
  const mpDuration =
    typeof bp?.planSettings.durationMonths === "number" ? { value: `約${bp.planSettings.durationMonths}ヶ月`, status: "set" as const } : null;
  const mpStay =
    bp && bp.accommodations.length > 0
      ? { value: Array.from(new Set(bp.accommodations.map((a) => accommodationLabel(a)))).join("、"), status: "set" as const }
      : null;
  const mpWork =
    bp && bp.workInterests.length > 0 ? { value: bp.workInterests.map((w) => w.label).join("、"), status: "set" as const } : null;

  return [
    row("希望国", fromKarte("schoolPrefs", "preferredCountries")),
    row("希望都市", mpCity, fromKarte("schoolPrefs", "preferredCity")),
    row("出発時期", fromKarte("timing", "departureTiming")),
    row(
      "留学期間",
      mpDuration,
      fromKarte("timing", "durationLabel"),
      fromKarte("timing", "durationWeeks", (v) => `${formatValue(v)}週間`),
    ),
    row("予算", fromKarte("budget", "rangeLabel"), fromKarte("budget", "totalCap", (v) => `${formatValue(v)}円`)),
    row("英語力", fromKarte("language", "selfLevel")),
    row("就学希望", fromKarte("schoolPrefs", "courseType")),
    row("滞在希望", mpStay, fromKarte("schoolPrefs", "accommodation")),
    row(
      "現地就労",
      mpWork,
      fromKarte("work", "wantsToWork", (v) => (v === true ? "働きたい" : v === false ? "働く予定はない" : formatValue(v))),
    ),
  ];
}
