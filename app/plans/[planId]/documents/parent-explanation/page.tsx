import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { formatLastUpdated } from "@/lib/planActivity";
import { buildDocumentsKarteView } from "@/lib/documentsKarteView";
import { type PlanDocumentType } from "@/lib/planDocuments";
import { PARENT_EXPLANATION_DEFAULT_TITLE } from "@/lib/parentExplanationPrompt";
import { classifyShareStatus, type ShareStatusRow } from "@/lib/parentExplanationShare";
import BrandLogo from "@/components/BrandLogo";
import ParentExplanationBody from "@/components/ParentExplanationBody";
import ParentExplanationGenerator from "@/components/ParentExplanationGenerator";
import ParentExplanationShare from "@/components/ParentExplanationShare";

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
 * 親向け説明資料の詳細画面。Step 6までは生成結果をClient側のReact stateに一時表示する
 * だけだったが、Step 7で実際の生成・保存（plan_documentsへのINSERT）が
 * /api/documents/parent-explanation側で行われるようになったため、このページの役割は
 * 「保存済みdocumentを表示する」に一本化された。
 *
 * 責務分担: このServer Componentがlogin確認・Plan所有者確認・保存済みdocumentの取得・
 * （保存済みが無い場合のみ）Karte読み込み＋DocumentsKarteView構築による表示用の
 * `canGenerate`算出までを行う。Karte・DocumentsKarteViewそのものはClientへ渡さず、
 * 生成ボタンを表示してよいかどうかのboolean（`canGenerate`）とplanIdだけをClient
 * Component（components/ParentExplanationGenerator.tsx）へpropsで渡す。実際の
 * Karte取得・DocumentsKarteView構築・生成可否の最終判定・Anthropic生成・DB保存は
 * すべてAPI route側（Server）でもう一度行われる（UI側のcanGenerateはあくまで
 * 一次防御で、実際の安全性はAPI側の再判定に依存する二重防御構造）。
 *
 * plan_documentsはStep 1で作成したmigrationがまだremote Supabaseへ未適用の可能性がある
 * （このセッションでは実DBへの適用を行っていない）。そのため「テーブルが存在しない」
 * エラーと「documentがまだ0件」を同じempty state扱いにせず、Supabaseからのerrorを
 * 明示的に見て区別する（詳細は完了報告のU参照）。
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

  // 保存済みdocumentが無く、クエリ自体もエラーになっていない場合だけ、UI表示判定用に
  // Karteを読み、DocumentsKarteView.hasEnoughContextを算出する（保存済みdocumentがある
  // 通常時は不要なDB読み込みを避ける）。Karte・DocumentsKarteViewそのものはClientへ
  // 渡さない（実際の生成可否の最終判定はAPI側でもう一度行う）。
  let canGenerate = false;
  if (!docError && !row) {
    const karte = await loadPlanKarte(supabase, planId);
    const documentsView = buildDocumentsKarteView(karte);
    canGenerate = documentsView.hasEnoughContext;
  }

  // 保存済み・表示可能なdocumentがある場合のみ、共有UIの初期状態を算出する（Step 13）。
  // owner RLS経由でdocument_sharesのenabled=true行（partial unique indexにより高々1件）の
  // enabled/revoked_at/expires_atだけを取り、"none"|"active"|"expired"へ分類する。
  // token_hash・id・plan_document_id・raw tokenはClientへ渡さない。
  let initialShareStatus: "none" | "active" | "expired" = "none";
  let initialShareExpiresAt: string | undefined;
  if (row && parsedContent) {
    const { data: shareRow } = await supabase
      .from("document_shares")
      .select("enabled, revoked_at, expires_at")
      .eq("plan_document_id", row.id)
      .eq("enabled", true)
      .maybeSingle();
    const classified = classifyShareStatus((shareRow as ShareStatusRow | null) ?? null);
    initialShareStatus = classified.status;
    initialShareExpiresAt = classified.expiresAt;
  }

  const isCreated = Boolean(row && parsedContent);
  // 既存保存済みタイトルを尊重。無ければ固定のページ見出しを使う（DB へ fake title は保存しない）。
  const pageTitle = row?.title?.trim() || PARENT_EXPLANATION_DEFAULT_TITLE;
  const lastUpdated = isCreated && row ? formatLastUpdated(row.updated_at) : null;

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      {/* lg以上ではAppNavの左sidebarにロゴがあるため、この上部barはmobileのみ。戻る導線は本文側に持つ。 */}
      <header className="flex items-center border-b border-[#e9e3d8] px-4 py-3 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" className="h-[35px] w-auto sm:h-[43px]" />
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:py-14 lg:px-8">
        {/* Header（家族へ共有する資料。フォントは他画面と統一の sans） */}
        <div className="border-b border-[#e9e3d8] pb-6">
          <Link
            href={`/plans/${planId}/documents`}
            className="inline-flex items-center gap-1 text-sm text-[#817b71] transition-colors hover:text-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
          >
            <span aria-hidden>←</span> My Karte へ戻る
          </Link>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-[#5f7050]">家族へ共有</p>
              <h1 className="mt-1.5 text-[26px] font-bold leading-[1.25] tracking-tight text-[#172033] sm:text-[32px]">
                {pageTitle}
              </h1>
              <p className="mt-2 text-base text-[#817b71]">
                いま考えていることと、これからの計画をまとめました。
              </p>
            </div>
            {lastUpdated && (
              <p className="shrink-0 text-xs text-[#817b71] sm:mt-2">最終更新 {lastUpdated}</p>
            )}
          </div>
        </div>

        {docError ? (
          <div className="mt-8 rounded-2xl border border-[#e9e3d8] bg-white p-6 sm:p-8">
            <p className="text-base font-medium text-[#172033]">資料を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-[#817b71]">
              しばらくしてから再度お試しください。
            </p>
          </div>
        ) : !row ? (
          <ParentExplanationGenerator planId={planId} canGenerate={canGenerate} />
        ) : parsedContent ? (
          <>
            <ParentExplanationBody body={parsedContent.body} hideLeadingTitle={pageTitle} />
            {/* 家族へ見せる資料。本文と共有ブロックを視覚的に分ける。
                共有操作（作成・停止・LINE）の fetch/state/security は ParentExplanationShare のまま変更しない。 */}
            <ParentExplanationShare
              planId={planId}
              initialShareStatus={initialShareStatus}
              initialExpiresAt={initialShareExpiresAt}
            />
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-[#e9e3d8] bg-white p-6 sm:p-8">
            <p className="text-base font-medium text-[#172033]">この資料を表示できませんでした。</p>
          </div>
        )}
      </div>
    </div>
  );
}
