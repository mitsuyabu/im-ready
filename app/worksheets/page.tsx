import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import { formatLastUpdated } from "@/lib/planActivity";
import PlanListRow from "@/components/PlanListRow";
import WorksheetRowProgress from "@/components/WorksheetRowProgress";

export const metadata: Metadata = {
  title: "Worksheet",
};

/**
 * Worksheet一覧。「Worksheetを選んでからPlanを選ぶ」導線。全Planを表示し、未着手でも消さない。
 * 進捗（n/22問）はlocalStorage由来のためクライアント側（WorksheetRowProgress）で取得する。
 * ソートはMVPでは既存のPlan activity（chat/karte基準）を流用する。Worksheet自身の正確な更新時刻は
 * DBに無いため、activity日付は「Plan更新」という補助情報として小さく添えるだけに留める
 * （「Worksheetが更新された」という誤認を避けるため）。
 *
 * dataはlib/planNavData.tsの共有ヘルパー経由で取得する。app/worksheets/layout.tsxも同じ
 * loadPlanNavData(user.id)をPC Context Panel用に呼んでおり、React cache()により同一
 * リクエスト内では実際のSupabase問い合わせが1回にまとまる。
 */
export default async function WorksheetsPage() {
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
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">Worksheet</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">テーマから整理したいPlanを選んでください。</p>

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
                  href={`/plans/${plan.id}/worksheet`}
                  city={plan.city}
                  title={plan.title}
                >
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <WorksheetRowProgress planId={plan.id} />
                    <span className="text-xs text-worksheet-secondary">
                      Plan更新: {formatLastUpdated(activityIso)}
                    </span>
                  </div>
                </PlanListRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
