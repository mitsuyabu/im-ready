import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadLastChatMessageAt, loadPlanKarte } from "@/lib/planChat";
import { loadPlanWorksheet } from "@/lib/planWorksheet";
import { formatLastUpdated, loadPlanLastActivityMap } from "@/lib/planActivity";
import { summarizeKarteForCard } from "@/lib/planCardSummary";
import { getCityGuideDescription } from "@/lib/cityGuide";
import PlanTravelHero from "@/components/PlanTravelHero";
import PlanJourneyRibbon from "@/components/PlanJourneyRibbon";
import PlanWorksheetProgress from "@/components/PlanWorksheetProgress";
import MobileBrandHeader from "@/components/MobileBrandHeader";
import DeletePlanButton from "@/components/DeletePlanButton";
import { toCityChipText, toDeparturePlanInfoText } from "@/lib/planHeroImage";

export const metadata: Metadata = {
  title: "プラン",
};

type PlanRow = { id: string; title: string; updated_at: string };

interface PlanPageProps {
  params: Promise<{ planId: string }>;
}

/**
 * カード共通の chrome。
 * 新しいデザイン方針では **地は白のまま**で、枠・影・角丸だけでカードを立たせる
 * （パステルの全面塗り・地紋・きらめきレイヤーは廃止した）。
 * 色・角丸・影は globals.css の共通トークンを参照し、このページで値を決め直さない。
 */
const CARD = "mk-card relative overflow-hidden";

/**
 * 4 点きらめき。以前はカード全面の装飾レイヤーに使っていたが、いまは
 * 各カードのイラスト内の小さなアクセントとしてだけ残している。
 */
const SPARKLE_D =
  "M0-10C1.3-4.2 4.2-1.3 10 0 4.2 1.3 1.3 4.2 0 10-1.3 4.2-4.2 1.3-10 0-4.2-1.3-1.3-4.2 0-10Z";

/**
 * 機能別カラー（globals.css の --fn-*）。使うのは**アイコンの背景**だけで、
 * カード自体の地色にはしない。
 */
const ICON_TILE =
  "fn-icon h-[64px] w-[64px] rounded-[18px] sm:h-[72px] sm:w-[72px]";

/** アイコンタイルの中に置くイラストのサイズ。 */
const CARD_ICON_CLASS = "h-11 w-11 shrink-0 sm:h-[52px] sm:w-[52px]";

/**
 * AI相談カードのイラスト（Mindtrip 参考のエディトリアル表現）。
 *
 * 既製の 3D アイコンをやめ、「紙に描いたような」線画にしてある:
 *   - navy outline + pastel fill のシンプルなオブジェクト（吹き出し 2 つ＝対話）
 *   - 図形はわざと左右非対称・線端は丸め、幾何学的になりすぎないようにする
 *   - 背景は塗らない（透過）ので、機能別カラーのアイコン背景がそのまま下地になる
 * 以前あった水彩のにじみ（ぼかした楕円）は、パステルのアイコン背景と二重になるので外した。
 * ラスター画像ではなく SVG なので 44 / 52px のどちらでも潰れない。
 */
function AiConsultIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden>
      <g transform="rotate(-2 48 48)" stroke="#2b3a55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* 奥の吹き出し（相手の声）: セージ地 */}
        <path
          d="M 59 36 h 18 a 11 11 0 0 1 11 11 v 12 a 11 11 0 0 1 -11 11 h -4 l 1.5 8 -10 -8 h -5.5 a 11 11 0 0 1 -11 -11 v -12 a 11 11 0 0 1 11 -11 z"
          fill="#dde8e1"
        />
        <path d="M 67 50 h 13" opacity="0.55" />
        <path d="M 67 58 h 8" opacity="0.55" />

        {/* 手前の吹き出し（自分の声）: 白地。尾は左下へ少し長めに流す */}
        <path
          d="M 20 16 h 30 a 12 12 0 0 1 12 12 v 14 a 12 12 0 0 1 -12 12 h -18 l -11 9 1.5 -9 h -2.5 a 12 12 0 0 1 -12 -12 v -14 a 12 12 0 0 1 12 -12 z"
          fill="#ffffff"
        />
        <path d="M 20 30 h 28" opacity="0.7" />
        <path d="M 20 39 h 19" opacity="0.7" />
      </g>

      {/* きらめき（カード装飾と同じ 4 点の形で揃える） */}
      <path d={SPARKLE_D} transform="translate(80 18) scale(0.62)" fill="#e0806a" opacity="0.85" />
      <path d={SPARKLE_D} transform="translate(90 32) scale(0.3)" fill="#e0806a" opacity="0.5" />
    </svg>
  );
}

