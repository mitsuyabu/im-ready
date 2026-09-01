/**
 * 「I'm ready!」でのテーマ表示名。既存のCATEGORIES（components/Worksheet.tsx）の境界は
 * 一切変更せず、表示用のEnglish名・短いサブコピー・説明文だけをcategory.idに紐づけて追加する。
 * category.title（日本語）はそのまま「日本語補助タイトル」として使うため、ここでは重複定義しない。
 *
 * - enName: カードやテーマ詳細で見せる英語名（serif）
 * - tagline: テーマ一覧カードのサブコピー（共有デザインに合わせた短い1行）
 * - description: テーマ詳細などで使う、少し長めの説明文
 */

export type WorksheetSectionMeta = {
  enName: string;
  tagline: string;
  description: string;
};

export const WORKSHEET_SECTION_META: Record<string, WorksheetSectionMeta> = {
  motivation: {
    enName: "Why?",
    tagline: "なぜ留学に惹かれているのか",
    description:
      "留学に興味を持ったきっかけや、今の生活で変えたいことを振り返りながら、「なぜ行きたいのか」を整理します。",
  },
  future: {
    enName: "My Future",
    tagline: "留学の先に、どんな自分でいたいか",
    description:
      "留学を終えたときにどんな自分でいたいか、帰国後やその先にどう活かしたいかを考えてみます。",
  },
  conditions: {
    enName: "Conditions",
    tagline: "時期・予算・英語・暮らしの条件",
    description:
      "出発時期や期間、予算、英語力、現地での仕事や学び方など、今考えている条件を整理します。",
  },
  priorities: {
    enName: "My Priorities",
    tagline: "譲れないこと、大切にしたいこと",
    description:
      "留学先を選ぶときに何を大切にしたいのか、譲れないことと妥協できることを整理します。",
  },
  anxiety: {
    enName: "Worries",
    tagline: "いま感じている不安を言葉にする",
    description:
      "今感じている不安や、決断するときに引っかかっていることを言葉にして、何が気になっているのか整理します。",
  },
  nextstep: {
    enName: "Next Step",
    tagline: "いまの自分に合う次の一歩",
    description:
      "今どのくらい留学に進みたい気持ちなのかを確認し、次に知りたいことや整理したいことを見つけます。",
  },
};
