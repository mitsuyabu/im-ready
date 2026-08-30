import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatLastUpdated } from "@/lib/planActivity";
import { planDocumentTypeLabel } from "@/lib/planDocuments";
import {
  DOCUMENT_ROLE_DEFINITIONS,
  type DocumentRoleKey,
} from "@/lib/documentRoles";
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

/** role key → detail route の slug。 */
const ROLE_ROUTE_SLUG: Record<DocumentRoleKey, string> = {
  my_note: "my-note",
  study_plan: "study-plan",
  school_comparison: "school-comparison",
  parent_explanation: "parent-explanation",
};

/**
 * Documents（＝画面上は "My Study Abroad"）一覧（Step 28）。My Plan・Worksheet と同じ
 * 所有者確認パターンを踏襲し、plan_documents を読むだけで一切書き込まない。
 *
 * 見せ方は「考える → 整理する → 比べる → 伝える」の順に並ぶワークスペース。
 * My Note（考える）／Study Plan（整理する）／School Comparison（比べる）は本人向けとして
 * まとめ、その下に親向け説明資料（伝える）。DB 行の有無に関係なく常設カードとして表示し
 * （未生成でも詳細 route へ入れて「各 Document → 作成」の導線を成立させる）、通常の row
 * 一覧（other document types 向け）からはこの 4 type を除外して二重表示を防ぐ。役割ラベル・
 * 説明・作成 CTA の文言は lib/documentRoles.ts の DOCUMENT_ROLE_DEFINITIONS に集約。
 *
 * 残りの type（agent_summary）はまだ生成機能・詳細 route が無いため、DB 行が実在する場合のみ
 * 「その他の資料」として一覧表示し、リンクは付けない。
 *
 * plan_documents は migration が remote Supabase へ未適用の可能性があるため、「テーブルが
 * 存在しない」エラーと「document がまだ 0 件」を区別する。DB error 時は常設カードを含め
 * 通常状態の UI を一切出さず、error 表示だけを出す。
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

  const { data: documents, error: documentsError } = await supabase
    .from("plan_documents")
    .select("id, type, title, updated_at")
    .eq("plan_id", planId)
    .order("updated_at", { ascending: false });

  const rows = (documents ?? []) as PlanDocumentRow[];
  const docByType = (type: string) => rows.find((doc) => doc.type === type) ?? null;
  const otherRows = rows.filter(
    (doc) =>
      doc.type !== "my_note" &&
      doc.type !== "study_plan" &&
      doc.type !== "school_comparison" &&
      doc.type !== "parent_explanation",
  );

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
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">My Study Abroad</h1>
        <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">
          留学について考えたことを、少しずつ形にしていきます。
        </p>
        <p className="mt-1 text-xs text-worksheet-secondary">{plan.title}</p>

        {documentsError ? (
          <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">資料を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">しばらくしてから再度お試しください。</p>
          </div>
        ) : (
          <>
            <div className="mt-8">
              {/* 本人向け: 考える → 整理する → 比べる。PC は横 3 カラム、Mobile は縦（↓ でつなぐ）。 */}
              <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <RoleCard planId={planId} roleKey="my_note" doc={docByType("my_note")} />
                <StepArrow />
                <RoleCard planId={planId} roleKey="study_plan" doc={docByType("study_plan")} />
                <StepArrow />
                <RoleCard planId={planId} roleKey="school_comparison" doc={docByType("school_comparison")} />
              </div>

              {/* 本人向け 3 種 → 外部へ伝える資料、という段差を出す。 */}
              <StepArrow className="my-3" />
              <div className="sm:mt-4">
                <RoleCard
                  planId={planId}
                  roleKey="parent_explanation"
                  doc={docByType("parent_explanation")}
                />
              </div>
            </div>

            {/* 他typeはまだ生成機能・詳細routeが無いため、DB行が実在する場合のみ一覧表示する
                （未生成の先出しカードは作らない。存在しないrouteへリンクもしない）。 */}
            {otherRows.length > 0 && (
              <div className="mt-12">
                <h2 className="text-sm font-medium text-worksheet-secondary">その他の資料</h2>
                <div className="mt-4 divide-y divide-worksheet-border">
                  {otherRows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                      <div>
                        <p className="text-sm font-medium text-worksheet-primary">{doc.title}</p>
                        <p className="mt-0.5 text-xs text-worksheet-secondary">
                          {planDocumentTypeLabel(doc.type)}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-worksheet-secondary">
                        {formatLastUpdated(doc.updated_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 役割 eyebrow ＋ タイトル ＋ 説明 ＋ 状態 ＋ CTA を持つ常設カード。Link 全体がクリック領域。 */
function RoleCard({
  planId,
  roleKey,
  doc,
}: {
  planId: string;
  roleKey: DocumentRoleKey;
  doc: PlanDocumentRow | null;
}) {
  const def = DOCUMENT_ROLE_DEFINITIONS[roleKey];
  return (
    <Link
      href={`/plans/${planId}/documents/${ROLE_ROUTE_SLUG[roleKey]}`}
      className="block rounded-2xl border border-worksheet-border p-5 transition-colors duration-150 hover:bg-worksheet-sage/20 sm:p-6"
    >
      <p className="text-xs tracking-wide text-worksheet-secondary">{def.role}</p>
      <p className="mt-1 text-base font-medium text-worksheet-primary">{def.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">{def.description}</p>
      <p className="mt-3 text-xs text-worksheet-secondary">
        {doc ? `最終更新 ${formatLastUpdated(doc.updated_at)}` : "まだ作成されていません"}
      </p>
      <p className="mt-3 text-xs font-medium text-worksheet-accent">
        {doc ? "開く →" : `${def.createLabel} →`}
      </p>
    </Link>
  );
}

/** Mobile だけに出る、順序を示す控えめな矢印（PC の 3+1 レイアウトでは非表示）。 */
function StepArrow({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex justify-center text-xs text-worksheet-secondary sm:hidden ${className}`}>
      ↓
    </div>
  );
}
