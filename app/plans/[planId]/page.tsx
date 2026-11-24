import type { CSSProperties } from "react";
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

/** カード共通の枠・角丸・影（背景色は各カード側で指定する）。 */
const CARD =
  "relative overflow-hidden rounded-[18px] border border-[#e7ddc9] shadow-card";

/**
 * About This Plan だけの card chrome。radius は他カードと同じ 18px のまま、
 * border と shadow をさらに静かにして「落ち着いた panel」に見せる。
 * CARD 本体は AI相談 / Worksheet / My Karte が共有しているため変更しない。
 */
const ABOUT_CARD =
  "relative overflow-hidden rounded-[18px] border border-[#e6e1d8] shadow-card";

/**
 * Mindtrip 参考の 4 点きらめき。直線の星ではなく辺がくぼんだ形にするのが特徴。
 * 中心が原点（-10〜10）なので translate + scale だけで好きな位置・大きさに置ける。
 */
const SPARKLE_D =
  "M0-10C1.3-4.2 4.2-1.3 10 0 4.2 1.3 1.3 4.2 0 10-1.3 4.2-4.2 1.3-10 0-4.2-1.3-1.3-4.2 0-10Z";

/** SVG 文字列を background-image で使える data URI にする（サーバー側で 1 回だけ組み立てる）。 */
function svgUrl(svg: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}")`;
}

/**
 * カード右側に敷く「きらめき」の装飾レイヤー。
 * 雲（白い円の集合）は不採用。大小・不透明度の違うきらめきだけを散らして奥行きを出す。
 */
