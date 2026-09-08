/**
 * AI相談で Karte に蓄積された stated 情報を、対応する Plan Worksheet 質問の「回答候補」に変換する
 * pure helper（LLM を呼ばない・完全 deterministic・§26）。
 *
 * ここで作るのは「候補」だけ。実際の Worksheet 回答になるのは、ユーザーが detail 画面で
 * 「この内容を使う」を押して既存の handleChange 経路に流したときだけ（§10）。Chat の内容を
 * Worksheet へ自動保存しない。
 *
 * MVP は「意味が完全に一致し、既存の Worksheet→Karte 逆写像（deriveWorksheetKartePatch）も
 * 持つ freeText 3 問」だけに限定する（§3 / §4）。すべて Karte string を verbatim で Worksheet の
 * 自由記述へ入れるだけなので、enum 推測も AI 追加解釈も発生しない（§12）。採用後に
 * Worksheet→Karte sync が走っても値が同一なので不要な conflict を作らない（§11）。
 */

import type { Field, Karte } from "@/lib/karte";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import { isWorksheetQuestionAnswered } from "@/lib/worksheetProgress";
import { ALL_QUESTIONS } from "@/lib/worksheetQuestions";

export type WorksheetKarteCandidate = {
  questionId: string;
  /** Worksheet に保存する値（MVP は freeText のみ＝ string）。 */
  value: string;
  /** candidate card 本文に出す表示テキスト。 */
  displayText: string;
  sourceField: { block: string; key: string };
};

/**
 * MVP mapping。追加するときは「Worksheet 設問の意味 == Karte field の意味」が完全一致し、
 * かつ deterministic に変換できる（enum を文字列から推測しない）ものだけにすること。
 * getter は malformed Karte でも throw しないよう optional chaining で書く（§24）。
 */
const MVP_MAP: {
  questionId: string;
  block: string;
  key: string;
  getField: (k: Karte) => Field<unknown> | undefined;
}[] = [
  {
    questionId: "regret",
    block: "motivation",
    key: "regretIfNotGo",
    getField: (k) => k.motivation?.regretIfNotGo,
  },
  {
    questionId: "english-level",
    block: "language",
    key: "selfLevel",
    getField: (k) => k.language?.selfLevel,
  },
  {
    questionId: "anxiety-biggest",
    block: "decision",
    key: "topConcern",
    getField: (k) => k.decision?.topConcern,
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

/** 明らかな placeholder（空・記号だけ・1文字）を弾く。意味のある「わからない」等は弾かない（§2）。 */
function isPlaceholderValue(v: string): boolean {
  const t = v.trim();
  if (t.length < 2) return true;
  if (/^[-–—ー・.。,、_\s]+$/.test(t)) return true;
  return false;
}

const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((e) => [e.question.id, e.question]));

/**
 * その Plan の Karte（normalizeKarte 済み）と現在の Worksheet 回答から、表示してよい候補だけ返す。
 * eligibility（§6）: 対応 field が存在 / certainty==="stated" / conflict なし / value 有効 /
 * Worksheet 未回答 / deterministic 変換可能。いずれか欠ければ候補にしない。
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
  for (const m of MVP_MAP) {
    const question = QUESTION_BY_ID.get(m.questionId);
    if (!question || question.kind !== "freeText") continue;

    // 本人の明示 Worksheet 回答を優先。既に回答があれば候補を出さない（§6 / §20）。
    if (isWorksheetQuestionAnswered(question, data)) continue;

    // conflict 中の source field は候補にしない（§7）。
    if (conflictKeys.has(`${m.block}.${m.key}`)) continue;

    const field = m.getField(karte);
    // inferred / unknown は候補にしない。stated のみ（§8）。
    if (!field || field.certainty !== "stated") continue;
    if (typeof field.value !== "string") continue;

    const value = field.value.trim();
    if (value.length === 0 || isPlaceholderValue(value)) continue;

    out.push({
      questionId: m.questionId,
      value,
      displayText: value,
      sourceField: { block: m.block, key: m.key },
    });
  }
  return out;
}

/** Plan Home の「AI相談からN件候補あり」表示に使う件数。helper を再利用して二重ロジックを避ける（§15）。 */
export function countWorksheetKarteCandidates(
  karte: Karte | null | undefined,
  answers: WorksheetPersistedData | null | undefined,
): number {
  return buildWorksheetKarteCandidates(karte, answers).length;
}
