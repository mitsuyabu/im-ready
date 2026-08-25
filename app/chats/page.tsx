import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import { formatLastUpdated } from "@/lib/planActivity";
import PlanListRow from "@/components/PlanListRow";

export const metadata: Metadata = {
  title: "Chat",
};

/**
 * Chat一覧。「Planを探してからChatに入る」のではなく「Chatを選んでからPlanを選ぶ」導線。
 * 開始済み/未開始を問わず、所有する全Planを表示する（未開始でも一覧から消さない）。
 * ソート: 開始済みは最終メッセージ日時DESC、未開始はplans.updated_at DESCでその後ろに続ける。
 *
 * dataはlib/planNavData.tsの共有ヘルパー経由で取得する。app/chats/layout.tsxも同じ
 * loadPlanNavData(user.id)をPC Context Panel用に呼んでおり、React cache()により同一
 * リクエスト内では実際のSupabase問い合わせが1回にまとまる。
 */
export default async function ChatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { plans: planList, chatSummaries } = await loadPlanNavData(user.id);

  const started = planList
    .filter((p) => chatSummaries[p.id]?.lastMessageAt)
    .sort((a, b) => chatSummaries[b.id]!.lastMessageAt!.localeCompare(chatSummaries[a.id]!.lastMessageAt!));

  const notStarted = planList
    .filter((p) => !chatSummaries[p.id]?.lastMessageAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const orderedPlans = [...started, ...notStarted];

  return (
    <div className="min-h-dvh bg-worksheet-surface">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">Chat</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">相談したいPlanを選んでください。</p>

        {orderedPlans.length === 0 ? (
          <p className="mt-8 text-sm text-worksheet-secondary">まだPlanがありません。</p>
        ) : (
          <div className="mt-8 divide-y divide-worksheet-border">
            {orderedPlans.map((plan) => {
              const lastMessageAt = chatSummaries[plan.id]?.lastMessageAt ?? null;

              return (
                <PlanListRow
                  key={plan.id}
                  planId={plan.id}
                  href={`/plans/${plan.id}/chat`}
                  city={plan.city}
                  title={plan.title}
                >
                  {lastMessageAt ? (
                    <p className="mt-0.5 text-sm text-worksheet-secondary">
                      {formatLastUpdated(lastMessageAt)}　続きを開く ›
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-worksheet-secondary">
                      まだChatを始めていません　＋ Chatを始める
                    </p>
                  )}
                </PlanListRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
