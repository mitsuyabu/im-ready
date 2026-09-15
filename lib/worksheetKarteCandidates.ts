/**
 * AI相談で Karte に蓄積された stated 情報を、対応する Plan Worksheet 質問の「回答候補」に変換する
 * pure helper（LLM を呼ばない・完全 deterministic）。
 *
 * ここで作るのは「候補」だけ。実際の Worksheet 回答になるのは、ユーザーが detail 画面で
 * 「この内容を使う」を押して既存の回答変更経路（handleChange / handleSelectSingle /
 * handleToggleMulti）に流したときだけ。Chat の内容を Worksheet へ自動保存しない。
 *
 * mapping / eligibility / option 変換 / 表示テキストはすべてこのファイルに集約し、UI component は
 * 候補を描画して adoption を既存経路へ渡すだけにする。
 */

import type { Field, Karte } from "@/lib/karte";
import type { ChoiceOption } from "@/lib/worksheetNextStep";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import { isWorksheetQuestionAnswered } from "@/lib/worksheetProgress";
import { ALL_QUESTIONS, type Question } from "@/lib/worksheetQuestions";
import {
  ACCOMMODATION_OPTIONS,
  ADJUSTMENT_OPTIONS,
  BUDGET_OPTIONS,
  CITY_OPTIONS,
  COUNTRY_OPTIONS,
  DEPARTURE_TIMING_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  FAMILY_SHARING_OPTIONS,
  OCCUPATION_OPTIONS,
  STAY_DURATION_OPTIONS,
  STUDY_DURATION_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  matchDurationOptionId,
  matchOptionIdExactly,
  optionLabel,
} from "@/lib/worksheetConditions";

/**
 * 候補を採用したときに、既存のどの回答変更経路へ流すか。
 *   text         … handleChange(questionId, value)（freeText 本体 / 選択式の自由記入欄 / 数値）
 *   singleOption … handleSelectSingle(questionId, optionId)
 *   multiOption  … optionIds それぞれを handleToggleMulti で追加（既存の選択は消さない＝未選択のものだけ）
 */
export type WorksheetCandidateAdoption =
  | { kind: "text"; value: string }
  | { kind: "singleOption"; optionId: string }
  | { kind: "multiOption"; optionIds: string[] };

export type WorksheetKarteCandidate = {
  questionId: string;
  /** candidate card 本文に出す表示テキスト（選択肢に変換できた場合はそのラベル）。 */
  displayText: string;
  adoption: WorksheetCandidateAdoption;
  sourceField: { block: string; key: string };
};

type Converted = { adoption: WorksheetCandidateAdoption; displayText: string };

type Mapping = {
  questionId: string;
  block: string;
  key: string;
  getField: (k: Karte) => Field<unknown> | undefined;
  /**
   * Karte 値 → adoption。変換できない（意味が確定しない）なら null を返し、候補にしない。
   * 値の言い換え・要約はしない（本人の言葉をそのまま、または完全一致した選択肢ラベル）。
   */
  toAdoption: (value: unknown, question: Question) => { adoption: WorksheetCandidateAdoption; displayText: string } | null;
};

/** 文字列値を、そのままテキスト回答（freeText / 自由記入欄）として出す。 */
function asText(value: unknown): { adoption: WorksheetCandidateAdoption; displayText: string } | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0 || isPlaceholderValue(v)) return null;
  return { adoption: { kind: "text", value: v }, displayText: v };
}

/**
 * 選択式設問向け: 完全一致する選択肢があればその選択肢、無ければ自由記入欄へのテキスト候補。
 * 選択肢へは alias の完全一致でしか変換しない（部分一致で近い選択肢を選ばない）。
 */
function asOptionOrText(
  options: ChoiceOption[],
  multi: boolean,
  opts: { allowUndecided?: boolean } = {},
) {
  return (value: unknown, question: Question): Converted | null => {
    if (typeof value !== "string") return null;
    const v = value.trim();
    if (v.length === 0 || isPlaceholderValue(v)) return null;
    const optionId = matchOptionIdExactly(options, v, opts);
    if (optionId) {
      const adoption: WorksheetCandidateAdoption = multi
        ? { kind: "multiOption", optionIds: [optionId] }
        : { kind: "singleOption", optionId };
      return { adoption, displayText: optionLabel(options, optionId) ?? v };
    }
    // 選択肢に無い値は、自由記入欄がある設問でだけテキスト候補にする。
    const hasFreeText =
      (question.kind === "singleSelect" || question.kind === "multiSelect") && question.freeText != null;
    return hasFreeText ? { adoption: { kind: "text", value: v }, displayText: v } : null;
  };
}

