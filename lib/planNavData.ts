/**
 * PC Navigation Rail + Context Panel用の共有data取得ヘルパー。
 * 中身は既存のloadPlanChatSummaries・loadPlanCardSummaries・loadPlanLastActivityMapを
 * そのまま呼ぶだけで、Plan取得やサマリ算出のロジック自体はコピーしない。
 *
 * React cache()でラップし、同一リクエスト内で複数回（layout.tsx側とpage.tsx側の両方から）
 * 呼ばれても実際のSupabase問い合わせは1回にまとめる。引数はuserId（文字列）のみにし、
 * supabase clientをそのまま渡さない（objectを引数にするとcache()の同一性判定が効かないため）。
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadPlanChatSummaries, type PlanChatSummary } from "@/lib/planChatSummary";
import { loadPlanCardSummaries } from "@/lib/planCardSummary";
import { loadPlanLastActivityMap, type PlanActivityMap } from "@/lib/planActivity";

export type PlanNavPlan = {
  id: string;
  title: string;
  city: string | null;
  updatedAt: string;
};

export type PlanNavData = {
  plans: PlanNavPlan[];
  chatSummaries: Record<string, PlanChatSummary>;
  activityMap: PlanActivityMap;
};

export const loadPlanNavData = cache(async (userId: string): Promise<PlanNavData> => {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("plans")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const planList = (plans ?? []) as { id: string; title: string; updated_at: string }[];
  const planIds = planList.map((p) => p.id);

  const [chatSummaries, cardSummaries, activityMap] = await Promise.all([
    loadPlanChatSummaries(supabase, planIds),
    loadPlanCardSummaries(supabase, planIds),
    loadPlanLastActivityMap(supabase, planIds),
  ]);

  const navPlans: PlanNavPlan[] = planList.map((p) => ({
    id: p.id,
    title: p.title,
    city: cardSummaries[p.id]?.city ?? null,
    updatedAt: p.updated_at,
  }));

  return { plans: navPlans, chatSummaries, activityMap };
});
