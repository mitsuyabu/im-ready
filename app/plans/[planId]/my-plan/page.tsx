import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="min-h-dvh bg-worksheet-surface">
      <header className="flex items-center justify-between border-b border-worksheet-border px-4 py-3 sm:px-6">
        {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（戻る導線は残す） */}
        <div className="lg:hidden">
          <BrandLogo href="/mypage" />
        </div>
        <div className="hidden lg:block" />
        <Link
          href={`/plans/${planId}`}
          className="text-xs text-worksheet-secondary underline decoration-worksheet-secondary/40 underline-offset-2 transition-colors hover:text-worksheet-primary hover:decoration-worksheet-primary/40"
        >
          ← Plan Homeに戻る
        </Link>
      </header>

      <MyPlan planId={planId} planTitle={plan.title} karte={karte} />
    </div>
  );
}
