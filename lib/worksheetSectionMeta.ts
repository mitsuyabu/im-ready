/**
 * 「I'm ready!」でのテーマ表示名。既存のCATEGORIES（components/Worksheet.tsx）の境界は
 * 一切変更せず、表示用のEnglish名・説明文だけをcategory.idに紐づけて追加する。
 * category.title（日本語）はそのまま「日本語補助タイトル」として使うため、ここでは重複定義しない。
 *
 * カード下部（日本語説明エリア）の背景色はテーマごとの色分けをやめ、全テーマ共通の
 * ニュートラルな配色にする（components/WorksheetSectionList.tsx側で一括指定）。
 */

export type WorksheetSectionMeta = {
  enName: string;
  description: string;
};

export const WORKSHEET_SECTION_META: Record<string, WorksheetSectionMeta> = {
  motivation: {
    enName: "Why?",
    description:
      "留学に興味を持ったきっかけや、今の生活で変えたいことを振り返りながら、「なぜ行きたいのか」を整理します。",
  },
  future: {
    enName: "My Future",
    description:
      "留学を終えたときにどんな自分でいたいか、帰国後やその先にどう活かしたいかを考えてみます。",
  },
  conditions: {
    enName: "Conditions",
    description:
      "出発時期や期間、予算、英語力、現地での仕事や学び方など、今考えている条件を整理します。",
  },
  priorities: {
    enName: "My Priorities",
    description:
      "留学先を選ぶときに何を大切にしたいのか、譲れないことと妥協できることを整理します。",
  },
  anxiety: {
    enName: "Worries",
    description:
      "今感じている不安や、決断するときに引っかかっていることを言葉にして、何が気になっているのか整理します。",
  },
  nextstep: {
    enName: "Next Step",
    description:
      "今どのくらい留学に進みたい気持ちなのかを確認し、次に知りたいことや整理したいことを見つけます。",
  },
};
