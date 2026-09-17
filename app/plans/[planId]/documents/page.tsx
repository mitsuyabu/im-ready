import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatLastUpdated } from "@/lib/planActivity";
import { loadConsultationSheet } from "@/lib/consultationSheet";
import { planDocumentTypeLabel } from "@/lib/planDocuments";
import {
  DOCUMENT_ROLE_DEFINITIONS,
  type DocumentRoleKey,
} from "@/lib/documentRoles";
import MobileBrandHeader from "@/components/MobileBrandHeader";
import DocumentsWorkspaceHeader from "@/components/DocumentsWorkspaceHeader";
import DocumentWorkspaceCard, {
  type DocumentWorkspaceVariant,
} from "@/components/DocumentWorkspaceCard";

export const metadata: Metadata = {
  title: "My Karte",
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
 * Documents トップ用の presentation 設定（この画面だけの見た目・コピー）。
 * role / title / createLabel は lib/documentRoles.ts をそのまま使い、トップの説明文（lines）と
 * カードの accent variant・open CTA だけをここで持つ。lib/documentRoles.ts 自体は変更しない。
 *
 * カードは同じ共通カードシステム（DocumentWorkspaceCard）で、grid は均等 2 列。資料が増えても
 * 同じ形のカードが 1 枚増えるだけで並ぶ（col-span の作り分けや、4 枚前提のレイアウトを持たない）。
 *
 * 説明文は「この画面で自分が書く」ではなく「AI相談やワークシートで整理した内容をもとに資料化される」
 * ことが伝わる書き方にする（〜しよう / 書き出そう のような作業を促す言い回しは使わない）。
 */
const CARD_PRESENTATION: Record<
  DocumentRoleKey,
  { variant: DocumentWorkspaceVariant; lines: string[]; openCta: string; shareBadge?: boolean }
> = {
  my_note: {
    variant: "note",
    lines: [
      "今の気持ちや考えを整理します。",
      "AI相談やワークシートで話した内容をもとにまとめます。",
    ],
    openCta: "ひらく →",
  },
  study_plan: {
    variant: "plan",
    lines: [
      "希望や条件をプランとしてまとめます。",
      "これまで整理した内容をもとに、留学計画を見やすくまとめます。",
    ],
    openCta: "ひらく →",
  },
  school_comparison: {
    variant: "compare",
    lines: [
      "候補の学校を比較しやすく整理します。",
      "提案された学校の違いを、同じ項目で見比べられます。",
    ],
    openCta: "ひらく →",
  },
  parent_explanation: {
    variant: "parent",
    // 親向けだけは下に「家族と共有できます」バッジが出るため、補足文は置かず1行に留める。
    lines: ["家族に伝えやすい資料にまとめます。"],
    openCta: "内容をみる →",
    shareBadge: true,
  },
};

/** カードの並び順（考える → 整理する → 比べる → 伝える の流れ）。資料が増えたらここに足す。 */
const DOCUMENT_ORDER: DocumentRoleKey[] = [
  "my_note",
  "study_plan",
  "school_comparison",
  "parent_explanation",
];

/**
 * Documents（＝画面上は "My Karte"）トップ。所有者確認 → plan_documents を読むだけで
 * 一切書き込まない。構成は「ヘッダー → CURRENT PLAN → 資料カードの一覧」だけにする。
 * 以前は上部に「考える → 整理する → 比べる → 伝える」の 4 ステップ帯を置いていたが、直後に同じ役割の
 * 資料カードが並び説明が重複していたため外した（各カードの役割は、カード内の小さな role ラベルが示す）。
 *
 * DB 行の有無に関係なく資料カードを常設し（未生成でも detail route へ入って作成できる）、
 * document がある type だけ「更新日」と open CTA を、無ければ createLabel を出す。生成ロジック・
 * 詳細画面・API・DB・role metadata（lib/documentRoles.ts）は変更しない。fake データは出さない。
 *
 * その他の type（agent_summary）は DB 行が実在する場合のみ「その他の資料」に一覧表示する。
 * plan_documents の error 時は常設カードを出さず error 表示のみ。
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

  // Consultation Sheet は plan_documents ではなく plan_consultation_sheet が正本（ユーザーが編集するシート）。
  // 読めない場合（migration 未適用など）もカードは出し、更新日だけ出さない。
  const consultationSheet = await loadConsultationSheet(supabase, planId);
  const consultationUpdatedAt =
    consultationSheet.available && consultationSheet.row?.updatedAt ? consultationSheet.row.updatedAt : null;
  const docByType = (type: string) => rows.find((doc) => doc.type === type) ?? null;
  const otherRows = rows.filter(
    (doc) =>
      doc.type !== "my_note" &&
      doc.type !== "study_plan" &&
      doc.type !== "school_comparison" &&
      doc.type !== "parent_explanation",
  );

  return (
    <div className="min-h-dvh bg-[#fbfaf6]">
      <header className="flex items-center justify-between border-b border-black/[0.06] bg-worksheet-surface px-4 py-3 sm:px-6">
        {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（戻る導線は残す） */}
        <div className="lg:hidden">
          <MobileBrandHeader />
        </div>
        <div className="hidden lg:block" />
        <Link
          href={`/plans/${planId}`}
          className="text-xs text-worksheet-secondary underline decoration-worksheet-secondary/40 underline-offset-2 transition-colors hover:text-worksheet-primary hover:decoration-worksheet-primary/40"
        >
          ← Plan Homeに戻る
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:pt-10 lg:pb-16">
        <DocumentsWorkspaceHeader
          planTitle={plan.title}
          lastUpdatedText={rows.length > 0 ? formatLastUpdated(rows[0].updated_at) : null}
        />

        {documentsError ? (
          <div className="mt-8 rounded-[18px] border border-[#e6e1d8] bg-white p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">資料を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
              しばらくしてから再度お試しください。
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5">
              {DOCUMENT_ORDER.map((key) => {
                const def = DOCUMENT_ROLE_DEFINITIONS[key];
                const presentation = CARD_PRESENTATION[key];
                const doc = docByType(key);
                return (
                  <DocumentWorkspaceCard
                    key={key}
                    href={`/plans/${planId}/documents/${ROLE_ROUTE_SLUG[key]}`}
                    role={def.role}
                    title={def.title}
                    lines={presentation.lines}
                    variant={presentation.variant}
                    updatedText={doc ? formatLastUpdated(doc.updated_at) : null}
                    cta={doc ? presentation.openCta : `${def.createLabel} →`}
                    shareBadge={presentation.shareBadge}
                  />
                );
              })}

              {/* 5 枚目: Consultation Sheet（自動生成の資料ではなく、下書き候補＋自分で編集する相談シート） */}
              <DocumentWorkspaceCard
                href={`/plans/${planId}/documents/consultation-sheet`}
                role="相談する"
                title="Consultation Sheet"
                lines={[
                  "相談したいことや確認事項を整理します。",
                  "AI相談やワークシートをもとに下書きを作り、自分でも追加・編集できます。",
                ]}
                variant="consult"
                updatedText={consultationUpdatedAt ? formatLastUpdated(consultationUpdatedAt) : null}
                cta={consultationUpdatedAt ? "ひらく →" : "相談シートをひらく →"}
              />
            </div>

            {otherRows.length > 0 && (
              <div className="mt-12">
                <h2 className="text-[13px] font-medium text-[#8e887e]">その他の資料</h2>
                <div className="mt-4 divide-y divide-[#eeeae2] rounded-[18px] border border-[#e6e1d8] bg-white">
                  {otherRows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-4 px-4 py-4">
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
