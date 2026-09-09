import Image from "next/image";
import Link from "next/link";
import { buildDestinationLine, buildStatusPillText } from "@/components/PlanCard";
import { getPlanHeroImage } from "@/lib/planHeroImage";

/**
 * HOME（/mypage）専用のPlanカード。共有された参考HOMEデザインに寄せた editorial 版:
 * コンパクト・serif number・カード中〜下寄りの title・下部に status/更新日・左下に丸い arrow。
 * デスクトップは 4 列一覧を前提にサイズ・内部余白を詰めている（Mindtrip の Featured guides 相当の密度）。
 * カラーは index による decorative variation（ivory / dark / blue）で、**意味（status/active）は
 * 一切持たせない**。
 *
 * 表示するのは実データから安全に取れるものだけ:
 *   title / 行き先・時期（buildDestinationLine）/ status（decision.stage が stated のときだけ「検討中」）/
 *   最終更新テキスト。
 * Worksheet 進捗（localStorage のみ）・country/type/duration（カラムが無い）・active/進行中
 *（概念が無い）・overflow menu（機能が無い）は扱わない。fake データは作らない。
 *
 * card 全体が 1 つの Link。内部に別の Link / button は置かない（arrow は装飾＝aria-hidden）。
 * 写真は使わない。装飾は CSS/SVG のみ。hooks を持たない純粋表示コンポーネント。
 */

export type HomePlanCardVariant = "ivory" | "dark" | "blue";

/** 表示順（0始まり）から decorative variant を決める。意味論は無い。 */
export function homePlanCardVariant(order: number): HomePlanCardVariant {
  return (["ivory", "dark", "blue"] as const)[((order % 3) + 3) % 3];
}

export type HomePlanCardData = {
  id: string;
  /** 表示順の連番（1始まり）。装飾 number と variant に使う。 */
  index: number;
  title: string;
  /** certainty==="stated" のときだけ。無ければ null */
  city: string | null;
  departureTiming: string | null;
  stage: string | null;
  /** lib/planActivity.ts の formatLastUpdated 済みテキスト（例: "今日"）。 */
  lastUpdatedText: string | null;
};

type Theme = {
  surface: string;
  ink: string;
  secondary: string;
  number: string;
  pill: string;
  arrow: string;
  divider: string;
};

const THEMES: Record<HomePlanCardVariant, Theme> = {
  ivory: {
    surface: "bg-[#f5f0e7] border border-[#e7decd]",
    ink: "text-[#2c2a25]",
    secondary: "text-[#655f54]",
    number: "text-[#2c2a25]/[0.12]",
    pill: "bg-[#e7dcc6] text-[#4a4436]",
    arrow: "border-[#cfc4ae] text-[#2c2a25]",
    divider: "border-[#e7decd]",
  },
  dark: {
    surface:
      "bg-[#1f2b38] border border-white/10 shadow-[0_14px_36px_-16px_rgba(31,43,56,0.55)]",
    ink: "text-white",
    secondary: "text-white/70",
    number: "text-white/[0.14]",
    pill: "bg-white/12 text-white/90",
    arrow: "border-white/30 text-white",
    divider: "border-white/12",
  },
  blue: {
    surface: "bg-[#e9eef3] border border-[#d7dfe7]",
    ink: "text-[#25303a]",
    secondary: "text-[#5b6873]",
    number: "text-[#25303a]/[0.12]",
    pill: "bg-[#d8e2ea] text-[#3a4753]",
    arrow: "border-[#c2ccd6] text-[#25303a]",
    divider: "border-[#d7dfe7]",
  },
};

/** variant ごとの editorial な抽象装飾（contour / arcs / soft circle）。画像 asset は使わない。 */
function Decoration({ variant }: { variant: HomePlanCardVariant }) {
  if (variant === "dark") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 220 220"
        className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 text-white/[0.07]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <ellipse cx="150" cy="80" rx="96" ry="72" />
        <ellipse cx="150" cy="80" rx="72" ry="53" />
        <ellipse cx="150" cy="80" rx="48" ry="35" />
        <ellipse cx="150" cy="80" rx="26" ry="18" />
        <ellipse cx="150" cy="80" rx="8" ry="5" />
      </svg>
    );
  }
  if (variant === "blue") {
    return (
      <>
        <svg
          aria-hidden
          viewBox="0 0 220 220"
          className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 text-[#25303a]/[0.07]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        >
          <circle cx="110" cy="110" r="104" />
          <circle cx="110" cy="110" r="72" />
          <circle cx="110" cy="110" r="40" />
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-[#f0c3ab]/45"
        />
      </>
    );
  }
  // ivory: flowing contour lines
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 160"
      className="pointer-events-none absolute -right-8 top-4 h-52 w-64 text-[#2c2a25]/[0.08]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <path d="M-10 34 C 46 4, 120 66, 240 24" />
      <path d="M-10 62 C 46 32, 120 94, 240 52" />
      <path d="M-10 90 C 46 60, 120 122, 240 80" />
      <path d="M-10 118 C 46 88, 120 150, 240 108" />
    </svg>
  );
}

export default function HomePlanCard({ plan }: { plan: HomePlanCardData }) {
  const destination = buildDestinationLine(plan.city, plan.departureTiming);
  const statusText = buildStatusPillText(plan.stage);
  const number = String(plan.index).padStart(2, "0");
  const variant = homePlanCardVariant(plan.index - 1);
  const t = THEMES[variant];
  // 表示中の destination と同じ値（plan.city）で既存 helper が都市画像を決定的に選ぶ。
  // 対応画像が無い都市・都市未定なら null → 従来の decorative カードへ fallback。
  const heroImage = getPlanHeroImage(plan.city);

  return (
    <Link
      href={`/plans/${plan.id}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-[20px] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent ${
        heroImage
          ? "min-h-[300px] sm:min-h-[326px] lg:min-h-[344px]"
          : "min-h-[215px] sm:min-h-[235px] lg:min-h-[255px]"
      } ${t.surface}`}
    >
      {heroImage && (
        <div className="relative h-[104px] w-full shrink-0 sm:h-[116px]">
          <Image
            src={heroImage}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
          {/* 写真と本文の境目をなじませる薄いフェードのみ。写真はほぼそのまま見せる（§8）。 */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/15 to-transparent"
          />
        </div>
      )}

      <div className="relative flex flex-1 flex-col p-5 sm:p-6">
        {!heroImage && <Decoration variant={variant} />}

        <span
          aria-hidden
          className={`relative font-serif text-4xl leading-none sm:text-5xl lg:text-6xl ${t.number}`}
        >
          {number}
        </span>

        <div className="relative mt-auto pt-6">
          <h2 className={`line-clamp-2 font-serif text-xl font-normal leading-snug ${t.ink}`}>
            {plan.title}
          </h2>
          <p className={`mt-1.5 line-clamp-2 text-[13px] leading-relaxed ${t.secondary}`}>
            {destination.showPin && <span aria-hidden>📍 </span>}
            {destination.text}
          </p>

          <div className={`mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs ${t.divider}`}>
            {statusText && (
              <span className={`rounded-full px-2 py-0.5 font-medium ${t.pill}`}>{statusText}</span>
            )}
            {plan.lastUpdatedText && <span className={t.secondary}>更新 {plan.lastUpdatedText}</span>}
          </div>

          <span
            aria-hidden
            className={`mt-3 flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-transform duration-150 group-hover:translate-x-0.5 ${t.arrow}`}
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
