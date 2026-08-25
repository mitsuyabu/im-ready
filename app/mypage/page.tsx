import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanCardSummaries } from "@/lib/planCardSummary";
import { formatLastUpdated, loadPlanLastActivityMap } from "@/lib/planActivity";
import PlanCard from "@/components/PlanCard";
import BrandLogo from "@/components/BrandLogo";
import CreatePlanForm from "@/components/CreatePlanForm";
import NewPlanButton from "@/components/NewPlanButton";

export const metadata: Metadata = {
  title: "マイページ",
};

type PlanRow = { id: string; title: string; created_at: string; updated_at: string };

/**
 * ログイン必須（middleware.tsが /mypage/:path* を保護している）。
 * ログイン後のホーム。本人が持つ留学Planを一覧表示し、開く・新しく作る入口を提供する。
 *
 * 以前はここでPlanを1件だけ暗黙的に選ぶ／自動作成していたが（limit(1)）、
 * 複数Planが前提の設計と矛盾するため廃止した。Plan一覧の主役はここに一本化し、
 * 旧 /plans はこのページへのredirectのみになる。
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

  // plan_karte・chat関連はPlanごとに個別問い合わせせず、それぞれ1回のバルククエリでまとめて
  // 取得する（N+1回避）。plan_karte行が無いPlanはsummaries[plan.id]がundefinedになり、
  // 以下ですべて未定表示になる。
  const [summaries, activityMap] = await Promise.all([
    loadPlanCardSummaries(supabase, planIds),
    loadPlanLastActivityMap(supabase, planIds),
  ]);

  return (
    <div className="min-h-dvh bg-worksheet-surface">
      {/* PCではAppNavの左sidebarに同じロゴ・Menu内Sign outがあるため、mobileだけこのheaderを表示する */}
      <header className="border-b border-worksheet-border px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14 lg:pt-12">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-semibold leading-snug text-worksheet-primary">
            あなたの留学Plan
          </h1>
          {planList.length > 0 && <NewPlanButton userId={user.id} />}
        </div>

        {planList.length === 0 ? (
          <div className="mt-8 rounded-[24px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-8 text-center">
            <p className="text-base font-medium text-worksheet-primary">
              まだ留学Planがありません
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              「海外に行ってみたいかも」くらいの段階から始められます。
              <br />
              AIと相談しながら、最初のPlanを作ってみましょう。
            </p>
            <div className="mx-auto mt-6 max-w-sm text-left">
              <CreatePlanForm userId={user.id} />
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              留学Planはいくつでも作れます。Planごとに、相談やワークシートの内容を分けて整理できます。
            </p>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {planList.map((plan) => {
                const summary = summaries[plan.id];
                // 「最終更新」は plans.updated_at と、DB上で確認できるKarte/Chatの
                // アクティビティのうち一番新しいものを採用する。plan_karte・chat_messages が
                // まだ無い作成直後のPlanは plans.updated_at（≒作成日時）にfallbackする。
                // 作成直後はそれ自体が直近の操作であり、不自然な値にはならない。
                // Worksheetの回答はlocalStorageのみでDBに無いため、この算出には含まれない。
                const lastActivityIso = activityMap[plan.id];
                const lastUpdatedIso =
                  lastActivityIso && lastActivityIso > plan.updated_at ? lastActivityIso : plan.updated_at;
                return (
                  <PlanCard
                    key={plan.id}
                    plan={{
                      id: plan.id,
                      title: plan.title,
                      city: summary?.city ?? null,
                      departureTiming: summary?.departureTiming ?? null,
                      stage: summary?.stage ?? null,
                      lastUpdatedText: formatLastUpdated(lastUpdatedIso),
                    }}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
