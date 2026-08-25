/**
 * ワークシート「次の一歩」カテゴリのQ1（単一選択）・Q2（複数選択）の選択肢。
 * 優先順位カテゴリの PRIORITY_ITEMS と同じ考え方で、id付きの安定した定数として持つ
 * （worksheetPriorities.ts には追加しない。優先順位カテゴリのコードには一切触れないため独立ファイルにする）。
 * 特にQ2は、将来サービス側が「次に何を提供すべきか」を参照する可能性があるデータ。
 */

export type ChoiceOption = { id: string; label: string };

/** Q1: 今の時点で、留学についてどのくらい進みたい気持ちですか？（単一選択） */
export const READINESS_OPTIONS: ChoiceOption[] = [
  { id: "asap", label: "できるだけ早く、具体的に進めたい" },
  { id: "conditional", label: "条件が合えば、進めたい" },
  { id: "researching", label: "もう少し、調べたり考えたりしたい" },
  { id: "needsConsult", label: "誰かに相談してから、決めたい" },
  { id: "undecided", label: "今はまだ、留学するかどうかも迷っている" },
  { id: "leaningNo", label: "今のところ、留学しない方向で考えている" },
];

/** Q2: 次に、確認したい・整理したいことは何ですか？（複数選択） */
export const NEXT_TOPICS: ChoiceOption[] = [
  { id: "countryCity", label: "自分に合う国・都市を知りたい" },
  { id: "school", label: "自分に合う学校を知りたい" },
  { id: "cost", label: "費用を具体的に知りたい" },
  { id: "timing", label: "留学できる時期や期間を整理したい" },
  { id: "visa", label: "ビザや渡航条件を知りたい" },
  { id: "localWork", label: "現地での仕事について知りたい" },
  { id: "accommodation", label: "滞在方法について知りたい" },
  { id: "englishLevel", label: "英語力について相談したい" },
  { id: "explainToFamily", label: "家族や周囲への説明を整理したい" },
  { id: "expertConsult", label: "専門家・エージェントに相談したい" },
];
