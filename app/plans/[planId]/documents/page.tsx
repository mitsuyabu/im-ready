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
 * Documents一覧。My Plan・Worksheetと同じ所有者確認パターンを踏襲する。
 * このページはplan_documentsを読むだけで一切書き込まない。
 *
 * My Note（my_note）と親向け説明資料（parent_explanation）は詳細画面から生成できる導線が
 * 完成しているため、DB行の有無に関係なく常設カードとして表示する（未生成でも詳細routeへ
 * 入れることで、Documents → 各Document → 作成、という導線を成立させる）。表示順は
 * 本人向けの My Note を最上段、その下に親向け説明資料。常設カードで表示する分、通常の
 * row一覧（other document types向け）からは my_note と parent_explanation の両方を除外し、
 * 二重表示を防いでいる。
 *
 * 残りのtype（study_plan等）はまだ生成機能・詳細routeが無いため、DB行が実際に存在する
 * 場合のみ「その他の資料」として一覧表示し、リンクは付けない（存在しないrouteへ
 * リンクしない方針）。未生成のそれらについては、常設カードのような先出し表示はしない。
 *
 * plan_documentsはmigrationがremote Supabaseへ未適用の可能性がある（このセッションでは
 * 実DBへの適用を行っていない）。そのため「テーブルが存在しない」エラーと「documentが
 * まだ0件」を同じ状態にせず、Supabaseからのerrorを明示的に見て区別する。DB error時は
 * 常設カードを含め通常状態のUIを一切出さず、error表示だけを出す（正しくない「まだ
 * 作成されていません」表示を防ぐため）。
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
  const myNoteDoc = rows.find((doc) => doc.type === "my_note") ?? null;
  const parentExplanationDoc = rows.find((doc) => doc.type === "parent_explanation") ?? null;
  const otherRows = rows.filter(
    (doc) => doc.type !== "my_note" && doc.type !== "parent_explanation",
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
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">Documents</h1>
        <p className="mt-1 text-sm text-worksheet-secondary">{plan.title}</p>

        {documentsError ? (
          <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">資料を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">しばらくしてから再度お試しください。</p>
          </div>
        ) : (
          <>
            {/* My Note は常設カード。最上段（本人向けを先頭に）。DB行の有無に関わらず
                詳細routeへの入口を提供する。 */}
            <Link
              href={`/plans/${planId}/documents/my-note`}
              className="mt-8 block rounded-2xl border border-worksheet-border p-6 transition-colors duration-150 hover:bg-worksheet-sage/20 sm:p-8"
            >
              <p className="text-base font-medium text-worksheet-primary">My Note</p>
              {myNoteDoc ? (
                <p className="mt-1 text-xs text-worksheet-secondary">
                  最終更新: {formatLastUpdated(myNoteDoc.updated_at)}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">
                    今の考えや迷っていることを整理して、自分用に残しておくノートです。
                  </p>
                  <p className="mt-1 text-xs text-worksheet-secondary">まだ作成されていません</p>
                </>
              )}
              <p className="mt-3 text-xs font-medium text-worksheet-accent">
                {myNoteDoc ? "開く →" : "作成する →"}
              </p>
            </Link>

            {/* 親向け説明資料も常設カード。DB行の有無に関わらず表示し、詳細routeへの
                入口を常に提供する（Step 6の「資料を作る」導線につなげるため）。 */}
            <Link
              href={`/plans/${planId}/documents/parent-explanation`}
              className="mt-4 block rounded-2xl border border-worksheet-border p-6 transition-colors duration-150 hover:bg-worksheet-sage/20 sm:p-8"
            >
              <p className="text-base font-medium text-worksheet-primary">親向け説明資料</p>
              {parentExplanationDoc ? (
                <p className="mt-1 text-xs text-worksheet-secondary">
                  最終更新: {formatLastUpdated(parentExplanationDoc.updated_at)}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">
                    My Planに整理した内容をもとに、今考えていることを家族に伝えるための資料です。
                  </p>
                  <p className="mt-1 text-xs text-worksheet-secondary">まだ作成されていません</p>
                </>
              )}
              <p className="mt-3 text-xs font-medium text-worksheet-accent">
                {parentExplanationDoc ? "開く →" : "作成する →"}
              </p>
            </Link>

            {/* 他typeはまだ生成機能・詳細routeが無いため、DB行が実在する場合のみ一覧表示する
                （未生成の先出しカードは作らない。存在しないrouteへリンクもしない）。 */}
            {otherRows.length > 0 && (
              <div className="mt-10">
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
