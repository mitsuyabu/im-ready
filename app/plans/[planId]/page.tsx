import type { Metadata } from "next";
import Image from "next/image";
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
import { toCityChipText, toDeparturePlanInfoText, toThemeText } from "@/lib/planHeroImage";

export const metadata: Metadata = {
  title: "プラン",
};

type PlanRow = { id: string; title: string; updated_at: string };

interface PlanPageProps {
  params: Promise<{ planId: string }>;
}

/** カード共通の枠・角丸・影（背景色は各カード側で指定する）。 */
const CARD =
  "relative rounded-[18px] border border-[#e7ddc9] shadow-[0_2px_6px_rgba(0,0,0,0.08)]";

/** AI相談 / Worksheet / Documents の左アイコンは提供画像（背景色・角丸・線画込み）。共通サイズ。 */
const CARD_ICON_CLASS = "h-16 w-16 shrink-0 sm:h-20 sm:w-20 lg:h-24 lg:w-24";

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 3v4M15 3v4" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 13V5a1 1 0 0 1 1-1h8l7 7-9 9-7-7Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  );
}

/** boarding pass 風の decorative チケット。generic ラベルのみで、具体値は出さない。 */
function BoardingPass() {
  return (
    <svg aria-hidden viewBox="0 0 148 56" className="h-12 w-36 text-[#9a9384]" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1" y="1" width="146" height="54" rx="4" />
      <line x1="102" y1="1" x2="102" y2="55" strokeDasharray="3 3" />
      <text x="9" y="15" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">BOARDING PASS</text>
      <text x="9" y="31" fontSize="6" fill="currentColor" stroke="none">DEPARTURE</text>
      <text x="9" y="45" fontSize="6" fill="currentColor" stroke="none">ARRIVAL</text>
      <path d="M70 20l16-5-5 16-4-7-7-4Z" strokeLinejoin="round" />
      <g strokeWidth="1.4">
        <line x1="110" y1="10" x2="110" y2="46" />
        <line x1="114" y1="10" x2="114" y2="46" />
        <line x1="120" y1="10" x2="120" y2="46" />
        <line x1="126" y1="10" x2="126" y2="46" />
        <line x1="130" y1="10" x2="130" y2="46" />
        <line x1="137" y1="10" x2="137" y2="46" />
        <line x1="142" y1="10" x2="142" y2="46" />
      </g>
    </svg>
  );
}