/**
 * Worksheet カードのイラスト。AiConsultIllustration と同じ描き方
 * （navy outline + pastel fill / 透過背景 / 少し傾ける）で揃えている。
 * モチーフは「チェックを入れていく記入シートと鉛筆」。
 */
function WorksheetIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden>
      <g transform="rotate(-3 48 48)" stroke="#2b3a55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* 記入シート */}
        <path d="M 24 12 h 42 a 6 6 0 0 1 6 6 v 58 a 6 6 0 0 1 -6 6 h -42 a 6 6 0 0 1 -6 -6 v -58 a 6 6 0 0 1 6 -6 z" fill="#ffffff" />
        {/* チェック欄（上 2 つは記入済み＝セージ、3 つめはこれから） */}
        <rect x="26" y="26" width="11" height="11" rx="3.5" fill="#dde8e1" />
        <rect x="26" y="44" width="11" height="11" rx="3.5" fill="#dde8e1" />
        <rect x="26" y="62" width="11" height="11" rx="3.5" fill="#ffffff" />
        <path d="M 29 31.6 l 2.2 2.3 4.1 -4.7" />
        <path d="M 29 49.6 l 2.2 2.3 4.1 -4.7" />
        {/* 回答の行 */}
        <path d="M 43 31 h 22" opacity="0.6" />
        <path d="M 43 49 h 17" opacity="0.6" />
        <path d="M 43 67 h 22" opacity="0.6" />
      </g>

      {/* 鉛筆（シートの右下に重ねてコラージュらしく） */}
      <g transform="rotate(-3 48 48)" stroke="#2b3a55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 66 84 l 16 -16 7 7 -16 16 -9 2 z" fill="#fbe3c9" />
        <path d="M 66 84 l 4 -9 5 5 z" fill="#2b3a55" />
      </g>

      <path d={SPARKLE_D} transform="translate(82 20) scale(0.62)" fill="#7f9a6a" opacity="0.8" />
      <path d={SPARKLE_D} transform="translate(90 33) scale(0.3)" fill="#7f9a6a" opacity="0.45" />
    </svg>
  );
}

/**
 * My Karte カードのイラスト。参考画像の「浮いている小カード」を資料の重なりに読み替えたもの。
 * 奥からクリーム → 白 → 白の 3 枚を少しずつ角度を変えて重ね、紙が束ねてある感じを出す。
 */
function MyKarteIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden>
      <g stroke="#2b3a55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* 奥の 1 枚（クリーム） */}
        <g transform="rotate(-11 48 52)">
          <rect x="18" y="26" width="48" height="52" rx="7" fill="#fdf0cf" />
        </g>
        {/* 中の 1 枚 */}
        <g transform="rotate(-4 48 52)">
          <rect x="24" y="22" width="48" height="54" rx="7" fill="#ffffff" />
        </g>
        {/* 手前の 1 枚（見出しの帯と本文の行） */}
        <g transform="rotate(4 48 52)">
          <rect x="30" y="20" width="48" height="56" rx="7" fill="#ffffff" />
          <rect x="37" y="29" width="20" height="7" rx="3.5" fill="#dde8e1" />
          <path d="M 37 46 h 34" opacity="0.6" />
          <path d="M 37 55 h 27" opacity="0.6" />
          <path d="M 37 64 h 31" opacity="0.6" />
        </g>
      </g>

      <path d={SPARKLE_D} transform="translate(16 20) scale(0.6)" fill="#cf9f4c" opacity="0.8" />
      <path d={SPARKLE_D} transform="translate(8 33) scale(0.29)" fill="#cf9f4c" opacity="0.45" />
    </svg>
  );
}

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

