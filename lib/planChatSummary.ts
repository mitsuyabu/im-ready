/**
 * /chats（Chat一覧）専用。lib/planActivity.tsのloadPlanLastActivityMapはplan_karteの更新時刻と
 * ブレンドしてしまうため使えず、「そのPlanのMain Chatを開始済みか・最終メッセージ日時」だけを
 * chat_messagesだけから取得する専用のbulk関数をここに独立させる。
 * Plan一覧のN+1を避けるため、chat_sessions・chat_messagesはそれぞれ1回のクエリで取得する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanChatSummary = {
  /** Main Chatに1件以上メッセージがあればそのcreated_at（ISO）。無ければnull（＝未開始扱い） */
  lastMessageAt: string | null;
};

export async function loadPlanChatSummaries(
  supabase: SupabaseClient,
  planIds: string[],
): Promise<Record<string, PlanChatSummary>> {
  const result: Record<string, PlanChatSummary> = {};
  if (planIds.length === 0) return result;

  const { data: sessionRows } = await supabase
    .from("chat_sessions")
    .select("id, plan_id")
    .in("plan_id", planIds)
    .eq("is_main", true);

  const sessions = (sessionRows ?? []) as { id: string; plan_id: string }[];
  for (const session of sessions) {
    result[session.plan_id] = { lastMessageAt: null };
  }
  if (sessions.length === 0) return result;

  const planIdBySessionId = new Map(sessions.map((s) => [s.id, s.plan_id]));
  const sessionIds = sessions.map((s) => s.id);

  const { data: messageRows } = await supabase
    .from("chat_messages")
    .select("session_id, created_at")
    .in("session_id", sessionIds);

  for (const row of (messageRows ?? []) as { session_id: string; created_at: string }[]) {
    const planId = planIdBySessionId.get(row.session_id);
    if (!planId) continue;
    const current = result[planId]?.lastMessageAt;
    if (!current || row.created_at > current) {
      result[planId] = { lastMessageAt: row.created_at };
    }
  }

  return result;
}
