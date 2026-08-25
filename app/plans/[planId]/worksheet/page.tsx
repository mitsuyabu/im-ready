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
    <div className="min-h-dvh bg-worksheet-surface">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す */}
      <header className="border-b border-worksheet-border px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href={`/plans/${planId}`}
          className="text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
        >
          ← Plan Homeに戻る
        </Link>

        <h1 className="mt-4 text-[26px] font-semibold leading-snug text-worksheet-primary">
          テーマから整理する
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          留学を考えるうえで、自分の気持ちや条件をテーマごとに整理していきます。気になるテーマから始めてください。
        </p>

        <WorksheetSectionList planId={planId} />
      </div>
    </div>
  );
}
