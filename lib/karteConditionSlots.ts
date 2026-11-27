/**
 * My Karte トップの Study Plan セクション用の「希望・条件スロット」ビルダー。pure / deterministic。
 *
 * 目的:
 *   My Karte の Study Plan セクションを、文章ではなく **項目別のグリッド**で見せるために、
 *   「国 / 都市 / 出発時期 / 滞在期間 / 予算 / ビザ / 学び方 / 就学期間 / 現地での仕事 / 滞在方法」の
 *   固定スロットへ、既存データを**そのまま**割り当てる。
 *
 * ここでやらないこと（重要）:
 *   - AI 生成・推測・補完を一切しない（ページ表示時に Anthropic を呼ばない）。
 *   - inferred（AI の仮説）は値として出さない。出すのは stated だけ。
 *   - 未回答を推測で埋めない。値が無いスロットは "unknown"（＝「未整理」）のまま返す。
 *   - 複数候補を 1 つに絞らない（values は配列。conflict 中は両方の値を並べて candidates とする）。
 *   - 金額の推定・期間の換算・都市やビザ情報の補完をしない（値は Karte / Worksheet の表記のまま）。
 *
 * データの優先順位（1 スロットにつき 1 経路だけを採用する）:
 *   1. Karte の stated 値（lib/karte.ts の getKarteSummaryItems と同じ整形を使う）
 *   2. Karte が未解決 conflict 中 → 両方の値を candidates として並べる（どちらとも決めない）
 *   3. Karte が unknown → Worksheet（plan_worksheet）の同じ設問の回答を使う
 *   4. どれも無い → unknown
 *
 * Worksheet を 3 番目に置くのは、Worksheet の回答は lib/worksheetKarte.ts が Karte 側へ同期する
 * 設計のため、通常は Karte に入っているから。同期前・同期対象外のときだけ Worksheet を直接読む
 * （lib/myNoteBuckets.ts の WORKSHEET_TO_KARTE_KEY と同じ「同じ事実を 2 回出さない」方針）。
 *
 * My Plan（plan_blueprint = ユーザーが採用した実行計画）は**一切読まない**。
 * ここに出るのは「Karte 上の希望・条件」であり、確定した実行計画ではない。
 */

import type { BlockName, Field, Karte } from "@/lib/karte";
import { getKarteSummaryItems } from "@/lib/karte";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import {
  ACCOMMODATION_OPTIONS,
  BUDGET_OPTIONS,
  CITY_OPTIONS,
  COUNTRY_OPTIONS,
  DEPARTURE_TIMING_OPTIONS,
  LOCAL_WORK_OPTIONS,
  STAY_DURATION_OPTIONS,
  STUDY_DURATION_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  concreteLabels,
} from "@/lib/worksheetConditions";
import type { ChoiceOption } from "@/lib/worksheetNextStep";
/**
 * 「まだ決めていない」系の表記かどうかの判定は lib/myNoteBuckets.ts の実装をそのまま使う
 * （同じ正規表現を 2 か所に持たない）。
 */
import { isUndecidedValue } from "@/lib/myNoteBuckets";

/** スロットの状態。値の有無と「未定と明言した」を区別する。 */
export type ConditionSlotState =
  /** stated な値がある */
  | "stated"
  /** 本人が「まだ決めていない」と明言した（＝回答済み。推測で埋めてよい訳ではない） */
  | "undecided"
  /** Chat 由来と Worksheet 由来の stated が食い違っていて、どちらとも決まっていない */
  | "conflict"
  /** まだ何も整理されていない */
  | "unknown";

export type ConditionSlotId =
  | "country"
  | "city"
  | "departure"
  | "duration"
  | "budget"
  | "visa"
  | "study"
  | "studyDuration"
  | "work"
  | "accommodation";

export type ConditionSlot = {
  id: ConditionSlotId;
  /** 画面に出すラベル。Karte の FIELD_LABELS とは独立に、このダッシュボード用の短い言い方にする。 */
  label: string;
  /** 値。複数候補はそのまま複数件入れる（1 つに絞らない）。state が unknown のときだけ空。 */
  values: string[];
  state: ConditionSlotState;
};

/**
 * スロットの定義と並び順。PC 3 列 / スマートフォン 2 列のグリッドに並べる前提の順序で、
 * 「どこへ・いつ・どのくらい・いくら」→「どう過ごすか」の流れにしている。
 */
