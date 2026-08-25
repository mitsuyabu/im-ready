import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateMainChatSession, loadChatMessages, loadPlanKarte } from "@/lib/planChat";
import Chat from "@/components/Chat";

export const metadata: Metadata = {
  title: "AIに相談する",
};

interface PlanChatPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * そのPlan専用のChat。/plans/[planId]/worksheet/page.tsx と同じパターンで、
 * サーバー側で所有者確認・Main Chat取得(または作成)・会話履歴とkarteの復元まで終えてから
 * Chatコンポーネントへ渡す。空カルテをクライアントstateへ一度入れてからDBの既存karteへ
 * 差し替える、という手順を踏まないため、空カルテの保存競合が構造的に起きない。
 */
export default async function PlanChatPage({ params }: PlanChatPageProps) {
  const { planId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id, title")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    notFound();
  }

  const session = await getOrCreateMainChatSession(supabase, planId);
  const [messages, karte] = await Promise.all([
    loadChatMessages(supabase, session.id),
    loadPlanKarte(supabase, planId),
  ]);

  return (
    <div className="flex h-dvh flex-1 flex-col bg-white dark:bg-zinc-950">
      <Chat
        planId={planId}
        sessionId={session.id}
        initialMessages={messages}
        initialKarte={karte}
        planTitle={plan.title}
      />
    </div>
  );
}
