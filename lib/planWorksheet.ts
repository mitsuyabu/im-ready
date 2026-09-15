/**
 * Plan Worksheet の回答をサーバー（plan_worksheet）に保持するための読み書きヘルパー。
 *
 * - 正本は plan_worksheet.state（1 Plan = 1 行）。localStorage は補助キャッシュ / 既存回答の移行元。
 * - lib/planChat.ts と同じく、server / browser どちらの SupabaseClient でも使える形にする。
 *   RLS（plans.user_id 経由の所有者判定）が常に有効で、service role key は使わない。
 * - 同時編集は楽観的排他（revision）＋ 設問単位のマージで扱う。Realtime は使わない。
 * - 匿名の /worksheet はこのファイルを使わない（従来どおり localStorage のみ）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sanitizeWorksheetState,
  type WorksheetPersistedData,
  type WorksheetValidIds,
} from "@/lib/worksheetStorage";
import {
  ALL_MULTI_SELECT_OPTION_IDS,
  ALL_QUESTIONS,
  ALL_SINGLE_SELECT_OPTION_IDS,
} from "@/lib/worksheetQuestions";
import { COMPROMISE_NONE_ID, PRIORITY_ITEMS } from "@/lib/worksheetPriorities";

/** localStorage 復元・サーバー読み込みの両方で使う、カタログ上「実在する」id の集合。 */
export const WORKSHEET_VALID_IDS: WorksheetValidIds = {
  questionIds: new Set(ALL_QUESTIONS.map((entry) => entry.question.id)),
  priorityItemIds: new Set(PRIORITY_ITEMS.map((item) => item.id)),
  compromiseNoneId: COMPROMISE_NONE_ID,
  readinessOptionIds: ALL_SINGLE_SELECT_OPTION_IDS,
  topicOptionIds: ALL_MULTI_SELECT_OPTION_IDS,
};