/** boarding pass 風の decorative チケット。generic ラベルのみで、具体値は出さない。 */
function BoardingPass() {
  return (
    <svg aria-hidden viewBox="0 0 148 56" className="h-12 w-36 text-[#b4b7b1]" fill="none" stroke="currentColor" strokeWidth="1.2">
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

  const [karte, lastChatMessageAt, activityMap, worksheet] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadLastChatMessageAt(supabase, planId),
    loadPlanLastActivityMap(supabase, [planId]),
    // Worksheet の回答済み件数を端末に依存させないため、正本（plan_worksheet）を一緒に読む。
    loadPlanWorksheet(supabase, planId),
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

  // Hero の説明文: 対応 6 都市なら固定の都市説明（lib/cityGuide.ts）、無ければ Hero 側の既定コピー。
  const cityGuideDescription = getCityGuideDescription(destinationCity);

  return (
    <div className="min-h-dvh bg-white">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、mobileのみこのheader（ロゴ＋タグライン） */}
      <header className="border-b border-[var(--mk-border)] bg-white px-4 py-4 sm:px-6 lg:hidden">
        <MobileBrandHeader />
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-6">
        <Link
          href="/mypage"
          className="mk-sub-text font-medium text-[var(--mk-label)] underline decoration-[#c9ccc6] underline-offset-2 transition-colors hover:decoration-[var(--mk-ink)]"
        >
          ← マイページに戻る
        </Link>

        <div className="mt-3">
          <PlanTravelHero
            planId={typedPlan.id}
            title={typedPlan.title}
            city={summary.city}
            destinationCity={destinationCity}
            departureTiming={summary.departureTiming}
            cityGuideDescription={cityGuideDescription}
          />
        </div>

        <div className="mt-4">
          <PlanJourneyRibbon currentIndex={journeyIndex} />
        </div>

        {/* PC（lg 以上）は 2 カラム。左に AI相談 → Worksheet → My Karte、右に About This Plan を置く。
            mobile は従来どおり 1 カラムで DOM 順（AI相談 → Worksheet → About This Plan → My Karte）に並ぶため、
            カードは DOM 順を変えずに lg の grid placement だけで配置している。
            4 枚とも白地・薄い border・控えめな影で、機能ごとの色はアイコン背景にだけ出す。
            高さを固定する min-h は外し、中身のぶんだけの高さにしている（余白を作りすぎない）。 */}
        <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] lg:gap-x-6 lg:gap-y-4">
            {/* AI相談（PC: 左カラム 1 段目） */}
            <section
              className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6 lg:col-start-1 lg:row-start-1`}
            >
              <span aria-hidden className={ICON_TILE} style={{ backgroundColor: "var(--fn-chat)" }}>
                <AiConsultIllustration className={CARD_ICON_CLASS} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="mk-card-title">AI相談</h2>
                <p className="mk-text mt-1 text-[var(--mk-sub)]">
                  AIカウンセラーと話しながら、気持ちや希望を整理し、自分に合う学校や留学の形を見つけます。
                </p>
                {lastChatMessageAt && (
                  <p className="mk-sub-text mt-1.5">最終相談 {formatLastUpdated(lastChatMessageAt)}</p>
                )}
              </div>
              {/* このページの主要操作はここだけ蛍光ライム。他 2 枚は白地の副次ボタンにする。 */}
              <Link
                href={`/plans/${typedPlan.id}/chat`}
                className="btn-primary shrink-0 self-start sm:self-center"
              >
                相談を続ける →
              </Link>
            </section>

            {/* Worksheet（PC: 左カラム 2 段目） */}
            <section
              className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6 lg:col-start-1 lg:row-start-2`}
            >
              <span aria-hidden className={ICON_TILE} style={{ backgroundColor: "var(--fn-worksheet)" }}>
                <WorksheetIllustration className={CARD_ICON_CLASS} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="mk-card-title">Worksheet</h2>
                <p className="mk-text mt-1 text-[var(--mk-sub)]">
                  設問に答えながら、留学の目的・条件・優先順位を、自分のペースで整理していきます。
                </p>
                {/* 既存 PlanWorksheetProgress はロジック不変。表示される時だけ薄い pill に見せる wrapper。 */}
                <div className="[&>p]:m-0 [&>p]:mt-2 [&>p]:inline-block [&>p]:rounded-full [&>p]:bg-[var(--mk-block)] [&>p]:px-2.5 [&>p]:py-1 [&>p]:text-[12px] [&>p]:font-medium [&>p]:text-[var(--mk-label)]">
                  <PlanWorksheetProgress planId={typedPlan.id} karte={karte} serverWorksheet={worksheet} />
                </div>
              </div>
              <Link
                href={`/plans/${typedPlan.id}/worksheet`}
                className="btn-quiet shrink-0 self-start sm:self-center"
              >
                見直す →
              </Link>
            </section>

            {/* About This Plan（PC: 右カラム。高さは揃えず self-start のまま）。
                以前はラベンダーの全面グラデーションだったが、地は白に戻し、
                各項目の小さなアイコン背景だけ My Plan の機能色（イエロー）にしている。 */}
            <section
              className={`${CARD} p-5 sm:p-6 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start`}
            >
              <h2 className="mk-section-title">About This Plan</h2>

              <dl className="mt-4 divide-y divide-[var(--mk-border)]">
                <div className="flex items-center gap-3 py-3.5 first:pt-1">
                  <span
                    aria-hidden
                    className="fn-icon h-9 w-9 rounded-[12px]"
                    style={{ backgroundColor: "var(--fn-plan)" }}
                  >
                    <PinIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <dt className="mk-item-label-sm">行き先</dt>
                    <dd className="mk-value mt-0.5 break-words">
                      {destinationCity ? toCityChipText(destinationCity) : "これから整理"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-center gap-3 py-3.5">
                  <span
                    aria-hidden
                    className="fn-icon h-9 w-9 rounded-[12px]"
                    style={{ backgroundColor: "var(--fn-plan)" }}
                  >
                    <ClockIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <dt className="mk-item-label-sm">出発の目安</dt>
                    <dd className="mk-value mt-0.5 break-words">
                      {summary.departureTiming ? toDeparturePlanInfoText(summary.departureTiming) : "これから整理"}
                    </dd>
                  </div>
                </div>
              </dl>

              <Link
                href={`/plans/${typedPlan.id}/my-plan`}
                className="mk-link mt-4 inline-block underline decoration-[#c9ccc6] underline-offset-[4px] transition-colors hover:decoration-[var(--mk-ink)]"
              >
                My Planを見る →
              </Link>
            </section>

            {/* My Karte（PC: 左カラム 3 段目 = Worksheet の直下）。
                以前は内部だけ独自の grid だったが、AI相談 / Worksheet と同じ
                「アイコン左・テキスト中央・CTA 右」の 1 行構成に揃えた
                （mobile は 3 枚とも縦積み）。文言・route は変更していない。 */}
            <section
              className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6 lg:col-start-1 lg:row-start-3`}
            >
              <span aria-hidden className={ICON_TILE} style={{ backgroundColor: "var(--fn-karte)" }}>
                <MyKarteIllustration className={CARD_ICON_CLASS} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="mk-card-title">My Karte</h2>
                <p className="mk-text mt-1 text-[var(--mk-sub)]">
                  考えたことや決めたことを、相談や共有に使いやすい資料にまとめます。自分の考えを振り返るときにも役立ちます。
                </p>
              </div>
              <Link
                href={`/plans/${typedPlan.id}/documents`}
                className="btn-quiet shrink-0 self-start sm:self-center"
              >
                資料を見る →
              </Link>
            </section>
        </div>

        {/* フッター：実データの最終更新 ＋ 手書き風の一言 ＋ boarding pass 風チケット */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--mk-border)] pt-5">
          <span className="mk-sub-text inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            最終更新 {formatLastUpdated(lastUpdatedIso)}
          </span>
          <div className="flex items-center gap-3">
            <span aria-hidden className="font-serif text-sm italic text-[var(--mk-sub)]">Keep going!</span>
            <BoardingPass />
          </div>
          {/* Plan の整理用。確認ダイアログで「消えるもの」を示してから削除する（一覧のカードメニューと同じダイアログ）。 */}
          <div className="w-full">
            <DeletePlanButton planId={typedPlan.id} planTitle={typedPlan.title} userId={user.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
