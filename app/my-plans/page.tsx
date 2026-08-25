import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import { formatLastUpdated } from "@/lib/planActivity";
import PlanListRow from "@/components/PlanListRow";

export const metadata: Metadata = {
  title: "My Plan",
};

/**
 * My Plan一覧。「My Planを選んでからPlanを選ぶ」導線。My Plan本体（/plans/[id]/my-plan）は無変更。
 * 都市表示は既存のsummarizeKarteForCard（stated限定）をそのまま再利用。
 * ソートは既存のloadPlanLastActivityMap（plan_karte更新時刻＋chat activityの合成）をそのまま使う。
 *
 * dataはlib/planNavData.tsの共有ヘルパー経由で取得する。app/my-plans/layout.tsxも同じ
 * loadPlanNavData(user.id)をPC Context Panel用に呼んでおり、React cache()により同一
 * リクエスト内では実際のSupabase問い合わせが1回にまとまる。
 */
export default async function MyPlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { plans: planList, activityMap } = await loadPlanNavData(user.id);

  const orderedPlans = [...planList].sort((a, b) => {
    const activityA = activityMap[a.id] ?? a.updatedAt;
    const activityB = activityMap[b.id] ?? b.updatedAt;
    return activityB.localeCompare(activityA);
  });

  return (
    <div className="min-h-dvh bg-worksheet-surface">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">My Plan</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">見返したいPlanを選んでください。</p>

        {orderedPlans.length === 0 ? (
          <p className="mt-8 text-sm text-worksheet-secondary">まだPlanがありません。</p>
        ) : (
          <div className="mt-8 divide-y divide-worksheet-border">
            {orderedPlans.map((plan) => {
              const activityIso = activityMap[plan.id] ?? plan.updatedAt;

              return (
                <PlanListRow
                  key={plan.id}
                  planId={plan.id}
                  href={`/plans/${plan.id}/my-plan`}
                  city={plan.city}
                  title={plan.title}
                >
                  <p className="mt-0.5 text-sm text-worksheet-secondary">
                    {plan.city ? `${plan.city}　` : ""}
                    {formatLastUpdated(activityIso)}更新
                  </p>
                </PlanListRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
