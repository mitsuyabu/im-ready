import Image from "next/image";
import Link from "next/link";
import { buildDestinationLine, buildStatusPillText } from "@/components/PlanCard";
import { getPlanCoverImage } from "@/lib/planCover";
import { toCityChipText, toDeparturePlanInfoText } from "@/lib/planHeroImage";

/* 行き先 / 時期 行の line icon（AppNav と同系の hand-rolled SVG。小さめ・stroke 1.8）。 */
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * HOME（/mypage）専用のPlanカード。「これから行くかもしれない都市を眺めるカード」を狙う:
 * destination の都市に対応する既存カバー画像（lib/planCover.ts の getPlanCoverImage →
 * public/plan-covers/<city>.png）を **カード全面の背景**（absolute inset-0 の next/image）に敷き、
 * 上 ~60% は写真をほぼそのまま見せ、下 ~40% にだけ暗めの gradient を掛けて Plan 情報
 *（title / 行き先・時期 / status / 更新日 / arrow）をまとめる。overlay は全カード共通で、
 * 写真を variant 色で強く覆わない（variant は fallback カードの装飾トーンとしてのみ使う）。
 * 対応画像が無い / 都市未定なら従来の decorative カード（Decoration SVG ＋ variant surface）へ
 * fallback。card 全体が 1 つの Link。hooks を持たない純粋表示コンポーネント。fake データは作らない。
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
};

/** 画像なし fallback カードでのみ使う variant トーン（画像ありカードは共通 white chrome）。 */
const THEMES: Record<HomePlanCardVariant, Theme> = {
  ivory: {
    surface: "bg-[#f5f0e7] border border-[#e7decd]",
    ink: "text-[#2c2a25]",
    secondary: "text-[#655f54]",
    number: "text-[#2c2a25]/[0.14]",
    pill: "bg-[#e7dcc6] text-[#4a4436]",
    arrow: "border-[#cfc4ae] text-[#2c2a25]",
  },
  dark: {
    surface:
      "bg-[#1f2b38] border border-white/10 shadow-[0_14px_36px_-16px_rgba(31,43,56,0.55)]",
    ink: "text-white",
    secondary: "text-white/70",
    number: "text-white/[0.16]",
    pill: "bg-white/12 text-white/90",
    arrow: "border-white/30 text-white",
  },
  blue: {
    surface: "bg-[#e9eef3] border border-[#d7dfe7]",
    ink: "text-[#25303a]",
    secondary: "text-[#5b6873]",
    number: "text-[#25303a]/[0.14]",
    pill: "bg-[#d8e2ea] text-[#3a4753]",
    arrow: "border-[#c2ccd6] text-[#25303a]",
  },
};

/** variant ごとの editorial な抽象装飾（contour / arcs / soft circle）。画像なし fallback でのみ表示。 */
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
  const statusText = buildStatusPillText(plan.stage);
  const number = String(plan.index).padStart(2, "0");
  const variant = homePlanCardVariant(plan.index - 1);
  const t = THEMES[variant];
  // 表示中の destination と同じ値（plan.city）で既存 helper（lib/planCover.ts）がカバー画像を
  // 決定的に選ぶ。対応画像が無い都市・都市未定なら null → 従来の decorative カードへ fallback。
  const coverImage = getPlanCoverImage(plan.city).imageSrc;
  const onImage = coverImage != null;

  // 行き先（都市名だけ）と時期を別行で。いずれも既存 helper を再利用（新しい算出はしない）。
  const cityText = plan.city ? toCityChipText(plan.city) : null;
  const timingText = plan.departureTiming ? toDeparturePlanInfoText(plan.departureTiming) : null;
  const noneText =
    !cityText && !timingText
      ? buildDestinationLine(plan.city, plan.departureTiming).text
      : null;

  // 画像ありカードは下部 gradient の上に載るため chrome は共通 white。fallback は variant トーン。
  const inkCls = onImage
    ? "text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.38)]"
    : t.ink;
  const secondaryCls = onImage
    ? "text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.32)]"
    : t.secondary;
  const numberCls = onImage ? "text-white/55" : t.number;
  const pillCls = onImage
    ? "bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-[2px]"
    : t.pill;
  const dateCls = onImage ? "text-white/80" : t.secondary;
  const arrowCls = onImage ? "border-white/45 text-white" : t.arrow;

  return (
    <Link
      href={`/plans/${plan.id}`}
      className={`group relative flex h-full min-h-[248px] flex-col overflow-hidden rounded-[20px] p-5 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent sm:min-h-[268px] sm:p-6 lg:min-h-[292px] ${t.surface}`}
    >
      {onImage ? (
        <>
          {/* 都市風景をカード全面の背景に。上 ~60% は写真をほぼそのまま見せる（§3/§4/§5/§17）。 */}
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="pointer-events-none select-none object-cover object-center brightness-[1.03] saturate-[1.05]"
          />
          {/* 明るい空などの白飛びを軽く抑えるだけの薄いフラット wash（写真は隠さない・§18/§22）。 */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/[0.05]" />
          {/* 下部だけ暗くして Plan 情報の可読性を確保（全カード共通・variant 色で覆わない・§5/§16）。 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[82%] bg-gradient-to-t from-black/80 via-black/24 to-transparent"
          />
        </>
      ) : (
        <Decoration variant={variant} />
      )}

      {/* decorative number: 写真の主役を隠さないよう左上に。少し大きめ・やや濃いめ（§1/§6/§7）。 */}
      <span
        aria-hidden
        className={`absolute left-4 top-3 z-10 font-serif leading-none sm:left-5 sm:top-3.5 ${
          onImage ? "text-[30px] sm:text-[34px]" : "text-4xl sm:text-5xl lg:text-6xl"
        } ${numberCls}`}
      >
        {number}
      </span>

      {/* Plan 情報はカード下部に集約（§8/§14/§21）: title → 📍行き先 → 📅時期 → metadata。 */}
      <div className="relative z-10 mt-auto">
        <h2 className={`line-clamp-2 font-serif text-xl font-semibold leading-snug ${inkCls}`}>
          {plan.title}
        </h2>

        <div className="mt-1 space-y-0.5 text-[13px] font-medium leading-snug">
          {cityText && (
            <p className={`flex items-center gap-1 ${secondaryCls}`}>
              <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cityText}</span>
            </p>
          )}
          {timingText && (
            <p className={`flex items-center gap-1 ${secondaryCls}`}>
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{timingText}</span>
            </p>
          )}
          {noneText && <p className={`truncate ${secondaryCls}`}>{noneText}</p>}
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {statusText && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${pillCls}`}>
              {statusText}
            </span>
          )}
          {plan.lastUpdatedText && (
            <span className={`min-w-0 truncate font-medium ${dateCls}`}>
              更新 {plan.lastUpdatedText}
            </span>
          )}
          <span
            aria-hidden
            className={`ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition-transform duration-150 group-hover:translate-x-0.5 ${arrowCls}`}
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
