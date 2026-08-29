import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { buildStudyPlanView } from "@/lib/studyPlanView";
import { canGenerateStudyPlan } from "@/lib/studyPlanPrompt";
import { parseStudyPlanContent } from "@/lib/studyPlanGenerator";
import { planDocumentTypeLabel, type PlanDocumentType } from "@/lib/planDocuments";
import BrandLogo from "@/components/BrandLogo";
import StudyPlanGenerator from "@/components/StudyPlanGenerator";

export const metadata: Metadata = {
  title: "Study Plan",
};

/** このpageが扱うdocument typeを固定する。 */
const DOCUMENT_TYPE: PlanDocumentType = "study_plan";

interface StudyPlanPageProps {
  params: Promise<{ planId: string }>;
}

type PlanDocumentRow = {
  id: string;
  type: string;
  title: string;
  content: unknown;
  updated_at: string;
  created_at: string;
};

/**
 * Study Plan の詳細画面（Step 22）。app/plans/[planId]/documents/my-note/page.tsx を
 * 第一参考にした構成:
 * - このServer Componentが login確認・Plan所有者確認・plan_documents(type=study_plan)取得・
 *   Karte読み込み → buildStudyPlanView → canGenerateStudyPlan までを行う。
 * - Karte / StudyPlanView そのものはClientへ渡さず、planId・canGenerate・（保存済みなら）
 *   本文と更新日だけを Client Component（components/StudyPlanGenerator.tsx）へ渡す。
 * - 生成・保存・生成可否の最終判定は API 側（/api/documents/study-plan）でもう一度行われる
 *   （UI側の canGenerate は一次防御）。
 *
 * My Note detail との違い:
 * - 参照する type と view/prompt/component が study_plan 用。
 * - 共有UI（ParentExplanationShare / document_shares）は一切出さない。Study Plan は private。
 * - proposal / 候補校カード / schools data / School Comparison UI は一切出さない。
 */
export default async function StudyPlanPage({ params }: StudyPlanPageProps) {
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

  const { data: doc, error: docError } = await supabase
    .from("plan_documents")
    .select("id, type, title, content, updated_at, created_at")
    .eq("plan_id", planId)
    .eq("type", DOCUMENT_TYPE)
    .maybeSingle();

  const row = doc as PlanDocumentRow | null;
  const parsedContent = row ? parseStudyPlanContent(row.content) : null;

  // 生成可否の一次防御。保存済み document があっても「作り直す」で使うため毎回算出する
  // （Karte・StudyPlanView は Client へ渡さない）。DBエラー時はUIを通常状態にしない。
  let canGenerate = false;
  if (!docError) {
    const karte = await loadPlanKarte(supabase, planId);
    canGenerate = canGenerateStudyPlan(buildStudyPlanView(karte));
  }

  return (
    <div className="min-h-dvh bg-worksheet-surface">
      <header className="flex items-center justify-between border-b border-worksheet-border px-4 py-3 sm:px-6">
        {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（戻る導線は残す） */}
        <div className="lg:hidden">
          <BrandLogo href="/mypage" />
        </div>
        <div className="hidden lg:block" />
        <Link
          href={`/plans/${planId}/documents`}
          className="text-xs text-worksheet-secondary underline decoration-worksheet-secondary/40 underline-offset-2 transition-colors hover:text-worksheet-primary hover:decoration-worksheet-primary/40"
        >
          ← Documentsに戻る
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">Study Plan</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">{planDocumentTypeLabel(DOCUMENT_TYPE)}</p>

        {docError ? (
          <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">Study Plan を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
              しばらくしてから再度お試しください。
            </p>
          </div>
        ) : row && !parsedContent ? (
          <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">この Study Plan を表示できませんでした。</p>
          </div>
        ) : (
          <StudyPlanGenerator
            planId={planId}
            canGenerate={canGenerate}
            initialBody={parsedContent?.body}
            initialUpdatedAt={row?.updated_at}
          />
        )}
      </div>
    </div>
  );
}
