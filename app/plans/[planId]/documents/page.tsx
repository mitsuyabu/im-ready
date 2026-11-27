import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatLastUpdated } from "@/lib/planActivity";
import { loadConsultationSheet } from "@/lib/consultationSheet";
import { loadPlanKarte } from "@/lib/planChat";
import { loadPlanWorksheet } from "@/lib/planWorksheet";
import { buildMyNoteBuckets } from "@/lib/myNoteBuckets";
import {
  buildKarteConditionSlots,
  countFilledConditionSlots,
} from "@/lib/karteConditionSlots";
import { buildSchoolComparisonView } from "@/lib/schoolComparisonView";
import { AUSTRALIA_SCHOOLS } from "@/lib/data/schools";
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
import MyKarteNoteSection from "@/components/MyKarteNoteSection";
import MyKarteConditionsSection from "@/components/MyKarteConditionsSection";
import MyKarteSchoolsSection, { type MyKarteSchoolRow } from "@/components/MyKarteSchoolsSection";
import ComparisonBoard from "@/components/ComparisonBoard";
import MyKarteSummaryTiles from "@/components/MyKarteSummaryTiles";

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
 * 「伝える・相談する」セクションに残す 2 枚のカードの presentation 設定。
 *
 * My Note / Study Plan / School Comparison は**ダッシュボード型のセクション**に変わったが、
 * この 2 つ（親向け説明資料・Consultation Sheet）は**既存のカード形式を維持する**。
 * 相手に渡す成果物であり、「読んで確認する」ダッシュボードとは性質が違うため。
 * 遷移先・生成機能・編集機能・共有機能は一切変更していない。
 */
const SHARE_CARD_PRESENTATION: {
  variant: DocumentWorkspaceVariant;
  lines: string[];
  openCta: string;
  shareBadge?: boolean;
} = {
  variant: "parent",
  lines: ["家族に伝えやすい資料にまとめます。"],
  openCta: "内容をみる →",
  shareBadge: true,
};

