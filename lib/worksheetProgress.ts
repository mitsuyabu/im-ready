/**
 * Plan Homeの「Worksheetセクション」で使う、回答済み件数のカウントのみを行う。
 * 質問カタログ（ALL_QUESTIONS/Question型）はcomponents/Worksheet.tsxのものをそのまま再利用し、
 * ここで二重定義しない。「回答済み」の判定基準（kindごとの分岐）だけは、Worksheet.tsx側が
 * コンポーネント内state（useState）に閉じているため、WorksheetPersistedDataを直接受け取る
 * 同等ロジックとしてここに独立させている（Worksheet.tsx内の既存関数は変更しない）。
 */

import { ALL_QUESTIONS, type Category, type Question } from "@/lib/worksheetQuestions";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";

export function isWorksheetQuestionAnswered(question: Question, data: WorksheetPersistedData): boolean {
  switch (question.kind) {
    case "freeText":
      return (data.answers[question.id] ?? "").trim().length > 0;
    case "rating":
      return Object.keys(data.ratings[question.id] ?? {}).length > 0;
    case "ranking":
      return (data.rankings[question.id] ?? []).length > 0;
    case "compromise":
      return (data.compromises[question.id] ?? []).length > 0;
    case "singleSelect":
      return (data.singleSelections[question.id] ?? null) !== null;
    case "multiSelect":
      return (data.multiSelections[question.id] ?? []).length > 0;
  }
}

export type WorksheetProgress = { answered: number; total: number };

/** dataがnull（localStorage未保存・SSR初期状態）の場合は0件として扱う */
export function countAnsweredWorksheetQuestions(data: WorksheetPersistedData | null): WorksheetProgress {
  const total = ALL_QUESTIONS.length;
  if (!data) return { answered: 0, total };
  const answered = ALL_QUESTIONS.filter((entry) => isWorksheetQuestionAnswered(entry.question, data)).length;
  return { answered, total };
}

/**
 * 「I'm ready!」セクション一覧の各カードで使う、1テーマ（1 category）単位の回答済み件数。
 * 判定ロジックはcountAnsweredWorksheetQuestionsと同じisWorksheetQuestionAnsweredを再利用するため、
 * 全体合計（Plan Home）とテーマ別内訳（I'm ready!一覧）で数値の食い違いが起きない。
 */
export function countAnsweredInCategory(
  data: WorksheetPersistedData | null,
  category: Category,
): WorksheetProgress {
  const total = category.questions.length;
  if (!data) return { answered: 0, total };
  const answered = category.questions.filter((q) => isWorksheetQuestionAnswered(q, data)).length;
  return { answered, total };
}
