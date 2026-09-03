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
import DocumentsWorkspaceHeader from "@/components/DocumentsWorkspaceHeader";
import DocumentsJourney from "@/components/DocumentsJourney";
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
 * カードの visual variant・grid 配置・open CTA だけをここで参考デザインに合わせて持つ。
 * lib/documentRoles.ts 自体は変更しない。
 */
const CARD_PRESENTATION: Record<
  DocumentRoleKey,
  { variant: DocumentWorkspaceVariant; lines: string[]; openCta: string; grid: string; shareBadge?: boolean }
> = {
  my_note: {
    variant: "note",
    lines: [
      "いまの気持ちを、ここに残そう。",
      "留学したい理由、楽しみなこと、不安なこと。ぜんぶ書き出して、自分の気持ちを整理しよう。",
    ],
    openCta: "ひらく →",
    grid: "sm:col-span-2 lg:col-span-5 lg:row-span-2",
  },
  study_plan: {
    variant: "plan",
    lines: ["やることリストやスケジュールを整理して、留学までの流れをつくろう。"],
    openCta: "ひらく →",
    grid: "sm:col-span-1 lg:col-span-7",
  },
  school_comparison: {
    variant: "compare",
    lines: ["気になる学校を比較して、自分の条件に合うか整理しよう。"],
    openCta: "ひらく →",
    grid: "sm:col-span-1 lg:col-span-7",
  },
  parent_explanation: {
    variant: "parent",
    lines: ["家族に、留学の理由と現在の計画を伝えるための資料です。"],
    openCta: "内容をみる →",
    grid: "sm:col-span-2 lg:col-span-12",
    shareBadge: true,
  },
};

/** journey 順の固定 4 種。 */
const DOCUMENT_ORDER: DocumentRoleKey[] = [
  "my_note",
  "study_plan",
  "school_comparison",
  "parent_explanation",
];

/**
 * Documents（＝画面上は "My Karte"）トップ。所有者確認 → plan_documents を読むだけで
 * 一切書き込まない。見せ方は参考デザインに寄せた「考える → 整理する → 比べる → 伝える」の
 * 紙・文具風ワークスペース。
 *
 * DB 行の有無に関係なく 4 カードを常設し（未生成でも detail route へ入って作成できる）、
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
        {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（戻る導線は残す。BrandLogoサイズは変更しない） */}
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

      <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:pt-10 lg:pb-16">
        <DocumentsWorkspaceHeader planTitle={plan.title} />

        {documentsError ? (
          <div className="mt-8 rounded-2xl border border-black/[0.08] bg-worksheet-surface p-6 sm:p-8">
            <p className="text-base font-medium text-worksheet-primary">資料を読み込めませんでした。</p>
            <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
              しばらくしてから再度お試しください。
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <DocumentsJourney />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-12 lg:gap-5">
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
                    className={presentation.grid}
                  />
                );
              })}
            </div>

            {otherRows.length > 0 && (
              <div className="mt-12">
                <h2 className="text-sm font-medium text-worksheet-secondary">その他の資料</h2>
                <div className="mt-4 divide-y divide-black/[0.06] rounded-2xl border border-black/[0.07] bg-worksheet-surface">
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
