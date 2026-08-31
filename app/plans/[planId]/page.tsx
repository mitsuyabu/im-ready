import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadLastChatMessageAt, loadPlanKarte } from "@/lib/planChat";
import { formatLastUpdated, loadPlanLastActivityMap } from "@/lib/planActivity";
import { summarizeKarteForCard } from "@/lib/planCardSummary";
import PlanTravelHero from "@/components/PlanTravelHero";
import PlanJourneyRibbon from "@/components/PlanJourneyRibbon";
import PlanWorksheetProgress from "@/components/PlanWorksheetProgress";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "プラン",
};

type PlanRow = { id: string; title: string; updated_at: string };

interface PlanPageProps {
  params: Promise<{ planId: string }>;
}

const CARD =
  "rounded-[18px] border border-[#e7ddc9] bg-[#fdfbf4] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.045)] sm:p-6";

function SpeechIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 10h6M9 14h4" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

/**
 * そのPlanのワークスペースの正本URL。planIdをURLから読み、そのつどサーバー側で所有者確認する
 * （グローバルなselectedPlan stateは持たない）。「存在しないPlan」と「他人のPlan」は区別せず
 * どちらもnotFound()にする（情報漏洩防止）。
 *
 * 見た目は共有デザインに寄せた「旅のしおり」風：紙・マスキングテープ・スタンプ・手書き線。
 * ヒーロー → いまの現在地（Journey）→ 左に AI相談 / Worksheet、右に このPlanについて / Documents
 * → 下部フッター。認証・DB・API・取得ロジック（loadPlanKarte / loadLastChatMessageAt /
 * loadPlanLastActivityMap / summarizeKarteForCard）は変更しない。
 *
 * 実データが無い項目は具体値を創作せず、穏やかな UI fallback 文言のみ出す。
 * Journey の「いまここ」は stated 情報だけからの素朴な3分岐で、進捗の塗り・チェック・件数は出さない。
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

  const [karte, lastChatMessageAt, activityMap] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadLastChatMessageAt(supabase, planId),
    loadPlanLastActivityMap(supabase, [planId]),
  ]);

  const summary = summarizeKarteForCard(karte);
  const lastActivityIso = activityMap[planId];
  const lastUpdatedIso =
    lastActivityIso && lastActivityIso > typedPlan.updated_at ? lastActivityIso : typedPlan.updated_at;

  // 「いまの現在地」: 既存の stated 情報だけからの素朴な3分岐（複雑な進捗アルゴリズムは作らない）。
  const schoolsPresented = karte.proposals.presented.some((p) => p.type === "school");
  const hasStatedConditions = Boolean(summary.city || summary.departureTiming || summary.stage);
  const journeyIndex = schoolsPresented ? 2 : hasStatedConditions ? 1 : 0;

  return (
    <div className="min-h-dvh bg-[#faf7ee]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、mobileのみこのheader（サイズは変更しない） */}
      <header className="border-b border-[#e7ddc9] bg-[#fdfbf4] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-8">
        <Link
          href="/mypage"
          className="text-xs text-[#7d8a6f] underline decoration-[#7d8a6f]/40 underline-offset-2 transition-colors hover:decoration-[#7d8a6f]"
        >
          ← マイページに戻る
        </Link>

        <div className="mt-4">
          <PlanTravelHero
            title={typedPlan.title}
            city={summary.city}
            departureTiming={summary.departureTiming}
          />
        </div>

        <div className="mt-8">
          <PlanJourneyRibbon currentIndex={journeyIndex} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* AI相談（左・広め） */}
          <section className={`${CARD} lg:col-span-2`}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8a9a86]/25 text-[#5f6b5a]">
                <SpeechIcon className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-[#2b3a55]">AI相談</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#6b6357]">
              このPlanについて、続きを話そう。
            </p>
            {lastChatMessageAt && (
              <p className="mt-2 text-xs text-[#8b857a]">
                最終相談 {formatLastUpdated(lastChatMessageAt)}
              </p>
            )}
            <Link
              href={`/plans/${typedPlan.id}/chat`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#e0806a] px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              相談を続ける →
            </Link>
          </section>

          {/* このPlanについて（右・pinned note 風） */}
          <section className={`${CARD} relative lg:col-span-1`}>
            <span aria-hidden className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7d94b5] ring-2 ring-[#fdfbf4]" />
            <h2 className="text-base font-semibold text-[#2b3a55]">このPlanについて</h2>
            <dl className="mt-3 space-y-2.5">
              <div>
                <dt className="text-xs font-medium text-[#8b857a]">行き先</dt>
                <dd className="mt-0.5 text-sm text-[#2b3a55]">
                  {summary.city ?? "行き先を整理していこう"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#8b857a]">出発の目安</dt>
                <dd className="mt-0.5 text-sm text-[#2b3a55]">
                  {summary.departureTiming ?? "時期はこれから整理"}
                </dd>
              </div>
              {summary.stage && (
                <div>
                  <dt className="text-xs font-medium text-[#8b857a]">いまのテーマ</dt>
                  <dd className="mt-0.5 text-sm text-[#2b3a55]">{summary.stage}</dd>
                </div>
              )}
            </dl>
            <Link
              href={`/plans/${typedPlan.id}/my-plan`}
              className="mt-4 inline-block text-xs text-[#7d8a6f] underline decoration-[#7d8a6f]/40 underline-offset-2 transition-colors hover:decoration-[#7d8a6f]"
            >
              My Planを見る →
            </Link>
          </section>

          {/* Worksheet（左・広め） */}
          <section className={`${CARD} lg:col-span-2`}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8a9a86]/25 text-[#5f6b5a]">
                <ClipboardIcon className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-[#2b3a55]">Worksheet</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#6b6357]">
              気持ちや条件を、自分のペースで整理する。
            </p>
            <PlanWorksheetProgress planId={typedPlan.id} />
            <Link
              href={`/plans/${typedPlan.id}/worksheet`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#2b3a55]/25 px-5 py-2.5 text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              見直す →
            </Link>
          </section>

          {/* Documents（右） */}
          <section className={`${CARD} lg:col-span-1`}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8a9a86]/25 text-[#5f6b5a]">
                <FolderIcon className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-[#2b3a55]">Documents</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#6b6357]">
              考えたことを、資料に残す。
            </p>
            <Link
              href={`/plans/${typedPlan.id}/documents`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#2b3a55]/25 px-5 py-2.5 text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              資料を見る →
            </Link>
          </section>
        </div>

        {/* フッター：実データの最終更新 ＋ 手書き風の一言 ＋ チケット風の小さな装飾 */}
        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-[#d8d0be] pt-5 text-xs text-[#8b857a]">
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4" y="5" width="16" height="16" rx="2" />
              <path d="M4 9h16M9 3v4M15 3v4" />
            </svg>
            最終更新 {formatLastUpdated(lastUpdatedIso)}
          </span>
          <span aria-hidden className="inline-flex items-center gap-1.5 text-[#8a9a86]">
            <svg viewBox="0 0 40 16" className="h-4 w-10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8h30l6 4V4l-6 4" />
              <path d="M14 8v0M20 8v0M26 8v0" strokeDasharray="0.1 4" />
            </svg>
            <span className="font-serif text-sm italic text-[#7a8a76]">Keep going!</span>
          </span>
        </div>
      </div>
    </div>
  );
}
