import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatLastUpdated } from "@/lib/planActivity";
import { planDocumentTypeLabel } from "@/lib/planDocuments";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "Documents",
};

interface PlanDocumentsPageProps {
  params: Promise<{ planId: string }>;
}

type PlanDocumentRow = {
  id: string;
  type: string;
  title: string;
  updated_at: string;
};

/**
 * Documents一覧（Step 1: 土台のみ）。My Plan・Worksheetと同じ所有者確認パターンを踏襲する。
 * 生成機能はまだ無いため、このページはplan_documentsを読むだけで一切書き込まない。
 * 0件が既定状態（今回、生成UIから作る手段が無いため）。行が将来増えたときのために
 * 一覧表示の構造だけ用意しておくが、詳細routeがまだ無いためtitleへのリンクは付けない
 * （存在しないrouteへリンクしない、という方針）。
 */
export default async function PlanDocumentsPage({ params }: PlanDocumentsPageProps) {
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

  const { data: documents } = await supabase
    .from("plan_documents")
    .select("id, type, title, updated_at")
    .eq("plan_id", planId)
    .order("updated_at", { ascending: false });

  const rows = (documents ?? []) as PlanDocumentRow[];

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

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">Documents</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">{plan.title}</p>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">まだ資料はありません。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
              ここでは、My Planをもとに
              <br className="hidden sm:block" />
              親向け説明資料や留学計画書などを
              <br className="hidden sm:block" />
              作成できるようになります。
            </p>
          </div>
        ) : (
          <div className="mt-8 divide-y divide-worksheet-border">
            {rows.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-worksheet-primary">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-worksheet-secondary">{planDocumentTypeLabel(doc.type)}</p>
                </div>
                <p className="shrink-0 text-xs text-worksheet-secondary">{formatLastUpdated(doc.updated_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