export function createEmptyWorksheetState(): WorksheetPersistedData {
  return { answers: {}, ratings: {}, rankings: {}, compromises: {}, singleSelections: {}, multiSelections: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * jsonb（unknown）を WorksheetPersistedData の形に整え、存在しない設問・選択肢 id を捨てる。
 * 形が壊れていても throw せず、読める部分だけ残す（fake な回答は作らない）。
 */
export function coerceWorksheetState(raw: unknown): WorksheetPersistedData {
  const src = isRecord(raw) ? raw : {};
  const empty = createEmptyWorksheetState();
  const shaped: WorksheetPersistedData = {
    answers: isRecord(src.answers) ? (src.answers as WorksheetPersistedData["answers"]) : empty.answers,
    ratings: isRecord(src.ratings) ? (src.ratings as WorksheetPersistedData["ratings"]) : empty.ratings,
    rankings: isRecord(src.rankings) ? (src.rankings as WorksheetPersistedData["rankings"]) : empty.rankings,
    compromises: isRecord(src.compromises)
      ? (src.compromises as WorksheetPersistedData["compromises"])
      : empty.compromises,
    singleSelections: isRecord(src.singleSelections)
      ? (src.singleSelections as WorksheetPersistedData["singleSelections"])
      : empty.singleSelections,
    multiSelections: isRecord(src.multiSelections)
      ? (src.multiSelections as WorksheetPersistedData["multiSelections"])
      : empty.multiSelections,
  };
  return sanitizeWorksheetState(shaped, WORKSHEET_VALID_IDS);
}

/** 1問でも何か答えがあるか（空文字・空配列・空の評価は答えとみなさない）。移行判定に使う。 */
export function hasAnyWorksheetAnswer(data: WorksheetPersistedData): boolean {
  if (Object.values(data.answers).some((v) => typeof v === "string" && v.trim().length > 0)) return true;
  if (Object.values(data.ratings).some((r) => isRecord(r) && Object.keys(r).length > 0)) return true;
  if (Object.values(data.rankings).some((ids) => Array.isArray(ids) && ids.length > 0)) return true;
  if (Object.values(data.compromises).some((ids) => Array.isArray(ids) && ids.length > 0)) return true;
  if (Object.values(data.singleSelections).some((v) => typeof v === "string" && v.length > 0)) return true;
  if (Object.values(data.multiSelections).some((ids) => Array.isArray(ids) && ids.length > 0)) return true;
  return false;
}

/** key の並び順に依存しない比較用の文字列化（同じ内容なら同じ文字列）。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function isSameWorksheetState(a: WorksheetPersistedData, b: WorksheetPersistedData): boolean {
  return stableStringify(a) === stableStringify(b);
}

const COLLECTIONS = [
  "answers",
  "ratings",
  "rankings",
  "compromises",
  "singleSelections",
  "multiSelections",
] as const;

/**
 * 設問単位の 3-way マージ。
 *   base   … この端末が最後にサーバーと一致していた状態
 *   local  … この端末の現在の状態
 *   server … サーバーの最新状態（別端末の保存を含む）
 *
 * 各 collection の設問ごとに、この端末で base から変えたもの（削除・解除を含む）だけ local を採用し、
 * それ以外はサーバーの値を採用する。別々の設問を別端末で答えた場合は両方残る。
 *
 * 同じ設問を両方で変えていた場合（onBothChanged）:
 *   "local"  … 編集中の保存競合。いま操作している端末の値を採用する（既定）
 *   "server" … 前回保存できなかった変更を後日復元するとき。別端末で新しく保存された値を優先する
 */
export function mergeWorksheetStates(
  base: WorksheetPersistedData,
  local: WorksheetPersistedData,
  server: WorksheetPersistedData,
  onBothChanged: "local" | "server" = "local",
): WorksheetPersistedData {
  const result = createEmptyWorksheetState();
  for (const collection of COLLECTIONS) {
    const b = base[collection] as Record<string, unknown>;
    const l = local[collection] as Record<string, unknown>;
    const s = server[collection] as Record<string, unknown>;
    const out = result[collection] as Record<string, unknown>;
    const keys = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(s)]);
    for (const key of keys) {
      const changedHere = stableStringify(l[key]) !== stableStringify(b[key]);
      const changedThere = stableStringify(s[key]) !== stableStringify(b[key]);
      const useLocal = changedHere && (onBothChanged === "local" || !changedThere);
      const value = useLocal ? l[key] : s[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* DB 読み書き                                                          */
/* ------------------------------------------------------------------ */

export type PlanWorksheetRow = { state: WorksheetPersistedData; revision: number };

/**
 * available=false … table 未適用（migration 未 apply）や一時的な DB error。呼び出し側は
 *                   サーバー同期を使わず、従来どおり localStorage だけで動かす（回答を失わない）。
 * row=null        … その Plan の Worksheet がまだサーバーに無い（正常な空、または移行前）。
 */
export type LoadedPlanWorksheet = { available: false } | { available: true; row: PlanWorksheetRow | null };

export async function loadPlanWorksheet(supabase: SupabaseClient, planId: string): Promise<LoadedPlanWorksheet> {
  const { data, error } = await supabase
    .from("plan_worksheet")
    .select("state, revision")
    .eq("plan_id", planId)
    .maybeSingle();

  if (error) {
    // 回答内容はログに出さない。内部 message のみ。
    console.error("plan_worksheet load error:", error.message);
    return { available: false };
  }
  if (!data) return { available: true, row: null };

  const row = data as { state: unknown; revision: unknown };
  const revision = typeof row.revision === "number" && Number.isInteger(row.revision) ? row.revision : 1;
  return { available: true, row: { state: coerceWorksheetState(row.state), revision } };
}

export type SavePlanWorksheetResult =
  | { status: "saved"; revision: number }
  /** 別端末が先に作成・保存していた。最新を読み直してマージしてから保存し直す。 */
  | { status: "conflict" }
  | { status: "error" };

/** まだ行が無い Plan の初回保存（既存 localStorage 回答の移行もここを通る）。 */
export async function insertPlanWorksheet(
  supabase: SupabaseClient,
  planId: string,
  state: WorksheetPersistedData,
): Promise<SavePlanWorksheetResult> {
  const { data, error } = await supabase
    .from("plan_worksheet")
    .insert({ plan_id: planId, state, revision: 1 })
    .select("revision")
    .single();

  if (error) {
    if (error.code === "23505") return { status: "conflict" };
    console.error("plan_worksheet insert error:", error.message);
    return { status: "error" };
  }
  return { status: "saved", revision: (data as { revision: number }).revision };
}

/**
 * 楽観的排他つき UPDATE。`revision = baseRevision` の行だけを更新するので、1 本の UPDATE 文の中で
 * 「読んだ後に誰も保存していない」ことが保証される（同時実行時は後から来た方が 0 行になる）。
 */
export async function updatePlanWorksheet(
  supabase: SupabaseClient,
  planId: string,
  state: WorksheetPersistedData,
  baseRevision: number,
): Promise<SavePlanWorksheetResult> {
  const { data, error } = await supabase
    .from("plan_worksheet")
    .update({ state, revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle();

  if (error) {
    console.error("plan_worksheet update error:", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "conflict" };
  return { status: "saved", revision: (data as { revision: number }).revision };
}

/**
 * 複数 Plan の Worksheet をまとめて読む（/worksheets 一覧用・1 クエリ）。
 * 読み込みに失敗した場合は全 Plan を available=false として返す（呼び出し側は localStorage 表示に戻す）。
 */
export async function loadPlanWorksheetsForPlans(
  supabase: SupabaseClient,
  planIds: string[],
): Promise<Record<string, LoadedPlanWorksheet>> {
  const out: Record<string, LoadedPlanWorksheet> = {};
  if (planIds.length === 0) return out;

  const { data, error } = await supabase
    .from("plan_worksheet")
    .select("plan_id, state, revision")
    .in("plan_id", planIds);

  if (error) {
    console.error("plan_worksheet list load error:", error.message);
    for (const id of planIds) out[id] = { available: false };
    return out;
  }

  for (const id of planIds) out[id] = { available: true, row: null };
  for (const raw of (data ?? []) as { plan_id: string; state: unknown; revision: unknown }[]) {
    const revision = typeof raw.revision === "number" && Number.isInteger(raw.revision) ? raw.revision : 1;
    out[raw.plan_id] = { available: true, row: { state: coerceWorksheetState(raw.state), revision } };
  }
  return out;
}
