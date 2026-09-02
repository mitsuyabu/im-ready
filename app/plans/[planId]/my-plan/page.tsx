import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import BrandLogo from "@/components/BrandLogo";
import MyPlan from "@/components/MyPlan";

export const metadata: Metadata = {
  title: "My Plan",
};

interface PlanMyPlanPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * My Plan（Karteのユーザー向け閲覧画面）。閲覧専用で、ここからKarteへの書き込みは行わない
 * （入力元は引き続きChat/I'm ready!）。所有者確認はPlan Home・Worksheetと同じパターン。
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

  const karte = await loadPlanKarte(supabase, planId);

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す
          （戻る導線は MyPlan 本体の左上に移動している） */}
      <header className="border-b border-[#e5dfd6] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <MyPlan planId={planId} planTitle={plan.title} karte={karte} />
    </div>
  );
}
