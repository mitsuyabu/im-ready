/**
 * My Plan（Karteのユーザー向け閲覧画面）専用の表示定義。
 * lib/karte.ts のschema・BLOCK_SPECSは一切変更せず、既存の安全な表示ロジック
 * （getKarteSummaryItems / getFieldLabel。値のフォーマット・certainty判定・unknown除外は
 * すべてlib/karte.ts側の実装に委ねる）を再利用し、ここでは「どのfieldをどのセクションへ
 * 出すか」という表示専用のマッピングだけを持つ。
 *
 * motivation.trueGoalHypothesisは常にinferredの特殊fieldのため、ここでの汎用field一覧には
 * 含めず、呼び出し側（components/MyPlan.tsx）でWhyセクション専用のcalloutとして別扱いする。
 */

import type { BlockName, Karte } from "@/lib/karte";
import { getKarteSummaryItems } from "@/lib/karte";

export type MyPlanSectionId =
  | "why"
  | "goal"
  | "studyPlan"
  | "schoolEnglish"
  | "lifestyle"
  | "work"
  | "worries"
  | "decision";

export type MyPlanFieldItem = {
  label: string;
  value: string;
  /** unknownはgetKarteSummaryItemsの時点で除外済みのため、ここではstated/inferredのみ */
  certainty: "stated" | "inferred";
};

export type MyPlanSection = {
  id: MyPlanSectionId;
  enName: string;
  subtitle: string;
  /** "narrative" = 見出し+段落（Why/My Goal/Worries等）。"facts" = label/value行（条件系データ） */
  mode: "narrative" | "facts";
  items: MyPlanFieldItem[];
};

type SectionDef = {
  id: MyPlanSectionId;
  enName: string;
  subtitle: string;
  mode: "narrative" | "facts";
  fields: [BlockName, string][];
};

const SECTION_DEFS: SectionDef[] = [
  {
    id: "why",
    enName: "Why?",
    subtitle: "なぜ留学したい？",
    mode: "narrative",
    fields: [
      ["motivation", "statedGoal"],
      ["motivation", "regretIfNotGo"],
    ],
  },
  {
    id: "goal",
    enName: "My Goal",
    subtitle: "留学で叶えたいこと",
    mode: "narrative",
    fields: [
      ["motivation", "desiredOutcome"],
      ["work", "postReturnCareer"],
    ],
  },
  {
    id: "studyPlan",
    enName: "Study Abroad Plan",
    subtitle: "行き先・時期・期間・予算",
    mode: "facts",
    fields: [
      ["schoolPrefs", "preferredCity"],
      ["timing", "departureTiming"],
      ["timing", "durationWeeks"],
      ["timing", "deadline"],
      ["timing", "flexibility"],
      ["budget", "totalCap"],
      ["budget", "monthlyCap"],
      ["budget", "fundingSource"],
      ["budget", "flexibility"],
    ],
  },
  {
    id: "schoolEnglish",
    enName: "School & English",
    subtitle: "英語力・学校への希望",
    mode: "facts",
    fields: [
      ["language", "selfLevel"],
      ["language", "testScores"],
      ["language", "weakSkills"],
      ["language", "education"],
      ["language", "pathwayIntent"],
      ["schoolPrefs", "courseType"],
      ["schoolPrefs", "accommodation"],
      ["schoolPrefs", "startFlexibility"],
      ["schoolPrefs", "sizeNationality"],
    ],
  },
  {
    id: "lifestyle",
    enName: "My Lifestyle",
    subtitle: "住み方・生活・学び方",
    mode: "facts",
    fields: [
      ["lifestyle", "cityVsNature"],
      ["lifestyle", "climate"],
      ["lifestyle", "safetyImportance"],
      ["lifestyle", "priceSensitivity"],
      ["lifestyle", "japaneseRatioPref"],
      ["personality", "introExtro"],
      ["personality", "needsHandholding"],
      ["personality", "learningStyle"],
    ],
  },
  {
    id: "work",
    enName: "Work",
    subtitle: "現地での仕事",
    mode: "facts",
    fields: [
      ["work", "wantsToWork"],
      ["work", "workingHolidayInterest"],
    ],
  },
  {
    id: "worries",
    enName: "Worries",
    subtitle: "不安・迷っていること",
    mode: "narrative",
    fields: [
      ["decision", "topConcern"],
      ["constraints", "nonNegotiables"],
      ["constraints", "avoidCountries"],
      ["constraints", "health"],
      ["constraints", "visaConstraints"],
      ["support", "scope"],
      ["support", "needJapaneseSupport"],
      ["support", "contactPref"],
    ],
  },
  {
    id: "decision",
    enName: "Decision",
    subtitle: "今の検討状況",
    mode: "facts",
    fields: [
      ["decision", "stage"],
      ["decision", "leaning"],
      ["decision", "decisionOwner"],
    ],
  },
];

