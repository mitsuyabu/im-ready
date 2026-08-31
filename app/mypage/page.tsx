import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanCardSummaries } from "@/lib/planCardSummary";
import { formatLastUpdated, loadPlanLastActivityMap } from "@/lib/planActivity";
import HomePlanCard from "@/components/HomePlanCard";
import BrandLogo from "@/components/BrandLogo";
import CreatePlanForm from "@/components/CreatePlanForm";
import NewPlanButton from "@/components/NewPlanButton";

export const metadata: Metadata = {
  title: "マイページ",
};

type PlanRow = { id: string; title: string; created_at: string; updated_at: string };

/**
 * ログイン必須（middleware.tsが /mypage/:path* を保護している）。ログイン後のホーム。
 *
 * HOME UI/UX：共有された参考デザインに寄せた「Editorial Study Abroad Workspace」。
 * warm ivory の地に大きな角丸 surface を1枚置き、その中に
 *   serif の大見出し ＋ 新規作成 → 細い divider → Plan 件数 → 縦長 editorial カード3列
 *   → 最近の動き（Plan 単位の最終更新のみ）
 * を余白広めで並べる。
 *
 * データは既存の取得経路のみ:
 *   plans(id,title,created_at,updated_at) ＋ loadPlanCardSummaries（stated 限定の city/departureTiming/stage）
 *   ＋ loadPlanLastActivityMap（plan_karte.updated_at と chat_messages.created_at の最新）。
 * Worksheet 進捗（localStorage のみ）・「進行中/active」概念（データモデルに無い）・
 * イベント単位の activity feed（テーブルが無い）は扱わない。fake データは表示しない。
 *
 * Plan 作成（NewPlanButton / CreatePlanForm）・Plan を開く導線（/plans/[id]）・auth・
 * AppNav sidebar / mobile nav / BrandLogo は不変。
 */
export default async function MyPagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const planList = (plans ?? []) as PlanRow[];
  const planIds = planList.map((plan) => plan.id);

  const [summaries, activityMap] = await Promise.all([
    loadPlanCardSummaries(supabase, planIds),
    loadPlanLastActivityMap(supabase, planIds),
  ]);

  // 「最終更新」は plans.updated_at と、DB上で確認できる Karte/Chat のアクティビティのうち
  // 新しい方（既存ロジックそのまま）。Worksheet の回答は localStorage のみで DB に無いため含まれない。
  const enriched = planList.map((plan, i) => {
    const lastActivityIso = activityMap[plan.id];
    const lastUpdatedIso =
      lastActivityIso && lastActivityIso > plan.updated_at ? lastActivityIso : plan.updated_at;
    return { plan, index: i + 1, lastUpdatedIso, summary: summaries[plan.id] };
  });

  // 「最近の動き」= Plan 単位の最終更新の新しい順。イベント種別（Worksheet を整理した等）は
  // 記録が無いため出さない。Plan が1件だけのときは出さない。
  const recent = [...enriched]
    .sort((a, b) => (a.lastUpdatedIso < b.lastUpdatedIso ? 1 : -1))
    .slice(0, 4);

  const gridClass =
    planList.length === 1
      ? "mt-6 grid max-w-sm grid-cols-1 gap-5"
      : "mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3";

  return (
    <div className="min-h-dvh bg-[#f6f2ea]">
      {/* PCではAppNavの左sidebarに同じロゴがあるため、mobileだけこのheaderを表示する（サイズは変更しない） */}
      <header className="border-b border-[#e7decd] bg-worksheet-surface px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
        {/* 参考デザインの「一枚の大きな紙」。tablet では角丸を弱め、mobile は素の面。 */}
        <div className="rounded-none bg-transparent p-0 sm:rounded-[22px] sm:border sm:border-black/[0.06] sm:bg-[#fffdf8] sm:p-9 lg:rounded-[32px] lg:p-14 lg:shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-serif text-[2rem] font-normal leading-[1.12] tracking-tight text-worksheet-primary sm:text-[2.75rem] lg:text-[3.25rem]">
                あなたの留学Plan
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[#7a7469]">
                気になることから、少しずつ自分の計画にしていこう。
              </p>
            </div>
            {planList.length > 0 && <NewPlanButton userId={user.id} />}
          </div>

          {planList.length === 0 ? (
            <div className="mt-10 rounded-[24px] border border-[#e7decd] bg-[#f5f0e7] p-8 text-center sm:mt-12 sm:p-12">
              <p className="font-serif text-2xl font-normal text-worksheet-primary">
                まだ留学Planがありません
              </p>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#655f54]">
                「海外に行ってみたいかも」くらいの段階から始められます。
                <br className="hidden sm:block" />
                AIと相談しながら、最初のPlanを作ってみましょう。
              </p>
              <div className="mx-auto mt-6 max-w-sm text-left">
                <CreatePlanForm userId={user.id} />
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 border-t border-black/[0.08] sm:mt-10" />

              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="font-medium text-worksheet-primary">{planList.length}つのPlan</span>
                {/* 右側は将来「いま進めているPlan N件」等を置く余白。active を正確に判定できないため今は空。 */}
                <span aria-hidden />
              </div>

              <div className={gridClass}>
                {enriched.map(({ plan, index, lastUpdatedIso, summary }) => (
                  <HomePlanCard
                    key={plan.id}
                    plan={{
                      id: plan.id,
                      index,
                      title: plan.title,
                      city: summary?.city ?? null,
                      departureTiming: summary?.departureTiming ?? null,
                      stage: summary?.stage ?? null,
                      lastUpdatedText: formatLastUpdated(lastUpdatedIso),
                    }}
                  />
                ))}
              </div>

              {enriched.length >= 2 && (
                <section className="mt-14 sm:mt-16">
                  <h2 className="text-sm font-medium text-[#7a7469]">最近の動き</h2>
                  <ul className="mt-4 divide-y divide-black/[0.06] overflow-hidden rounded-[18px] border border-black/[0.07] bg-worksheet-surface">
                    {recent.map(({ plan, lastUpdatedIso }) => (
                      <li key={plan.id}>
                        <Link
                          href={`/plans/${plan.id}`}
                          className="flex items-center gap-3 px-4 py-3.5 text-sm transition-colors duration-150 hover:bg-black/[0.02]"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-[#a39d90]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M7 3h7l4 4v14H7z" />
                            <path d="M14 3v4h4" />
                            <path d="M9 12h6M9 16h4" />
                          </svg>
                          <span className="min-w-0 flex-1 truncate text-worksheet-primary">
                            {plan.title}
                          </span>
                          <span className="shrink-0 text-xs text-[#7a7469]">
                            更新 {formatLastUpdated(lastUpdatedIso)}
                          </span>
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-[#b7b1a4]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
