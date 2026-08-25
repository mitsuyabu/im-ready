import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadLastChatMessageAt, loadPlanKarte } from "@/lib/planChat";
import { formatLastUpdated, loadPlanLastActivityMap } from "@/lib/planActivity";
import { summarizeKarteForCard } from "@/lib/planCardSummary";
import PlanHero from "@/components/PlanHero";
import PlanWorksheetProgress from "@/components/PlanWorksheetProgress";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "プラン",
};

type PlanRow = { id: string; title: string; updated_at: string };

interface PlanPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * そのPlanのワークスペースの正本URL。planIdをURLから読み、そのつどサーバー側で
 * 所有者確認する（グローバルなselectedPlan stateは持たない）。
 * 「存在しないPlan」と「他人のPlan」は区別せず、どちらもnotFound()にする
 * （情報漏洩防止のため）。
 *
 * MVP方針: Documents / Todo / 学校候補一覧 / My Plan専用画面 / nextAction / conflicts は
 * 裏付けとなる永続化・専用UIがまだ無いため、今回は置かない（未実装機能を動くボタンとして
 * 見せない、というCLAUDE.mdの方針に沿う）。既存2導線（Chat/Worksheet）の入口の質を上げ、
 * Karteから取れるstated情報だけを薄く可視化する。
 */
export default async function PlanPage({ params }: PlanPageProps) {
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
    .select("id, title, updated_at")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    notFound();
  }

  const typedPlan = plan as PlanRow;

  // /mypageと同じ関数群をそのまま再利用する（cover mapping・Plan summary・最終更新の算出ロジックの
  // 重複実装を避ける）。単一Plan表示だが、bulk用の関数を長さ1の配列で呼ぶだけで足りる。
  const [karte, lastChatMessageAt, activityMap] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadLastChatMessageAt(supabase, planId),
    loadPlanLastActivityMap(supabase, [planId]),
  ]);

  const summary = summarizeKarteForCard(karte);
  const lastActivityIso = activityMap[planId];
  const lastUpdatedIso =
    lastActivityIso && lastActivityIso > typedPlan.updated_at ? lastActivityIso : typedPlan.updated_at;

  const hasAboutInfo = Boolean(summary.city || summary.departureTiming || summary.stage);

  return (
    <div className="min-h-dvh bg-worksheet-surface">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ロゴだけの単独headerは二重表示を避けて隠す */}
      <header className="border-b border-worksheet-border px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/mypage"
          className="text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
        >
          ← マイページに戻る
        </Link>

        <div className="mt-4">
          <PlanHero
            planId={typedPlan.id}
            title={typedPlan.title}
            city={summary.city}
            departureTiming={summary.departureTiming}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* 左カラム（PCでは2/3幅）: AI相談 → Worksheet */}
          <div className="space-y-4 lg:col-span-2">
            <section className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-worksheet-primary">AI相談</h2>
              <p className="mt-1 text-sm leading-relaxed text-worksheet-secondary">
                留学カウンセリングAIに、このPlanの相談を続けられます。
              </p>
              {lastChatMessageAt && (
                <p className="mt-2 text-xs text-worksheet-secondary">
                  最終相談: {formatLastUpdated(lastChatMessageAt)}
                </p>
              )}
              <Link
                href={`/plans/${typedPlan.id}/chat`}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-2.5 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                AIに相談を続ける
              </Link>
            </section>

            <section className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-worksheet-primary">Worksheet</h2>
              <p className="mt-1 text-sm leading-relaxed text-worksheet-secondary">
                気持ちや条件を、自分のペースで整理できます。
              </p>
              <PlanWorksheetProgress planId={typedPlan.id} />
              <Link
                href={`/plans/${typedPlan.id}/worksheet`}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-2.5 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                ワークシートで整理する
              </Link>
            </section>
          </div>

          {/* 右カラム（PCでは1/3幅）: このPlanについて → 最終更新 */}
          <div className="space-y-4">
            <section className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-worksheet-primary">このPlanについて</h2>
              {hasAboutInfo ? (
                <dl className="mt-3 space-y-2.5">
                  {summary.city && (
                    <div>
                      <dt className="text-xs font-medium text-worksheet-secondary">都市</dt>
                      <dd className="mt-0.5 text-sm text-worksheet-primary">{summary.city}</dd>
                    </div>
                  )}
                  {summary.departureTiming && (
                    <div>
                      <dt className="text-xs font-medium text-worksheet-secondary">出発予定</dt>
                      <dd className="mt-0.5 text-sm text-worksheet-primary">{summary.departureTiming}</dd>
                    </div>
                  )}
                  {summary.stage && (
                    <div>
                      <dt className="text-xs font-medium text-worksheet-secondary">検討段階</dt>
                      <dd className="mt-0.5 text-sm text-worksheet-primary">{summary.stage}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
                  まだ情報がありません。AIに相談すると、ここに追記されていきます。
                </p>
              )}

              <Link
                href={`/plans/${typedPlan.id}/my-plan`}
                className="mt-4 inline-block text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
              >
                My Planを見る →
              </Link>
            </section>

            <section className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-worksheet-primary">最終更新</h2>
              <p className="mt-2 text-sm text-worksheet-primary">{formatLastUpdated(lastUpdatedIso)}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
