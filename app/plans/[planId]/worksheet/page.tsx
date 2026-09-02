import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorksheetSectionList from "@/components/WorksheetSectionList";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "テーマから整理する | I'm ready!",
};

interface PlanWorksheetPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * 「I'm ready!」テーマ一覧（セクション選択画面）。旧実装（全問を1ページに並べたWorksheet
 * コンポーネントをそのまま表示）から置き換え。所有者確認は app/plans/[planId]/page.tsx と同じパターン。
 * 各テーマの詳細は /plans/[planId]/worksheet/[sectionId] へ遷移する。
 */
export default async function PlanWorksheetPage({ params }: PlanWorksheetPageProps) {
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
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-[#f7f4ec]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す */}
      <header className="border-b border-[#e4ddcf] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:py-14 lg:px-10">
        <Link
          href={`/plans/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-[#8a8578] transition-colors hover:text-[#3f3d38]"
        >
          <span aria-hidden>←</span> Plan Homeに戻る
        </Link>

        <h1 className="mt-4 text-[28px] font-bold leading-[1.18] tracking-tight text-[#26251f] sm:text-[38px] lg:text-[44px]">
          テーマから整理する
        </h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[#6f6b62] sm:text-sm">
          留学を考えるうえで、自分の気持ちや条件をテーマごとに整理していきます。気になるテーマから始めてください。
        </p>

        <WorksheetSectionList planId={planId} />
      </div>
    </div>
  );
}