/**
 * My Karte（route は /plans/[planId]/documents）トップ。
 *
 * 位置づけ:
 *   My Karte = AI相談や Worksheet で考えてきたことを **ひとつの場所で確認・整理・比較する**
 *   パーソナルダッシュボード（自分の考え・希望・条件・判断軸を把握する場所）。
 *   My Plan = 決めた内容を具体的な行動やスケジュールにする場所。
 *   この役割の違いを保つため、このページは plan_blueprint（My Plan の確定値）を読まない。
 *
 * 構成:
 *   ヘッダー（タイトル・説明・Current Plan）
 *     → My Note（考えてきたこと）
 *     → Study Plan（希望・条件のグリッド）
 *     → Comparison Board（候補案の比較。同一ページ内で開閉）
 *     → School Comparison（候補校の概要）
 *     → 伝える・相談する（親向け説明資料 / Consultation Sheet のカード）
 *   セクションは余白と見出しで区切り、全体を 1 枚の大きなカードで囲わない。
 *
 * データの扱い（最重要）:
 *   - **ページ表示時に AI 生成を一切行わない**（Anthropic を呼ばない）。
 *     出すのは既存の Karte / Worksheet / plan_documents / 候補校を pure な変換層に通した値だけ。
 *   - inferred（AI の仮説）は値として出さない。stated / 未定 / 未整理 を区別して出す。
 *   - 未回答を推測で埋めない。架空のユーザーデータ（国名・金額・学校名）を出さない。
 *   - 既存の詳細画面・資料生成機能・共有機能は削除していない（各セクションから遷移できる）。
 *
 * エラー時:
 *   plan_documents が読めないときは、資料の更新日に依存する表示を出さず error 表示のみにする
 *   （Karte / Worksheet 側は別のクエリなので、ダッシュボードの中身は出せるが、
 *   「資料が無いのか読めていないのか」を取り違えさせないため従来どおり error を優先する）。
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

  // 所有者確認。ここを通らない planId のデータは一切読まない（別 Plan の情報が混ざらない）。
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

  // ダッシュボードの中身。すべて既存の pure な変換層を通すだけで、AI も新しい API も使わない。
  const [karte, worksheet] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadPlanWorksheet(supabase, planId),
  ]);
  const worksheetState = worksheet.available ? (worksheet.row?.state ?? null) : null;

  const noteBuckets = buildMyNoteBuckets(karte, worksheetState);
  const conditionSlots = buildKarteConditionSlots(karte, worksheetState);
  const schoolRows: MyKarteSchoolRow[] = buildSchoolComparisonView(
    karte,
    AUSTRALIA_SCHOOLS,
  ).schools.map((school) => ({
    slug: school.slug,
    name: school.nameJa?.trim() ? school.nameJa : school.name,
    city: school.city,
  }));

  const parentDef = DOCUMENT_ROLE_DEFINITIONS.parent_explanation;
  const parentDoc = docByType("parent_explanation");

  return (
    // My Karte だけ、ページの地を淡いグレーの canvas にして白いカードを浮かせる。
    // アプリ全体の背景（--background）や他画面には影響させない。
    <div className="min-h-dvh bg-[var(--mk-canvas)]">
      <header className="flex items-center justify-between border-b border-black/[0.06] bg-[var(--mk-canvas)] px-4 py-3 sm:px-6">
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
          summary={
            /* 出すのは実データを数えた件数だけ。達成率・スコア・グラフは置かない。 */
            <MyKarteSummaryTiles
              planId={planId}
              conditionsFilled={countFilledConditionSlots(conditionSlots)}
              conditionsTotal={conditionSlots.length}
              schoolCount={schoolRows.length}
            />
          }
        />

        {documentsError ? (
          <div className="mk-card mk-pad-lg mt-8">
            <p className="mk-card-title">資料を読み込めませんでした。</p>
            <p className="mk-sub-text mt-2">しばらくしてから再度お試しください。</p>
          </div>
        ) : (
          <div className="mt-10 space-y-12 sm:mt-12 sm:space-y-16">
            <MyKarteNoteSection planId={planId} buckets={noteBuckets} />

            <MyKarteConditionsSection planId={planId} slots={conditionSlots} />

            {/*
              Comparison Board。別ページへ遷移せず、この位置で開閉する。
              Karte の希望・条件は「今の条件からコピー」のときだけ使われ、
              自動で候補案に確定されることはない。
            */}
            <ComparisonBoard planId={planId} conditionSlots={conditionSlots} />

            <MyKarteSchoolsSection planId={planId} schools={schoolRows} />

            {/*
              伝える・相談する。ページ最下段の「行動」エリアなので、淡い面に載せて
              上の「読む・整理する」セクション群と役割を分ける。
              カード自体は既存の DocumentWorkspaceCard のまま（遷移先・生成・共有は不変）。
            */}
            <section>
              <p className="mk-eyebrow">Share</p>
              <h2 className="mk-section-title mt-1.5">伝える・相談する</h2>
              <p className="mk-sub-text mt-1">整理した内容を、相手に合わせた資料に。</p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <DocumentWorkspaceCard
                  href={`/plans/${planId}/documents/${ROLE_ROUTE_SLUG.parent_explanation}`}
                  role={parentDef.role}
                  title={parentDef.title}
                  lines={SHARE_CARD_PRESENTATION.lines}
                  variant={SHARE_CARD_PRESENTATION.variant}
                  updatedText={parentDoc ? formatLastUpdated(parentDoc.updated_at) : null}
                  cta={parentDoc ? SHARE_CARD_PRESENTATION.openCta : `${parentDef.createLabel} →`}
                  shareBadge={SHARE_CARD_PRESENTATION.shareBadge}
                  surface="#ffffff"
                  wash="rgba(232,242,247,0.9)"
                />

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
                  surface="#ffffff"
                  wash="rgba(232,239,234,0.9)"
                />
              </div>
            </section>

            {otherRows.length > 0 && (
              <section>
                <h2 className="mk-eyebrow">その他の資料</h2>
                <div className="mk-card mt-4 divide-y divide-[#f0f1ee]">
                  {otherRows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="mk-card-title break-words">{doc.title}</p>
                        <p className="mk-sub-text mt-0.5">{planDocumentTypeLabel(doc.type)}</p>
                      </div>
                      <p className="mk-sub-text shrink-0">{formatLastUpdated(doc.updated_at)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
