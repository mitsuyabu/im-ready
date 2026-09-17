/**
 * Consultation Sheet（留学相談シート）の型・sanitize・マージ・DB 読み書き。pure（DB は引数の client 経由）。
 *
 * 1 Plan = 1 行（plan_consultation_sheet）。正本はサーバーで、ユーザーが追加・編集・完了・削除した項目を保持する。
 * 候補（Karte / Worksheet から計算するもの）は保存せず、扱い済みの候補 key だけを保存する
 * （lib/consultationCandidates.ts）。server / browser どちらの SupabaseClient でも使える。RLS 前提。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 相談テーマのカテゴリ（UI では小さなラベルとして出すだけ。選択 UI は持たない）。 */
export const CONSULTATION_CATEGORIES = [
  "国・都市",
  "学校",
  "英語",
  "予算",
  "ビザ",
  "仕事",
  "滞在",
  "出発時期",
  "留学期間",
  "家族",
  "その他",
] as const;
export type ConsultationCategory = (typeof CONSULTATION_CATEGORIES)[number];

export type ConsultationItem = {
  id: string;
  text: string;
  /** To Do（todos）のときだけ意味を持つ。 */
  completed?: boolean;
  category?: ConsultationCategory;
  /** user = 自分で追加 / candidate = 候補から追加（追加後は通常の項目として自由に編集できる）。 */
  source: "user" | "candidate";
  createdAt: string;
  updatedAt: string;
};

export const CONSULTATION_LISTS = ["topics", "todos", "findings", "nextActions"] as const;
export type ConsultationListKey = (typeof CONSULTATION_LISTS)[number];

export type ConsultationSheetState = {
  /** 相談したいこと */
  topics: ConsultationItem[];
  /** 確認したいこと / To Do（相談時・相談前に確認する質問やチェック事項） */
  todos: ConsultationItem[];
  /** 相談して分かったこと（ユーザーが書くメモ。AI は書かない） */
  findings: ConsultationItem[];
  /** 次にやること（相談後に実行するアクション） */
  nextActions: ConsultationItem[];
  /** 「追加する」「表示しない」と操作済みの候補 key。候補を再計算しても出し直さない。 */
  handledCandidateKeys: string[];
};

export const CONSULTATION_TEXT_MAX = 300;
const LIST_MAX = 100;

export function createEmptyConsultationSheet(): ConsultationSheetState {
  return { topics: [], todos: [], findings: [], nextActions: [], handledCandidateKeys: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sanitizeItem(raw: unknown): ConsultationItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > 80) return null;
  if (typeof raw.text !== "string") return null;
  const text = raw.text.slice(0, CONSULTATION_TEXT_MAX);
  const now = new Date(0).toISOString();
  const item: ConsultationItem = {
    id: raw.id,
    text,
    source: raw.source === "candidate" ? "candidate" : "user",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
  if (raw.completed === true) item.completed = true;
  if (typeof raw.category === "string" && (CONSULTATION_CATEGORIES as readonly string[]).includes(raw.category)) {
    item.category = raw.category as ConsultationCategory;
  }
  return item;
}

/** jsonb（unknown）を state の形に整える。壊れた要素は捨て、読める部分だけ残す（fake な項目は作らない）。 */
export function coerceConsultationSheet(raw: unknown): ConsultationSheetState {
  const src = isRecord(raw) ? raw : {};
  const out = createEmptyConsultationSheet();
  for (const list of CONSULTATION_LISTS) {
    const arr = Array.isArray(src[list]) ? (src[list] as unknown[]) : [];
    const seen = new Set<string>();
    for (const r of arr) {
      const item = sanitizeItem(r);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out[list].push(item);
      if (out[list].length >= LIST_MAX) break;
    }
  }
  if (Array.isArray(src.handledCandidateKeys)) {
    out.handledCandidateKeys = Array.from(
      new Set(src.handledCandidateKeys.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 200)),
    );
  }
  return out;
}

/** 1 件でも何か入っているか（空のシートは保存しない判定に使う）。 */
export function hasAnyConsultationContent(state: ConsultationSheetState): boolean {
  return CONSULTATION_LISTS.some((l) => state[l].length > 0) || state.handledCandidateKeys.length > 0;
}

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