/**
 * 期間系（自由記入欄の無い単一選択）向け: 概数の飾りを外した完全一致だけを選択肢にする。
 * 一致しなければ候補にしない（「3ヶ月」を「1〜3ヶ月」「3〜6ヶ月」のどちらかへ寄せない）。
 */
function asDurationOption(options: ChoiceOption[]) {
  return (value: unknown): Converted | null => {
    if (typeof value !== "string") return null;
    const v = value.trim();
    if (v.length === 0 || isPlaceholderValue(v)) return null;
    const optionId = matchDurationOptionId(options, v);
    if (!optionId) return null;
    return {
      adoption: { kind: "singleOption", optionId },
      displayText: optionLabel(options, optionId) ?? v,
    };
  };
}

/**
 * 希望国（string[]）→ 国の複数選択。全要素が選択肢に完全一致したときだけ選択肢として追加し、
 * 1つでも一致しない要素があれば、本人の言葉を「、」でつないだ自由記入候補にする（一部だけ選んで
 * 残りを黙って捨てない）。
 */
function asCountries(value: unknown, question: Question): Converted | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !isPlaceholderValue(x));
  if (items.length === 0) return null;
  const ids = items.map((x) => matchOptionIdExactly(COUNTRY_OPTIONS, x));
  if (ids.every((id): id is string => id !== null)) {
    const unique = Array.from(new Set(ids));
    return {
      adoption: { kind: "multiOption", optionIds: unique },
      displayText: unique.map((id) => optionLabel(COUNTRY_OPTIONS, id) ?? id).join("、"),
    };
  }
  const hasFreeText = question.kind === "multiSelect" && question.freeText != null;
  const text = items.join("、");
  return hasFreeText ? { adoption: { kind: "text", value: text }, displayText: text } : null;
}

/**
 * mapping 表。追加するときは「Worksheet 設問の意味 == Karte field の意味」が完全一致し、
 * deterministic に変換できるものだけにすること。getter は malformed Karte でも throw しないよう
 * optional chaining で書く。
 *
 * 候補にしないもの:
 *   - timing.durationWeeks / budget.totalCap 等の数値 field … 週や金額をレンジの選択肢へ寄せない
 *   - local-work ← work.wantsToWork=true … 「ぜひ」「できれば」のどちらかを推測で選ぶことになるため。
 *     false（働かない）だけは「働く予定はない」と意味が完全一致するので候補にする
 *   - work.postReturnCareer 等、近いが別の意味の field
 */
const MAPPINGS: Mapping[] = [
  {
    questionId: "regret",
    block: "motivation",
    key: "regretIfNotGo",
    getField: (k) => k.motivation?.regretIfNotGo,
    toAdoption: asText,
  },
  {
    questionId: "anxiety-biggest",
    block: "decision",
    key: "topConcern",
    getField: (k) => k.decision?.topConcern,
    toAdoption: asText,
  },
  {
    questionId: "english-level",
    block: "language",
    key: "selfLevel",
    getField: (k) => k.language?.selfLevel,
    toAdoption: asOptionOrText(ENGLISH_LEVEL_OPTIONS, false),
  },
  {
    questionId: "timing",
    block: "timing",
    key: "departureTiming",
    getField: (k) => k.timing?.departureTiming,
    toAdoption: asOptionOrText(DEPARTURE_TIMING_OPTIONS, false),
  },
  {
    questionId: "destination-city",
    block: "schoolPrefs",
    key: "preferredCity",
    getField: (k) => k.schoolPrefs?.preferredCity,
    toAdoption: asOptionOrText(CITY_OPTIONS, true),
  },
  {
    questionId: "study-format",
    block: "schoolPrefs",
    key: "courseType",
    getField: (k) => k.schoolPrefs?.courseType,
    toAdoption: asOptionOrText(STUDY_FORMAT_OPTIONS, true),
  },
  {
    questionId: "accommodation",
    block: "schoolPrefs",
    key: "accommodation",
    getField: (k) => k.schoolPrefs?.accommodation,
    toAdoption: asOptionOrText(ACCOMMODATION_OPTIONS, true),
  },
  {
    questionId: "occupation",
    block: "profile",
    key: "occupation",
    getField: (k) => k.profile?.occupation,
    toAdoption: asOptionOrText(OCCUPATION_OPTIONS, false),
  },
  {
    questionId: "age",
    block: "profile",
    key: "age",
    getField: (k) => k.profile?.age,
    toAdoption: (value) => {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 10 || value > 99) return null;
      return { adoption: { kind: "text", value: String(value) }, displayText: `${value}歳` };
    },
  },
  {
    questionId: "destination-country",
    block: "schoolPrefs",
    key: "preferredCountries",
    getField: (k) => k.schoolPrefs?.preferredCountries,
    toAdoption: asCountries,
  },
  {
    questionId: "stay-duration",
    block: "timing",
    key: "durationLabel",
    getField: (k) => k.timing?.durationLabel,
    toAdoption: asDurationOption(STAY_DURATION_OPTIONS),
  },
  {
    questionId: "budget",
    block: "budget",
    key: "rangeLabel",
    getField: (k) => k.budget?.rangeLabel,
    toAdoption: asOptionOrText(BUDGET_OPTIONS, false, { allowUndecided: true }),
  },
  {
    questionId: "study-duration",
    block: "schoolPrefs",
    key: "studyDurationLabel",
    getField: (k) => k.schoolPrefs?.studyDurationLabel,
    toAdoption: asDurationOption(STUDY_DURATION_OPTIONS),
  },
  {
    questionId: "school-work-adjustment",
    block: "constraints",
    key: "currentCommitmentPlan",
    getField: (k) => k.constraints?.currentCommitmentPlan,
    toAdoption: asOptionOrText(ADJUSTMENT_OPTIONS, false, { allowUndecided: true }),
  },
  {
    questionId: "family-sharing",
    block: "decision",
    key: "familySharingStatus",
    getField: (k) => k.decision?.familySharingStatus,
    toAdoption: asOptionOrText(FAMILY_SHARING_OPTIONS, false, { allowUndecided: true }),
  },
  {
    questionId: "local-work",
    block: "work",
    key: "wantsToWork",
    getField: (k) => k.work?.wantsToWork,
    toAdoption: (value) =>
      value === false
        ? { adoption: { kind: "singleOption", optionId: "work-none" }, displayText: "働く予定はない" }
        : null,
  },
];