const SLOT_LABELS: Record<ConditionSlotId, string> = {
  country: "希望する国",
  city: "希望する都市",
  departure: "出発時期",
  duration: "滞在期間",
  budget: "予算",
  visa: "ビザ",
  study: "学び方",
  studyDuration: "就学期間",
  work: "現地での仕事",
  accommodation: "滞在方法",
};

export const CONDITION_SLOT_ORDER: ConditionSlotId[] = [
  "country",
  "city",
  "departure",
  "duration",
  "budget",
  "visa",
  "study",
  "studyDuration",
  "work",
  "accommodation",
];

/** 値が無いスロットに出す文言（AI に書かせない固定文言）。 */
export const CONDITION_SLOT_UNKNOWN_TEXT = "未整理";
/** 本人が「まだ決めていない」と答えたスロットに出す文言。 */
export const CONDITION_SLOT_UNDECIDED_TEXT = "未定";

/**
 * スロット → 参照する Karte field（複数可・この順に見る）。
 *
 * ここに無い field は Study Plan セクションに出さない（profile / personality / support /
 * motivation / lifestyle は「希望・条件」ではないため、このグリッドの対象外）。
 *
 * visa に `constraints.visaConstraints` だけを置いているのは、Karte schema に
 * 「希望するビザ種類」の field が存在しないため。work.workingHolidayInterest は
 * 「ワーホリへの関心」であってビザの希望ではないので、ビザ欄へ流し込まない
 * （存在しない事実を作らない。完了報告 G にスキーマの設計案として記載）。
 */
const SLOT_KARTE_FIELDS: Record<ConditionSlotId, ReadonlyArray<readonly [BlockName, string]>> = {
  country: [["schoolPrefs", "preferredCountries"]],
  city: [["schoolPrefs", "preferredCity"]],
  departure: [["timing", "departureTiming"]],
  duration: [
    ["timing", "durationLabel"],
    ["timing", "durationWeeks"],
  ],
  budget: [
    ["budget", "rangeLabel"],
    ["budget", "totalCap"],
  ],
  visa: [["constraints", "visaConstraints"]],
  study: [["schoolPrefs", "courseType"]],
  studyDuration: [["schoolPrefs", "studyDurationLabel"]],
  work: [["work", "wantsToWork"]],
  accommodation: [["schoolPrefs", "accommodation"]],
};

/**
 * スロット → Worksheet 設問（Karte が unknown のときだけ使う fallback）。
 * 対応は lib/myNoteBuckets.ts の WORKSHEET_TO_KARTE_KEY と同じ組み合わせ。
 * options を持つ設問は「具体的な選択肢」のラベルだけを値として採用する
 * （「その他」「まだ決まっていない」は concreteLabels が落とす）。
 */
const SLOT_WORKSHEET: Partial<
  Record<ConditionSlotId, { questionId: string; options: ChoiceOption[] }>
> = {
  country: { questionId: "destination-country", options: COUNTRY_OPTIONS },
  city: { questionId: "destination-city", options: CITY_OPTIONS },
  departure: { questionId: "timing", options: DEPARTURE_TIMING_OPTIONS },
  duration: { questionId: "stay-duration", options: STAY_DURATION_OPTIONS },
  budget: { questionId: "budget", options: BUDGET_OPTIONS },
  study: { questionId: "study-format", options: STUDY_FORMAT_OPTIONS },
  studyDuration: { questionId: "study-duration", options: STUDY_DURATION_OPTIONS },
  work: { questionId: "local-work", options: LOCAL_WORK_OPTIONS },
  accommodation: { questionId: "accommodation", options: ACCOMMODATION_OPTIONS },
};

/** Karte の数値・真偽値を、意味を足さずに読める表記へ（lib/myNoteBuckets.ts と同じ整形）。 */
function formatSlotValue(block: BlockName, key: string, raw: unknown, fallback: string): string {
  if (typeof raw === "number" && key === "totalCap") return `${raw.toLocaleString("ja-JP")}円`;
  if (typeof raw === "number" && block === "timing" && key === "durationWeeks") return `${raw}週間`;
  if (typeof raw === "boolean" && key === "wantsToWork") {
    return raw ? "現地で働きたい" : "現地で働く予定はない";
  }
  return fallback;
}

function formatConflictValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join("、");
  if (typeof value === "boolean") return value ? "あり" : "なし";
  if (value == null) return "";
  return String(value);
}