/**
 * そのPlanのワークスペースの正本URL。planIdをURLから読み、そのつどサーバー側で所有者確認する
 * （グローバルなselectedPlan stateは持たない）。「存在しないPlan」と「他人のPlan」は区別せず
 * どちらもnotFound()（情報漏洩防止）。
 *
 * 見た目は共有デザインのコラージュ構図に寄せる：navy＋破れた紙のヒーロー → 方眼紙の Journey 帯
 * → 左大カラム（AI相談 / Worksheet）＋右小カラム（このPlンについて / Documents）→ 下部フッター
 *（最終更新 ＋ Keep going! ＋ boarding pass）。
 *
 * 認証・DB・API・取得ロジック（loadPlanKarte / loadLastChatMessageAt / loadPlanLastActivityMap /
 * summarizeKarteForCard）・PlanWorksheetProgress・導線 URL は変更しない。
 * 実データが無い項目は具体値を創作せず、穏やかな UI fallback 文言のみ。
 * Journey の「いまここ」は「school 候補が提示されていれば index 1（学校を比べる）、それ以外は
 * index 0（気持ちを整理）」という素朴な分岐で、進捗の塗り・チェック・件数は出さない。
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

  const journeyIndex = karte.proposals.presented.some((p) => p.type === "school") ? 1 : 0;

  // Hero 画像切り替え用の「行き先として選択されている都市」。表示用の summary.city（自由記述で
  // 理由が続くことがある）ではなく、Karte の正式な行き先 field を使う。現状 Karte に構造化された
  // destination/city フィールドは schoolPrefs.preferredCity（自由記述・kind:"string"）しか無いため
  // それを採用し、certainty=stated かつ conflict 中でない場合だけ渡す（DB 変更はしない）。
  const preferredCity = karte.schoolPrefs?.preferredCity;
  const preferredCityInConflict = (karte.handoff?.conflicts ?? []).some(
    (c) => c.block === "schoolPrefs" && c.key === "preferredCity",
  );
  const destinationCity =
    !preferredCityInConflict && preferredCity?.certainty === "stated" && preferredCity.value
      ? preferredCity.value
      : null;

  return (
    <div className="min-h-dvh bg-[#fbf8f1]">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、mobileのみこのheader（サイズは変更しない） */}
      <header className="border-b border-[#e7ddc9] bg-[#fdfbf4] px-4 py-4 sm:px-6 lg:hidden">
        <BrandLogo href="/mypage" />
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-6">
        <Link
          href="/mypage"
          className="text-xs font-medium text-[#2b2a27] underline decoration-[#2b2a27]/30 underline-offset-2 transition-colors hover:decoration-[#2b2a27]"
        >
          ← マイページに戻る
        </Link>

        <div className="mt-3">
          <PlanTravelHero
            title={typedPlan.title}
            city={summary.city}
            destinationCity={destinationCity}
            departureTiming={summary.departureTiming}
          />
        </div>

        <div className="mt-4">
          <PlanJourneyRibbon currentIndex={journeyIndex} />
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] lg:gap-6">
          {/* 左カラム（広め）: AI相談 → Worksheet */}
          <div className="flex flex-col gap-4">
            {/* AI相談 */}
            <section className={`${CARD} bg-white flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7 lg:min-h-[160px]`}>
              <Image
                src="/plan-icons/ai-chat.webp"
                alt=""
                width={96}
                height={96}
                className={CARD_ICON_CLASS}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#2b3a55]">AI相談</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#6b6357]">このPlanについて、続きを話そう。</p>
                {lastChatMessageAt && (
                  <p className="mt-1.5 text-xs text-[#8b857a]">最終相談 {formatLastUpdated(lastChatMessageAt)}</p>
                )}
              </div>
              <Link
                href={`/plans/${typedPlan.id}/chat`}
                className="shrink-0 self-start rounded-full bg-[#e0806a] px-6 py-2.5 text-center text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:self-center"
              >
                相談を続ける →
              </Link>
            </section>

            {/* Worksheet */}
            <section className={`${CARD} bg-white flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7 lg:min-h-[160px]`}>
              <Image
                src="/plan-icons/worksheet.webp"
                alt=""
                width={96}
                height={96}
                className={CARD_ICON_CLASS}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#2b3a55]">Worksheet</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#6b6357]">気持ちや条件を、自分のペースで整理する。</p>
                {/* 既存 PlanWorksheetProgress はロジック不変。表示される時だけ薄い pill に見せる wrapper。 */}
                <div className="[&>p]:m-0 [&>p]:mt-2 [&>p]:inline-block [&>p]:rounded-full [&>p]:bg-[#eef1ec] [&>p]:px-2.5 [&>p]:py-0.5 [&>p]:text-[11px] [&>p]:text-[#5b5750]">
                  <PlanWorksheetProgress planId={typedPlan.id} />
                </div>
              </div>
              <Link
                href={`/plans/${typedPlan.id}/worksheet`}
                className="shrink-0 self-start rounded-full border border-[#2b3a55]/30 bg-white px-6 py-2.5 text-center text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:self-center"
              >
                見直す →
              </Link>
            </section>
          </div>

          {/* 右カラム（狭め）: このPlanについて → Documents */}
          <div className="flex flex-col gap-4">
            {/* このPlanについて（pinned note 風・下辺が破れ） */}
            <section
              className={`${CARD} bg-[#fdfbf4] p-5 sm:p-6 lg:min-h-[270px]`}
              style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 4px), 86% 100%, 62% calc(100% - 5px), 38% 100%, 14% calc(100% - 5px), 0 100%)" }}
            >
              <span aria-hidden className="absolute left-[58%] top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8a9a86] shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-2 ring-[#fdfbf4]" />
              <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-3 h-4 w-4 text-[#8a9a86]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 4v16M4 12h16M6.5 6.5l11 11M17.5 6.5l-11 11" />
              </svg>

              <h2 className="text-[22px] font-bold leading-tight text-[#1f2d43] sm:text-2xl">このPlanについて</h2>
              <svg aria-hidden viewBox="0 0 130 8" className="mt-1.5 h-2 w-28 text-[#8ba086]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 5c20-6 40 5 60 1s45-6 68-2" />
              </svg>

              <dl className="mt-4 divide-y divide-[#d8d0c3]">
                <div className="flex items-center justify-between gap-3 py-4 first:pt-3">
                  <dt className="inline-flex shrink-0 items-center gap-2 text-base font-medium text-[#625c54]">
                    <PinIcon className="h-5 w-5 text-[#2f2d2a]" />
                    行き先
                  </dt>
                  <dd className="min-w-0 text-right text-base font-semibold text-[#1f2d43] sm:text-lg">
                    {destinationCity ? toCityChipText(destinationCity) : "これから整理"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-4">
                  <dt className="inline-flex shrink-0 items-center gap-2 text-base font-medium text-[#625c54]">
                    <ClockIcon className="h-5 w-5 text-[#2f2d2a]" />
                    出発の目安
                  </dt>
                  <dd className="min-w-0 text-right text-base font-semibold text-[#1f2d43] sm:text-lg">
                    {summary.departureTiming ? toDeparturePlanInfoText(summary.departureTiming) : "これから整理"}
                  </dd>
                </div>
                {summary.stage && (
                  <div className="flex items-center justify-between gap-3 py-4">
                    <dt className="inline-flex shrink-0 items-center gap-2 text-base font-medium text-[#625c54]">
                      <TagIcon className="h-5 w-5 text-[#2f2d2a]" />
                      いまのテーマ
                    </dt>
                    <dd className="min-w-0 text-right text-base font-semibold text-[#1f2d43] sm:text-lg">
                      {toThemeText(summary.stage)}
                    </dd>
                  </div>
                )}
              </dl>

              <Link
                href={`/plans/${typedPlan.id}/my-plan`}
                className="mt-4 inline-block text-xs font-medium text-[#2b3a55] underline decoration-[#2b3a55]/30 underline-offset-2 transition-colors hover:decoration-[#2b3a55]"
              >
                My Planを見る →
              </Link>
            </section>

            {/* Documents */}
            <section className={`${CARD} bg-white overflow-hidden p-5 sm:p-6 lg:min-h-[165px]`}>
              <div className="flex items-start gap-4">
                <Image
                  src="/plan-icons/documents.webp"
                  alt=""
                  width={96}
                  height={96}
                  className={CARD_ICON_CLASS}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-[#2b3a55]">Documents</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[#6b6357]">考えたことを、資料に残す。</p>
                  <Link
                    href={`/plans/${typedPlan.id}/documents`}
                    className="mt-3 inline-block rounded-full border border-[#2b3a55]/30 bg-white px-5 py-2 text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    資料を見る →
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* フッター：実データの最終更新 ＋ 手書き風の一言 ＋ boarding pass 風チケット */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-dashed border-[#d8d0be] pt-5">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#8b857a]">
            <CalendarIcon className="h-3.5 w-3.5" />
            最終更新 {formatLastUpdated(lastUpdatedIso)}
          </span>
          <div className="flex items-center gap-3">
            <span aria-hidden className="font-serif text-sm italic text-[#7a8a76]">Keep going!</span>
            <BoardingPass />
          </div>
        </div>
      </div>
    </div>
  );
}