export function isSameConsultationSheet(a: ConsultationSheetState, b: ConsultationSheetState): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * 項目（id）単位の 3-way マージ。別端末で別々の項目を追加・編集・完了・削除しても両方残る。
 * 同じ項目を両方で変えていた場合（onBothChanged）:
 *   "local"  … 編集中の保存競合。いま保存しようとしている端末の値を採用する（既定）
 *   "server" … 前回保存できなかった変更を後日取り戻すとき。別端末で後から保存された値を優先する
 * 並び順はサーバー側の順を基準に、この端末で新しく足した項目を後ろに付ける。
 */
export function mergeConsultationSheets(
  base: ConsultationSheetState,
  local: ConsultationSheetState,
  server: ConsultationSheetState,
  onBothChanged: "local" | "server" = "local",
): ConsultationSheetState {
  const result = createEmptyConsultationSheet();
  for (const list of CONSULTATION_LISTS) {
    const b = new Map(base[list].map((i) => [i.id, i]));
    const l = new Map(local[list].map((i) => [i.id, i]));
    const s = new Map(server[list].map((i) => [i.id, i]));
    const order = [...server[list].map((i) => i.id), ...local[list].map((i) => i.id).filter((id) => !s.has(id))];
    for (const id of order) {
      const changedHere = stableStringify(l.get(id)) !== stableStringify(b.get(id));
      const changedThere = stableStringify(s.get(id)) !== stableStringify(b.get(id));
      const useLocal = changedHere && (onBothChanged === "local" || !changedThere);
      const value = useLocal ? l.get(id) : s.get(id);
      if (value) result[list].push(value);
    }
  }
  result.handledCandidateKeys = Array.from(new Set([...server.handledCandidateKeys, ...local.handledCandidateKeys]));
  return result;
}

/* ------------------------------------------------------------------ */
/* DB 読み書き（plan_worksheet と同じ作法）                              */
/* ------------------------------------------------------------------ */

export type ConsultationSheetRow = { state: ConsultationSheetState; revision: number; updatedAt: string | null };

/** available=false … table 未適用（migration 未 apply）や DB error。row=null … まだ行が無い。 */
export type LoadedConsultationSheet = { available: false } | { available: true; row: ConsultationSheetRow | null };

export async function loadConsultationSheet(supabase: SupabaseClient, planId: string): Promise<LoadedConsultationSheet> {
  const { data, error } = await supabase
    .from("plan_consultation_sheet")
    .select("state, revision, updated_at")
    .eq("plan_id", planId)
    .maybeSingle();
  if (error) {
    // 入力内容はログに出さない。
    console.error("plan_consultation_sheet load error:", error.message);
    return { available: false };
  }
  if (!data) return { available: true, row: null };
  const row = data as { state: unknown; revision: unknown; updated_at: unknown };
  return {
    available: true,
    row: {
      state: coerceConsultationSheet(row.state),
      revision: typeof row.revision === "number" && Number.isInteger(row.revision) ? row.revision : 1,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    },
  };
}

export type SaveConsultationSheetResult = { status: "saved"; revision: number } | { status: "conflict" } | { status: "error" };

export async function insertConsultationSheet(
  supabase: SupabaseClient,
  planId: string,
  state: ConsultationSheetState,
): Promise<SaveConsultationSheetResult> {
  const { data, error } = await supabase
    .from("plan_consultation_sheet")
    .insert({ plan_id: planId, state, revision: 1 })
    .select("revision")
    .single();
  if (error) {
    if (error.code === "23505") return { status: "conflict" };
    console.error("plan_consultation_sheet insert error:", error.message);
    return { status: "error" };
  }
  return { status: "saved", revision: (data as { revision: number }).revision };
}

/** `revision = baseRevision` の行だけを更新する（別端末が先に保存していれば 0 行 → conflict）。 */
export async function updateConsultationSheet(
  supabase: SupabaseClient,
  planId: string,
  state: ConsultationSheetState,
  baseRevision: number,
): Promise<SaveConsultationSheetResult> {
  const { data, error } = await supabase
    .from("plan_consultation_sheet")
    .update({ state, revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle();
  if (error) {
    console.error("plan_consultation_sheet update error:", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "conflict" };
  return { status: "saved", revision: (data as { revision: number }).revision };
}