/** trim・空文字除去・重複除去（元の順序を維持）。 */
function dedupe(values: readonly string[]): string[] {
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

/** Worksheet の 1 設問から、具体的な選択ラベル＋自由記入を値として取り出す。 */
function worksheetValues(
  data: WorksheetPersistedData,
  questionId: string,
  options: ChoiceOption[],
): { values: string[]; sawUndecided: boolean } {
  const single = data.singleSelections[questionId];
  const multi = data.multiSelections[questionId] ?? [];
  const ids = single ? [single, ...multi] : multi;
  const labels = concreteLabels(options, ids);
  const note = (data.answers[questionId] ?? "").trim();

  // 「まだ決まっていない」等の選択肢が選ばれていたか（concreteLabels では落ちるため別途見る）。
  const selectedLabels = options.filter((o) => ids.includes(o.id)).map((o) => o.label);
  const sawUndecided = selectedLabels.some((l) => isUndecidedValue(l));

  const values = dedupe([...labels, note]);
  return { values: values.filter((v) => !isUndecidedValue(v)), sawUndecided };
}

/**
 * Karte + Worksheet から、Study Plan セクションの固定スロットを組み立てる。
 * 入力は一切 mutate しない。worksheet が null でも動く（Karte だけで組む）。
 */
export function buildKarteConditionSlots(
  karte: Karte,
  worksheet: WorksheetPersistedData | null,
): ConditionSlot[] {
  const conflictByKey = new Map(
    karte.handoff.conflicts.map((c) => [`${c.block}.${c.key}`, c] as const),
  );
  // getKarteSummaryItems は unknown・値なしを既に除外済み。ここでは stated だけを引く。
  const statedByKey = new Map(
    getKarteSummaryItems(karte)
      .filter((i) => i.certainty === "stated")
      .map((i) => [`${i.block}.${i.key}`, i] as const),
  );

  return CONDITION_SLOT_ORDER.map((id) => {
    const label = SLOT_LABELS[id];

    // 1) 未解決 conflict が先。Chat と Worksheet の stated が食い違っている項目を、
    //    どちらか一方に寄せて「決まったこと」のように見せない。
    for (const [block, key] of SLOT_KARTE_FIELDS[id]) {
      const conflict = conflictByKey.get(`${block}.${key}`);
      if (conflict) {
        const values = dedupe([
          formatConflictValue(conflict.existingValue),
          formatConflictValue(conflict.incomingValue),
        ]);
        if (values.length > 0) return { id, label, values, state: "conflict" as const };
      }
    }

    // 2) Karte の stated 値。
    const statedValues: string[] = [];
    let statedUndecided = false;
    for (const [block, key] of SLOT_KARTE_FIELDS[id]) {
      const item = statedByKey.get(`${block}.${key}`);
      if (!item) continue;
      const raw = (karte[block] as Record<string, Field<unknown>>)[key]?.value;
      const value = formatSlotValue(block, key, raw, item.value);
      if (isUndecidedValue(value)) {
        statedUndecided = true;
        continue;
      }
      statedValues.push(value);
    }
    const karteValues = dedupe(statedValues);
    if (karteValues.length > 0) return { id, label, values: karteValues, state: "stated" as const };

    // 3) Karte に値が無ければ Worksheet の同じ設問を見る（同期前・同期対象外のケース）。
    const wsRule = SLOT_WORKSHEET[id];
    if (worksheet && wsRule) {
      const { values, sawUndecided } = worksheetValues(worksheet, wsRule.questionId, wsRule.options);
      if (values.length > 0) return { id, label, values, state: "stated" as const };
      if (sawUndecided) return { id, label, values: [], state: "undecided" as const };
    }

    // 4) Karte 側で「まだ決めていない」と明言されていた場合は、未回答と区別する。
    if (statedUndecided) return { id, label, values: [], state: "undecided" as const };

    return { id, label, values: [], state: "unknown" as const };
  });
}

/** 1 つでも値が入っているスロットがあるか（空状態の判定に使う）。 */
export function hasAnyConditionValue(slots: readonly ConditionSlot[]): boolean {
  return slots.some((s) => s.values.length > 0);
}

/** 値が入っているスロットの件数（「10 項目中 n 件整理済み」の表示に使う）。 */
export function countFilledConditionSlots(slots: readonly ConditionSlot[]): number {
  return slots.filter((s) => s.values.length > 0).length;
}
