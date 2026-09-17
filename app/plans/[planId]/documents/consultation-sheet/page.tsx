import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { loadPlanWorksheet } from "@/lib/planWorksheet";
import { loadPlanBlueprint } from "@/lib/planBlueprint";
import { formatLastUpdated } from "@/lib/planActivity";
import { loadConsultationSheet } from "@/lib/consultationSheet";
import { buildConsultationCandidates } from "@/lib/consultationCandidates";
import { buildConsultationSummary } from "@/lib/consultationSummary";
import BrandLogo from "@/components/BrandLogo";
import PlanContextLabel from "@/components/PlanContextLabel";
import ConsultationSheetEditor from "@/components/ConsultationSheetEditor";
import ConsultationShareDialog from "@/components/ConsultationShareDialog";
import { loadActiveConsultationShare } from "@/lib/consultationShare";

export const metadata: Metadata = {
  title: "Consultation Sheet",
};

interface ConsultationSheetPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * Consultation Sheet（留学相談シート）の詳細画面。
 *
 * 他の My Karte 資料（AI が生成した本文を読む）と違い、ここはユーザーが直接編集するワークスペース:
 *   相談したいこと / 確認したいこと・To Do / 相談して分かったこと / 次にやること
 * を追加・編集・完了・削除でき、plan_consultation_sheet（1 Plan = 1 行）に自動保存される。
 *
 * このServer Componentが行うこと: ログイン確認・Plan所有者確認 → シート・Karte・Worksheet・My Plan を読む →
 * 上部の前提サマリー（My Plan > Karte stated > 未定）と候補（Karte / Worksheet から deterministic に計算）を作る。
 * 候補は保存しない。ユーザーが「追加する」を押したときだけ通常の項目として保存される（Client 側）。
 * Karte / Worksheet の中身そのものは Client へ渡さない。
 */
export default async function ConsultationSheetPage({ params }: ConsultationSheetPageProps) {
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

  const [sheet, karte, worksheet, blueprint, share] = await Promise.all([
    loadConsultationSheet(supabase, planId),
    loadPlanKarte(supabase, planId),
    loadPlanWorksheet(supabase, planId),
    loadPlanBlueprint(supabase, planId),
    loadActiveConsultationShare(supabase, planId),
  ]);

  const summary = buildConsultationSummary(karte, blueprint.available ? blueprint.data : null);
  const candidates = buildConsultationCandidates(
    karte,
    worksheet.available ? (worksheet.row?.state ?? null) : null,
  );
  const lastUpdated =
    sheet.available && sheet.row?.updatedAt ? formatLastUpdated(sheet.row.updatedAt) : null;

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      {/* lg以上ではAppNavの左sidebarにロゴがあるため、この上部barはmobileのみ。戻る導線は本文側に持つ。 */}
      <header className="flex items-center border-b border-[#e5dfd6] px-4 py-3 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" className="h-[35px] w-auto sm:h-[43px]" />
      </header>

      <div className="mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6 sm:py-14 lg:px-8">
        <div className="border-b border-[#e5dfd6] pb-6">
          <Link
            href={`/plans/${planId}/documents`}
            className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
          >
            <span aria-hidden>←</span> My Karte へ戻る
          </Link>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <PlanContextLabel planTitle={plan.title} />
              <p className="text-xs font-medium tracking-wide text-[#5f7050]">相談する</p>
              <h1 className="mt-1 text-[27px] font-bold tracking-tight text-[#172033] sm:text-[34px] lg:text-[44px]">
                Consultation Sheet
              </h1>
              <p className="mt-0.5 text-sm text-[#8a8578]">留学相談シート</p>
              <p className="mt-3 text-base leading-relaxed text-[#625f59]">
                相談したいことや確認事項をまとめて、相談前後のメモとして使えます。
              </p>
            </div>
            {lastUpdated && <p className="shrink-0 text-xs text-[#8a8578] sm:mt-3">最終更新 {lastUpdated}</p>}
          </div>
        </div>

        {sheet.available ? (
          <>
            {/* 共有導線は編集 UI とは独立（シートの中身は渡さない）。共有中かどうかは Server が毎回渡す。 */}
            <ConsultationShareDialog
              planId={planId}
              initialShare={share.available ? share.share : null}
            />
            <ConsultationSheetEditor
              planId={planId}
              initialRow={sheet.row}
              summary={summary}
              candidates={candidates}
            />
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-[#e5dfd6] bg-white p-6 sm:p-8">
            <p className="text-base font-medium text-[#172033]">Consultation Sheet を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-[#625f59]">しばらくしてから再度お試しください。</p>
          </div>
        )}
      </div>
    </div>
  );
}
