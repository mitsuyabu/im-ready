/**
 * Documents の 4 種を「留学について考えたことが形になっていく」流れ
 *   考える → 整理する → 比べる → 伝える
 * に対応させる、表示専用の metadata（Step 27）。
 *
 * このモジュールは DB・生成ロジック・API・生成可否の判定には一切関与しない。
 * UI（Documents トップのカード、各 detail のヘッダー、作成 CTA）が文言を 1 箇所から
 * 参照するためだけのもの。文言は設計確認で合意した内容から大きく変えていない。
 *
 * 対象は本人向け 3 種 ＋ 親向け 1 種のみ。agent_summary など他の内部 type は
 * ここに含めない（生成機能・詳細画面がまだ無いため）。
 *
 * 名称は今回 "School Comparison" を維持し、「候補校を比較する」という意味は
 * description / createLabel で補助する。「My Study Abroad」への大見出し変更や
 * 「作り直す → 最新の内容で更新」の文言変更は Step 28 で扱う（ここには updateLabel を置かない）。
 */

export type DocumentRoleKey =
  | "my_note"
  | "study_plan"
  | "school_comparison"
  | "parent_explanation";

export type DocumentRoleDefinition = {
  /** 「考える」「整理する」「比べる」「伝える」。控えめな eyebrow 表示用。 */
  role: string;
  /** 画面上の表示名。今回は英語名を維持（親向けのみ日本語）。 */
  title: string;
  /** カード・detail ヘッダーに常時出す 1 行説明。 */
  description: string;
  /** 未作成時の作成ボタン文言。役割を含むが長すぎない。 */
  createLabel: string;
};

export const DOCUMENT_ROLE_DEFINITIONS: Record<DocumentRoleKey, DocumentRoleDefinition> = {
  my_note: {
    role: "考える",
    title: "My Note",
    description: "今の気持ちや、なぜ留学したいのかを整理します。",
    createLabel: "My Noteを作る",
  },
  study_plan: {
    role: "整理する",
    title: "Study Plan",
    description: "現在考えている留学条件を整理したプランです。",
    createLabel: "Study Planを作る",
  },
  school_comparison: {
    role: "比べる",
    title: "School Comparison",
    description: "提示された候補校の違いを、あなたの条件と学校データをもとに整理します。",
    createLabel: "学校を比較する",
  },
  parent_explanation: {
    role: "伝える",
    title: "親向け説明資料",
    description: "家族に留学について説明するための資料です。",
    createLabel: "親向け資料を作る",
  },
} as const;

/** 未知の type は null（呼び出し側でフォールバック表示を選ぶ）。 */
export function getDocumentRoleDefinition(type: string): DocumentRoleDefinition | null {
  return type in DOCUMENT_ROLE_DEFINITIONS
    ? DOCUMENT_ROLE_DEFINITIONS[type as DocumentRoleKey]
    : null;
}
