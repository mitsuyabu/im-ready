import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";
import WorksheetSectionDetail from "@/components/WorksheetSectionDetail";
import BrandLogo from "@/components/BrandLogo";

interface PlanWorksheetSectionPageProps {
  params: Promise<{ planId: string; sectionId: string }>;
}

export async function generateMetadata({
  params,
}: PlanWorksheetSectionPageProps): Promise<Metadata> {
  const { sectionId } = await params;
  const meta = WORKSHEET_SECTION_META[sectionId];
  return { title: meta ? `${meta.enName} | I'm ready!` : "I'm ready!" };
}

/**
 * 「I'm ready!」テーマ詳細画面。sectionIdは既存CATEGORIESのidと1:1で対応させ、
 * 新しいID体系は作らない。存在しないsectionIdはnotFound()にする（Planの所有者確認と同様、
 * 「無効な値」と「他人のもの」を区別しない）。
 */
export default async function PlanWorksheetSectionPage({ params }: PlanWorksheetSectionPageProps) {
  const { planId, sectionId } = await params;

  const category = CATEGORIES.find((c) => c.id === sectionId);
  if (!category) {
    notFound();
  }

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
    <div className="min-h-dvh bg-[#fcfbf8]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す */}
      <header className="border-b border-[#e5dfd6] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:py-14 lg:px-8">
        <Link
          href={`/plans/${planId}/worksheet`}
          className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c]"
        >
          <span aria-hidden>←</span> テーマから整理するに戻る
        </Link>

        <div className="mt-6">
          <WorksheetSectionDetail planId={planId} sectionId={sectionId} />
        </div>
      </div>
    </div>
  );
}
