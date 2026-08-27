/**
 * plan_documents.type の許容値と、Documents一覧でのユーザー向けlabel。
 * DB側のCHECK constraint（supabase/migrations/20260828_plan_documents.sql）と
 * この配列は同じ5値で揃えること。生成機能自体はまだ無いため、ここには
 * 「表示のための値↔label変換」だけを置く（生成条件・promptには関与しない）。
 */
export const PLAN_DOCUMENT_TYPES = [
  "parent_explanation",
  "my_note",
  "study_plan",
  "agent_summary",
  "school_comparison",
] as const;

export type PlanDocumentType = (typeof PLAN_DOCUMENT_TYPES)[number];

export const PLAN_DOCUMENT_TYPE_LABELS: Record<PlanDocumentType, string> = {
  parent_explanation: "親向け説明資料",
  my_note: "My Note",
  study_plan: "留学計画書",
  agent_summary: "エージェント相談用まとめ",
  school_comparison: "学校比較資料",
};

function isPlanDocumentType(value: string): value is PlanDocumentType {
  return (PLAN_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** 未知のtype（将来DB側が先に拡張された等）はそのまま生値を表示するフォールバック */
export function planDocumentTypeLabel(type: string): string {
  return isPlanDocumentType(type) ? PLAN_DOCUMENT_TYPE_LABELS[type] : type;
}