const EMPTY_ANSWERS: WorksheetPersistedData = {
  answers: {},
  ratings: {},
  rankings: {},
  compromises: {},
  singleSelections: {},
  multiSelections: {},
};

/** 明らかな placeholder（空・記号だけ・1文字）を弾く。意味のある「わからない」等は弾かない。 */
function isPlaceholderValue(v: string): boolean {
  const t = v.trim();
  if (t.length < 2) return true;
  if (/^[-–—ー・.。,、_\s]+$/.test(t)) return true;
  return false;
}

const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((e) => [e.question.id, e.question]));

/**
 * その Plan の Karte（normalizeKarte 済み）と現在の Worksheet 回答から、表示してよい候補だけ返す。
 *
 * eligibility（すべて満たすときだけ候補）:
 *   - 対応する Worksheet 設問が存在し、**未回答**（freeText / 選択 / 自由記入欄 / 数値のどれも空）
 *   - Karte field が `certainty === "stated"`（inferred / unknown は出さない）
 *   - その field が handoff.conflicts に無い
 *   - 値が meaningful（placeholder でない）で、上の mapping で意味が確定する
 *   - **source が Chat 由来**（"chat"、または source 未記録の旧データ＝RPC 上 chat 扱い）。
 *     Worksheet 自身が書いた値（source="worksheet"）を「AI相談からの候補」として出さない。
 */
export function buildWorksheetKarteCandidates(
  karte: Karte | null | undefined,
  answers: WorksheetPersistedData | null | undefined,
): WorksheetKarteCandidate[] {
  if (!karte) return [];
  const data = answers ?? EMPTY_ANSWERS;
  const conflictKeys = new Set(
    (karte.handoff?.conflicts ?? []).map((c) => `${c.block}.${c.key}`),
  );

  const out: WorksheetKarteCandidate[] = [];
  for (const m of MAPPINGS) {
    const question = QUESTION_BY_ID.get(m.questionId);
    if (!question) continue;

    // 本人の Worksheet 回答を優先。既に回答があれば候補を出さない。
    if (isWorksheetQuestionAnswered(question, data)) continue;

    // conflict 中の source field は候補にしない。
    if (conflictKeys.has(`${m.block}.${m.key}`)) continue;

    const field = m.getField(karte);
    if (!field || field.certainty !== "stated") continue;
    if (field.source === "worksheet" || field.source === "profile") continue;

    const converted = m.toAdoption(field.value, question);
    if (!converted) continue;

    out.push({
      questionId: m.questionId,
      displayText: converted.displayText,
      adoption: converted.adoption,
      sourceField: { block: m.block, key: m.key },
    });
  }
  return out;
}

/** Plan Home の「AI相談からN件候補あり」表示に使う件数。helper を再利用して二重ロジックを避ける。 */
export function countWorksheetKarteCandidates(
  karte: Karte | null | undefined,
  answers: WorksheetPersistedData | null | undefined,
): number {
  return buildWorksheetKarteCandidates(karte, answers).length;
}