/** 円の数値をそのまま「◯◯万円」に単位変換するだけ。相場注記・「前後」等の推測語は付けない */
function formatYen(value: number): string {
  const man = Math.round(value / 10000);
  return `${man.toLocaleString("ja-JP")}万円`;
}

export type PlanSummaryChip = { key: string; text: string };

export type PlanSummary = {
  /** 短い一覧表示用（都市・出発時期・期間・予算・ワーホリ）。statedのみ、値がある分だけ最大5件 */
  chips: PlanSummaryChip[];
  /** decision.leaning（stated時のみ）。既存のLEANING_LABELS変換込みの文をgetKarteSummaryItems経由でそのまま使う */
  leaningSentence: string | null;
};

/**
 * ページ上部の軽いsummary（Your Plan at a glance）専用。buildMyPlanSectionsとは独立した関数で、
 * 既存のsection構成・fieldマッピングには一切影響しない。新しい文言は生成せず、既存valueの
 * 安全な単位表示（週間・万円）とgetKarteSummaryItemsの既存フォーマットのみを使う。
 */
export function buildPlanSummary(karte: Karte): PlanSummary {
  const summaryItems = getKarteSummaryItems(karte);
  const byKey = new Map(summaryItems.map((item) => [`${item.block}.${item.key}`, item]));
  const chips: PlanSummaryChip[] = [];

  const city = byKey.get("schoolPrefs.preferredCity");
  if (city?.certainty === "stated") chips.push({ key: "city", text: city.value });

  const departure = byKey.get("timing.departureTiming");
  if (departure?.certainty === "stated") chips.push({ key: "departure", text: departure.value });

  const duration = karte.timing.durationWeeks;
  if (duration.certainty === "stated" && duration.value != null) {
    chips.push({ key: "duration", text: `${duration.value}週間` });
  }

  const totalCap = karte.budget.totalCap;
  if (totalCap.certainty === "stated" && totalCap.value != null) {
    chips.push({ key: "budget", text: formatYen(totalCap.value) });
  }

  const workingHoliday = karte.work.workingHolidayInterest;
  if (workingHoliday.certainty === "stated" && workingHoliday.value === true) {
    chips.push({ key: "workingHoliday", text: "Working Holiday" });
  }

  const leaning = byKey.get("decision.leaning");
  const leaningSentence = leaning?.certainty === "stated" ? leaning.value : null;

  return { chips, leaningSentence };
}

export type MyPlanData = {
  sections: MyPlanSection[];
  /** motivation.trueGoalHypothesis。値が無ければnull。valueは一切書き換えない */
  trueGoalHypothesis: string | null;
  /** 表示対象セクションの値が1件も無い、かつtrueGoalHypothesisも無い場合のみfalse */
  hasAnyContent: boolean;
};

export function buildMyPlanSections(karte: Karte): MyPlanData {
  const summaryItems = getKarteSummaryItems(karte);
  const byKey = new Map(summaryItems.map((item) => [`${item.block}.${item.key}`, item]));

  const sections: MyPlanSection[] = SECTION_DEFS.map((def) => {
    const items: MyPlanFieldItem[] = [];
    for (const [block, key] of def.fields) {
      const found = byKey.get(`${block}.${key}`);
      if (!found) continue;

      let value = found.value;
      // budgetの金額だけ、生のFieldから円の数値を読み直して万円表記にする（意味は変えない単位変換のみ）
      if (block === "budget" && key === "totalCap" && typeof karte.budget.totalCap.value === "number") {
        value = formatYen(karte.budget.totalCap.value);
      } else if (
        block === "budget" &&
        key === "monthlyCap" &&
        typeof karte.budget.monthlyCap.value === "number"
      ) {
        value = formatYen(karte.budget.monthlyCap.value);
      }

      items.push({ label: found.label, value, certainty: found.certainty });
    }
    return { id: def.id, enName: def.enName, subtitle: def.subtitle, mode: def.mode, items };
  });

  const trueGoalField = karte.motivation.trueGoalHypothesis;
  const trueGoalHypothesis =
    trueGoalField.certainty !== "unknown" && trueGoalField.value ? trueGoalField.value : null;

  const hasAnyContent = sections.some((s) => s.items.length > 0) || trueGoalHypothesis !== null;

  return { sections, trueGoalHypothesis, hasAnyContent };
}