const decorSvg = (spark: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" viewBox="0 0 420 200">
  <g fill="${spark}">
    <path opacity=".5" transform="translate(245 113) scale(.75)" d="${SPARKLE_D}"/>
    <path opacity=".32" transform="translate(333 70) scale(1.1)" d="${SPARKLE_D}"/>
    <path opacity=".26" transform="translate(372 150) scale(.55)" d="${SPARKLE_D}"/>
  </g>
</svg>`;

/** 地紋（パターン）。ごく薄いきらめきと点を 64px 角でリピートし、紙に散った粒のように見せる。 */
const patternSvg = (spark: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="${spark}" opacity=".15">
    <path transform="translate(15 15) scale(.3)" d="${SPARKLE_D}"/>
    <path transform="translate(47 41) scale(.22)" d="${SPARKLE_D}"/>
    <circle cx="52" cy="13" r="1.3"/><circle cx="19" cy="48" r="1"/>
  </g>
</svg>`;

/**
 * Plan Home の 4 カードだけの表層（グラデーション + 地紋 + きらめき）。
 *
 * - グラデーション: 前フェーズのパステル 1 色をやめ、同系色の 3 段へ。彩度は低いまま
 *   「左上が少し濃く、右下へ抜ける」Mindtrip 的な流れにする。
 * - 地紋 / きらめき: background-image で敷くので必ず本文より背面に入り、カードの角丸で
 *   自動的に切り取られる（z-index も overflow も増やさない）。
 * - 重ね順は先頭が手前: きらめき → 地紋 → グラデーション。
 * 他ページへ波及させないため global token にはせず、このページ内で閉じている。
 */
function cardSurface(spark: string, gradient: string): CSSProperties {
  return {
    backgroundImage: `${svgUrl(decorSvg(spark))}, ${svgUrl(patternSvg(spark))}, ${gradient}`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundPosition: "right bottom, left top, left top",
    backgroundSize: "auto 100%, 64px 64px, 100% 100%",
  };
}

const CARD_SURFACE = {
  /** AI相談: ピーチ。コーラル CTA（#e0806a）を載せても沈まない明度に保つ。 */
  chat: cardSurface("#e2947a", "linear-gradient(115deg,#ffe0cd 0%,#ffece1 45%,#fff5ef 100%)"),
  /** Worksheet: セージ。既存の進捗 pill（#eef1ec）と喧嘩しない範囲で。 */
  worksheet: cardSurface("#8aa875", "linear-gradient(115deg,#e2eed1 0%,#edf5e1 45%,#f6fbef 100%)"),
  /** My Karte: クリーム。白の outline ボタンが見えるよう黄みは最小限。 */
  myKarte: cardSurface("#d9b263", "linear-gradient(115deg,#ffeabb 0%,#fff4d8 45%,#fffaec 100%)"),
  /** About This Plan: ラベンダー。従来の warm ivory の役割（Plan の要約面）を引き継ぐ。 */
  about: cardSurface("#a68fc8", "linear-gradient(135deg,#e8daf7 0%,#f2ecfa 50%,#faf7fd 100%)"),
} as const;

/**
 * カード左の図版の共通サイズ。Worksheet / My Karte はまだ提供画像（webp）、
 * AI相談だけ AiConsultIllustration（SVG）に差し替え済み。サイズ枠は 3 枚とも共通にして
 * 横並びのリズムを保つ（次フェーズで残り 2 枚を差し替えてもここは変えない）。
 */
const CARD_ICON_CLASS = "h-16 w-16 shrink-0 sm:h-20 sm:w-20 lg:h-24 lg:w-24";

/**
 * AI相談カードのイラスト（Mindtrip 参考のエディトリアル表現）。
 *
 * 既製の 3D アイコン（/plan-icons/ai-chat.webp）をやめ、カードの地色（ピーチ #fff3ed）と
 * 一体に見える「紙に描いたような」作りにしている:
 *   - 背景に水彩のにじみ（セージ／ピーチ）を薄く重ねてコラージュ感を出す
 *   - 前景は navy outline + pastel fill のシンプルなオブジェクト（吹き出し 2 つ＝対話）
 *   - 図形はわざと左右非対称・線端は丸め、幾何学的になりすぎないようにする
 *   - 背景は塗らない（透過）ので、カードの地色がそのまま下地になる
 * ラスター画像ではなく SVG なので 64 / 80 / 96px のどのサイズでも潰れない。
 */
function AiConsultIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden>
      {/* 水彩のにじみ（下地）。輪郭をぼかして「塗り残しのある絵の具」に見せる。
          id はこのイラスト専用（ページ内で 1 回しか描画されない）。 */}
      <defs>
        <filter id="aiIlloWash" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <g filter="url(#aiIlloWash)" opacity="0.8">
        <ellipse cx="37" cy="37" rx="30" ry="27" fill="#e3ede4" opacity="0.75" />
        <ellipse cx="71" cy="59" rx="22" ry="20" fill="#fbdfd1" opacity="0.8" />
        <ellipse cx="23" cy="66" rx="12" ry="10" fill="#f3e6d6" opacity="0.7" />
      </g>

      {/* 紙片のような小さな点（コラージュの余白要素） */}
      <circle cx="13" cy="70" r="2.4" fill="#cdd9cd" />
      <circle cx="88" cy="34" r="1.8" fill="#e8b7a4" />

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
 * （navy outline + pastel fill / ぼかした水彩の下地 / 透過背景 / 少し傾ける）で揃えている。
 * モチーフは「チェックを入れていく記入シートと鉛筆」。
 */
function WorksheetIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden>
      <defs>
        <filter id="wsIlloWash" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <g filter="url(#wsIlloWash)" opacity="0.8">
        <ellipse cx="42" cy="42" rx="30" ry="29" fill="#dfeccf" opacity="0.8" />
        <ellipse cx="72" cy="66" rx="20" ry="18" fill="#f1e7d4" opacity="0.7" />
      </g>
      <circle cx="12" cy="30" r="2.2" fill="#cdd9cd" />

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
      <defs>
        <filter id="mkIlloWash" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <g filter="url(#mkIlloWash)" opacity="0.8">
        <ellipse cx="46" cy="44" rx="31" ry="28" fill="#f6e8c6" opacity="0.8" />
        <ellipse cx="26" cy="68" rx="18" ry="15" fill="#e4ece2" opacity="0.6" />
      </g>
      <circle cx="87" cy="64" r="2.1" fill="#e6d2a3" />

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
    <div className="min-h-dvh bg-worksheet-surface">
      {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、mobileのみこのheader（ロゴ＋タグライン） */}
      <header className="border-b border-[#e7ddc9] bg-worksheet-surface px-4 py-4 sm:px-6 lg:hidden">
        <MobileBrandHeader />
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-6">
        <Link
          href="/mypage"
          className="text-[13px] font-medium text-[#2b2a27] underline decoration-[#2b2a27]/30 underline-offset-2 transition-colors hover:decoration-[#2b2a27]"
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
            gap は従来と同じ（カード間 16px / 左右 24px）で、右カラムは self-start で高さを揃えない。 */}
        <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] lg:gap-x-6 lg:gap-y-4">
            {/* AI相談（PC: 左カラム 1 段目） */}
            <section
              style={CARD_SURFACE.chat}
              className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7 lg:col-start-1 lg:row-start-1 lg:min-h-[160px]`}
            >
              <AiConsultIllustration className={CARD_ICON_CLASS} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#2b3a55]">AI相談</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-[#6b6357]">
                  AIカウンセラーと話しながら、気持ちや希望を整理し、自分に合う学校や留学の形を見つけます。
                </p>
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

            {/* Worksheet（PC: 左カラム 2 段目） */}
            <section
              style={CARD_SURFACE.worksheet}
              className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7 lg:col-start-1 lg:row-start-2 lg:min-h-[160px]`}
            >
              <WorksheetIllustration className={CARD_ICON_CLASS} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#2b3a55]">Worksheet</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-[#6b6357]">
                  設問に答えながら、留学の目的・条件・優先順位を、自分のペースで整理していきます。
                </p>
                {/* 既存 PlanWorksheetProgress はロジック不変。表示される時だけ薄い pill に見せる wrapper。 */}
                <div className="[&>p]:m-0 [&>p]:mt-2 [&>p]:inline-block [&>p]:rounded-full [&>p]:bg-[#eef1ec] [&>p]:px-2.5 [&>p]:py-0.5 [&>p]:text-[11px] [&>p]:text-[#5b5750]">
                  <PlanWorksheetProgress planId={typedPlan.id} karte={karte} serverWorksheet={worksheet} />
                </div>
              </div>
              <Link
                href={`/plans/${typedPlan.id}/worksheet`}
                className="shrink-0 self-start rounded-full border border-[#2b3a55]/30 bg-white px-6 py-2.5 text-center text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:self-center"
              >
                見直す →
              </Link>
            </section>

            {/* About This Plan（PC: 右カラム。高さは揃えず self-start のまま）。手描き・紙もの装飾（ピン / 星 / 波線下線 / 破れた下辺）は持たず、
                落ち着いた panel として見せる。他 3 枚（ピーチ / セージ / クリーム）に対しここだけラベンダーで、
                Plan の要約であることをおだやかに示す（＝残す「特別感」はこの地色だけ）。 */}
            <section
              style={CARD_SURFACE.about}
              className={`${ABOUT_CARD} p-5 sm:p-6 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:min-h-[220px] lg:self-start`}
            >
              <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[#1f2d43] sm:text-[24px]">
                About This Plan
              </h2>

              <dl className="mt-4 divide-y divide-[#e6e1d8]">
                <div className="flex items-center justify-between gap-3 py-3.5 first:pt-2">
                  <dt className="inline-flex shrink-0 items-center gap-2 text-[15px] font-medium text-[#625c54]">
                    <PinIcon className="h-[18px] w-[18px] text-[#7c766d]" />
                    行き先
                  </dt>
                  <dd className="min-w-0 text-right text-[15px] font-semibold text-[#1f2d43] sm:text-base">
                    {destinationCity ? toCityChipText(destinationCity) : "これから整理"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3.5">
                  <dt className="inline-flex shrink-0 items-center gap-2 text-[15px] font-medium text-[#625c54]">
                    <ClockIcon className="h-[18px] w-[18px] text-[#7c766d]" />
                    出発の目安
                  </dt>
                  <dd className="min-w-0 text-right text-[15px] font-semibold text-[#1f2d43] sm:text-base">
                    {summary.departureTiming ? toDeparturePlanInfoText(summary.departureTiming) : "これから整理"}
                  </dd>
                </div>
              </dl>

              <Link
                href={`/plans/${typedPlan.id}/my-plan`}
                className="mt-4 inline-block text-xs font-medium text-[#2b3a55] underline decoration-[#2b3a55]/30 underline-offset-2 transition-colors hover:decoration-[#2b3a55]"
              >
                My Planを見る →
              </Link>
            </section>

            {/* My Karte（PC: 左カラム 3 段目 = Worksheet の直下） */}
            {/* 内部は grid。mobile は従来どおり 2 列で「アイコン＋見出しの行 → カード幅いっぱいの説明文 → ボタン」。
                PC（lg 以上）だけ 3 列（アイコン / テキスト / CTA）に切り替え、AI相談 / Worksheet と同じ
                「アイコン左・テキスト中央・CTA が右端」の視覚リズムに揃える。
                アイコンと CTA は行をまたいで縦中央、テキスト列だけが伸縮する（minmax(0,1fr)）。
                アイコン幅（CARD_ICON_CLASS）・文言・route・card chrome は変更していない。 */}
            <section
              style={CARD_SURFACE.myKarte}
              className={`${CARD} overflow-hidden grid grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-4 p-5 sm:p-6 lg:col-start-1 lg:row-start-3 lg:min-h-[165px] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:content-center lg:gap-x-6 lg:p-7`}
            >
              <MyKarteIllustration className={`${CARD_ICON_CLASS} col-start-1 row-start-1 lg:row-span-3 lg:self-center`} />
              <h2 className="col-start-2 row-start-1 min-w-0 text-lg font-bold text-[#2b3a55]">My Karte</h2>
              <p className="col-span-2 col-start-1 row-start-2 mt-2 text-[15px] leading-relaxed text-[#6b6357] lg:col-span-1 lg:col-start-2 lg:mt-1">
                考えたことや決めたことを、相談や共有に使いやすい資料にまとめます。自分の考えを振り返るときにも役立ちます。
              </p>
              <Link
                href={`/plans/${typedPlan.id}/documents`}
                className="col-span-2 col-start-1 row-start-3 mt-3 inline-block justify-self-start rounded-full border border-[#2b3a55]/30 bg-white px-5 py-2 text-sm font-medium text-[#2b3a55] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:mt-0 lg:self-center lg:justify-self-end"
              >
                資料を見る →
              </Link>
            </section>
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
          {/* Plan の整理用。確認ダイアログで「消えるもの」を示してから削除する（一覧のカードメニューと同じダイアログ）。 */}
          <div className="w-full">
            <DeletePlanButton planId={typedPlan.id} planTitle={typedPlan.title} userId={user.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
