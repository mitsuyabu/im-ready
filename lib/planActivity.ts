/**
 * Planカード用の「最終更新」を、DB上で確認できる範囲のtimestampだけから算出する。
 * 新しいDBカラム・migrationは追加しない。
 *
 * 対象:
 *   - plans.updated_at（呼び出し側が既存のPlan一覧取得で持っているため、ここでは扱わない）
 *   - plan_karte.updated_at（apply_karte_patchが実際のChat/Worksheet同期のたびに更新する値）
 *   - そのPlanのMain Chatに保存された chat_messages の最新 created_at
 *
 * Worksheetの回答はブラウザのlocalStorageにのみ保存されておりDBには存在しないため
 * （lib/worksheetStorage.ts）、ここには一切含まれない。Worksheetだけを更新しても
 * 「最終更新」には反映されない、という制約がある。
 *
 * Plan一覧のN+1を避けるため、plan_karte・chat_sessions・chat_messagesはそれぞれ
 * 1回のバルククエリで取得する（Planごとの個別queryは行わない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** planId -> DB上で確認できる最新のアクティビティ時刻（ISO文字列）。無ければキー自体が存在しない */
export type PlanActivityMap = Record<string, string>;

function takeLater(a: string | undefined, b: string): string {
  if (!a) return b;
  return b > a ? b : a;
}

export async function loadPlanLastActivityMap(
  supabase: SupabaseClient,
  planIds: string[],
): Promise<PlanActivityMap> {
  const result: PlanActivityMap = {};
  if (planIds.length === 0) return result;

  const { data: karteRows } = await supabase
    .from("plan_karte")
    .select("plan_id, updated_at")
    .in("plan_id", planIds);

  for (const row of (karteRows ?? []) as { plan_id: string; updated_at: string }[]) {
    result[row.plan_id] = takeLater(result[row.plan_id], row.updated_at);
  }

  const { data: sessionRows } = await supabase
    .from("chat_sessions")
    .select("id, plan_id")
    .in("plan_id", planIds);

  const sessions = (sessionRows ?? []) as { id: string; plan_id: string }[];
  if (sessions.length === 0) return result;

  const planIdBySessionId = new Map(sessions.map((s) => [s.id, s.plan_id]));
  const sessionIds = sessions.map((s) => s.id);

  // MVP: 該当セッションのchat_messagesを(session_id, created_at)だけ取得し、
  // Plan単位の最新値をアプリ側で算出する。GROUP BY相当をSQL側に持たせる新しいRPC/viewは今回作らない。
  const { data: messageRows } = await supabase
    .from("chat_messages")
    .select("session_id, created_at")
    .in("session_id", sessionIds);

  for (const row of (messageRows ?? []) as { session_id: string; created_at: string }[]) {
    const planId = planIdBySessionId.get(row.session_id);
    if (!planId) continue;
    result[planId] = takeLater(result[planId], row.created_at);
  }

  return result;
}

const JST_TIME_ZONE = "Asia/Tokyo";

function toJstDateParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * JST基準で「今日」「昨日」「8月20日」「2025年12月10日」のいずれかへ整形する。
 * 時刻までは表示しない。サーバーの実行タイムゾーンに依存させないよう、Asia/Tokyoを明示している。
 */
export function formatLastUpdated(isoString: string, now: Date = new Date()): string {
  const target = new Date(isoString);
  const t = toJstDateParts(target);
  const n = toJstDateParts(now);

  const targetDayNumber = Date.UTC(t.year, t.month - 1, t.day);
  const nowDayNumber = Date.UTC(n.year, n.month - 1, n.day);
  const diffDays = Math.round((nowDayNumber - targetDayNumber) / 86_400_000);

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (t.year === n.year) return `${t.month}月${t.day}日`;
  return `${t.year}年${t.month}月${t.day}日`;
}
