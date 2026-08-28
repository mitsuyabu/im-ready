import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatLastUpdated } from "@/lib/planActivity";
import { planDocumentTypeLabel, type PlanDocumentType } from "@/lib/planDocuments";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "親向け説明資料",
};

/** このpageが取得するdocument typeを固定する（他typeの詳細routeはまだ無い） */
const DOCUMENT_TYPE: PlanDocumentType = "parent_explanation";

interface ParentExplanationPageProps {
  params: Promise<{ planId: string }>;
}

type PlanDocumentRow = {
  id: string;
  type: string;
  title: string;
  content: unknown;
  updated_at: string;
};

type ParentExplanationContent = { format: "text"; body: string };

/**
 * plan_documents.content（jsonb）の最低限のshape確認。新しいschema validation
 * libraryは追加せず、想定shape { format: "text", body: string } だけを狭く確認する。
 * 一致しなければnullを返し、呼び出し側は「表示できませんでした」にfallbackする
 * （クラッシュさせない）。
 */
function parseParentExplanationContent(content: unknown): ParentExplanationContent | null {
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (record.format !== "text") return null;
  if (typeof record.body !== "string") return null;
  return { format: "text", body: record.body };
}

/**
 * 親向け説明資料の詳細画面（読み取り専用）。今回は生成機能を実装しないため、
 * document未生成でも正常に開ける「受け皿」としてのみ機能する（次Stepで
 * Documents一覧 → 生成 という導線を足すための土台）。
 *
 * plan_documentsはStep 1で作成したmigrationがまだremote Supabaseへ未適用の可能性がある
 * （このセッションでは実DBへの適用を行っていない）。そのため「テーブルが存在しない」
 * エラーと「documentがまだ0件」を同じempty state扱いにせず、Supabaseからのerrorを
 * 明示的に見て区別する（詳細はB完了報告のL参照）。
 */
export default async function ParentExplanationDocumentPage({ params }: ParentExplanationPageProps) {
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
    .select("id, type, title, content, updated_at")
    .eq("plan_id", planId)
    .eq("type", DOCUMENT_TYPE)
    .maybeSingle();

  const row = doc as PlanDocumentRow | null;
  const parsedContent = row ? parseParentExplanationContent(row.content) : null;

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
        {docError ? (
          <>
            <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">親向け説明資料</h1>
            <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
              <p className="text-base font-medium text-worksheet-primary">資料を読み込めませんでした。</p>
              <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
                しばらくしてから再度お試しください。
              </p>
            </div>
          </>
        ) : !row ? (
          <>
            <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">親向け説明資料</h1>
            <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
              <p className="text-base font-medium text-worksheet-primary">まだ資料は作られていません。</p>
              <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
                この資料では、My Planに整理した内容をもとに、
                <br className="hidden sm:block" />
                今考えていることを家族に伝えられるようになります。
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">{row.title}</h1>
            <p className="mt-1 text-sm text-worksheet-secondary">{planDocumentTypeLabel(row.type)}</p>
            <p className="mt-1 text-xs text-worksheet-secondary">最終更新: {formatLastUpdated(row.updated_at)}</p>

            {parsedContent ? (
              <div className="mt-8 whitespace-pre-wrap rounded-2xl border border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary sm:p-6">
                {parsedContent.body}
              </div>
            ) : (
              <div className="mt-8 rounded-2xl border border-worksheet-border p-6 sm:p-8">
                <p className="text-base font-medium text-worksheet-primary">この資料を表示できませんでした。</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
