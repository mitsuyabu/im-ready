/**
 * 留学エージェント 構造化データ
 *
 * 提案パイプライン（lib/proposal/engine.ts、未実装）のハード足切り・LLM選定に使う「器」。
 *
 * 【中立性ガード・重要】
 * feeModel（手数料モデル）と acceptsReferral（送客受け入れ可否）はデータとして持つが、
 * 提案の順位付け（ランキング）には一切使わないこと。高手数料・送客受け入れ可のエージェントを
 * 優先的に選ばない。エージェントの選定はユーザーとのフィット（相性）のみで行う
 * （CLAUDE.md の「中立を保つ」ルール、および docs/SPEC.md §F の公平性ガードに従う）。
 * lib/proposal/engine.ts を実装する際、hardFilter / ランキングロジックはこの2項目を参照しないこと。
 *
 * データ運用ルール（cities.ts, schools.ts, areas.ts と同様）:
 * - 認定情報・対応スピード等の中身をAIが創作して埋めないこと。一次情報を出所にする。
 * - 変動しうる値には必ず source と fetchedAt を付ける。
 * - 実データ（値）は今回投入しない。型と、必要なら空 or サンプルのみ。
 */

export type AgentPurposeStrength = "language" | "working_holiday" | "university_prep" | "career";
export type AgentSupportScope = "application" | "visa" | "housing" | "post_arrival";
export type ContactMethod = "line" | "email" | "phone" | "chat" | "in_person";

/** 手数料モデル。ランキングには使わない（ファイル冒頭の中立性ガード参照） */
export type FeeModel = "free" | "paid";

export interface Agent {
  agentId: string;
  name: string;
  /** 強みを持つ国（自由記述の国名配列。固定リストにしない） */
  strongCountries: string[];
  purposeStrength: AgentPurposeStrength[];
  supportScope: AgentSupportScope[];
  languages: string[];
  contactMethods: ContactMethod[];
  /** 連絡の速さの傾向（監修値。自由記述。例: "即レス傾向" "1〜2営業日"） */
  contactSpeedTrend?: string;
  /** 認定・所属団体（例: "J-CROSS", "JAOS"）。団体は増減しうるため固定語彙にせず自由記述の配列で持つ */
  certifications?: string[];
  /** 手数料モデル。データとして持つが、提案の順位付けには使わない（ファイル冒頭参照） */
  feeModel?: FeeModel;
  /** 送客受け入れ可否。データとして持つが、提案の順位付けには使わない（ファイル冒頭参照） */
  acceptsReferral?: boolean;
  tags: string[];
  source: string;
  sourceUrl?: string;
  /** データ取得日（ISO日付） */
  fetchedAt: string;
}

// 実データ（値）は今回投入しない。実在するエージェントの情報は人が後で監修して入れる。
export const AGENTS: Agent[] = [];
