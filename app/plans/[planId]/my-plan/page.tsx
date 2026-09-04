import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { loadPlanBlueprint } from "@/lib/planBlueprint";
import { buildMyPlanView } from "@/lib/myPlanView";
import { AUSTRALIA_SCHOOLS } from "@/lib/data/schools";
import { formatLastUpdated } from "@/lib/planActivity";
import BrandLogo from "@/components/BrandLogo";
import MyPlan from "@/components/MyPlan";

export const metadata: Metadata = {
  title: "My Plan",
};

interface PlanMyPlanPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * My Plan（ユーザーが採用した「実行プラン」）。
 *
 * 表示は 2 ソース:
 *   - plan_blueprint（loadPlanBlueprint）… ユーザー採用値。primary display。
 *   - Karte（loadPlanKarte）             … まだ採用されていない「候補」。区別表示。
 *
 * まだ CRUD は無い（Step 2-3 以降）。blueprint が unavailable（migration 未適用等）でも
 * ページは落とさず、Karte 由来の候補中心で表示する（loadPlanBlueprint.available で判定）。
 * 所有者確認は Plan Home / Worksheet と同じパターン。ここから Karte / blueprint への書き込みはしない。
 */
export default async function PlanMyPlanPage({ params }: PlanMyPlanPageProps) {
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

  const [karte, blueprint] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadPlanBlueprint(supabase, planId),
  ]);

  const view = buildMyPlanView(karte, blueprint, AUSTRALIA_SCHOOLS, plan.title);

  const lastUpdatedIso = blueprint.updatedAt ?? karte.meta.updatedAt ?? null;
  const lastUpdated = lastUpdatedIso ? formatLastUpdated(lastUpdatedIso) : null;

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す
          （戻る導線は MyPlan 本体の左上に移動している） */}
      <header className="border-b border-[#e5dfd6] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <MyPlan planId={planId} planTitle={plan.title} view={view} lastUpdated={lastUpdated} />
    </div>
  );
}
