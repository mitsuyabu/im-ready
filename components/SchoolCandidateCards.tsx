import Image from "next/image";
import Link from "next/link";
import type { MyPlanSchoolCandidate } from "@/lib/myPlanView";
import type { BlueprintSchool, BlueprintSchoolStatus } from "@/lib/planBlueprint";

/**
 * My Plan「School & English」で、まだ学校を保存していないときに出す候補校カード。
 * School Comparison 上部と同じ 3 枚の背景画像資産を再利用し、表示順に 01 / 02 / 03 を当てる。
 *
 * 表示するのは既存の候補データ（karte.proposals.presented × 学校マスタ）だけ。fake は入れない。
 * 各カードは School Comparison へのリンク（比較 → そこから My Plan 保存へつながる）。
 * 長い reason はカード内では短く clip。
 */

const CARD_IMAGE = [
  "/school-comparison-cards/school-01-sage.webp",
  "/school-comparison-cards/school-02-blue.webp",
  "/school-comparison-cards/school-03-sand.webp",
];

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** カードの一言メモ。reason を機械的に短くするだけ（要約・生成はしない）。 */
function shortMemo(reason: string | null): string | null {
  if (!reason) return null;
  const head = reason.trim().split(/[。．.\n]/)[0].trim();
  const base = head.length > 0 ? head : reason.trim();
  return base.length > 34 ? `${base.slice(0, 34)}…` : base;
}

const STATUS_JA: Record<BlueprintSchoolStatus, string> = {
  considering: "検討中",
  preferred: "第一候補",
  selected: "決定",
};
const SOURCE_JA: Record<BlueprintSchool["source"], string> = {
  school_comparison: "School Comparison から",
  proposal: "AIの提案から",
};

/**
 * 保存済み学校のメインカード（A-1）。このプランで軸にしている学校を、画像カードで前面に出す。
 * 表示専用（status 変更 / 外すは下の EditableSchools が担う）。
 */
export function SavedSchoolMainCard({
  school,
  englishNote,
}: {
  school: BlueprintSchool;
  englishNote: string | null;
}) {
  const meta = [school.city].filter((v): v is string => Boolean(v));
  return (
    <div className="relative aspect-[1676/938] overflow-hidden rounded-[18px] shadow-[0_1px_3px_rgba(30,28,24,0.08)]">
      <Image
        src={CARD_IMAGE[0]}
        alt=""
        fill
        sizes="(min-width: 640px) 60vw, 92vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0">
        <div className="absolute left-[38%] right-[6%] top-[10%] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:left-[40%] sm:right-[8%]">
          <span className="inline-flex rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
            {STATUS_JA[school.status]}
          </span>
          <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base">
            {school.name}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 line-clamp-1 text-xs text-white/85">{meta.join(" ・ ")}</p>
          )}
          <p className="mt-0.5 line-clamp-1 text-[10px] text-white/75">{SOURCE_JA[school.source]}</p>
          {englishNote && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/80">{englishNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SchoolCandidateCards({
  candidates,
  comparisonHref,
}: {
  candidates: MyPlanSchoolCandidate[];
  comparisonHref: string;
}) {
  const top = candidates.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {top.map((c, i) => {
        const meta = [c.city, c.category].filter((v): v is string => Boolean(v));
        const memo = shortMemo(c.reason);
        return (
          <Link
            key={c.key}
            href={comparisonHref}
            className="group relative block aspect-[1676/938] overflow-hidden rounded-[18px] shadow-[0_1px_2px_rgba(30,28,24,0.06)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcfbf8]"
          >
            <Image
              src={CARD_IMAGE[i] ?? CARD_IMAGE[0]}
              alt=""
              fill
              sizes="(min-width: 640px) 45vw, 92vw"
              className="object-cover"
            />
            {/* 学校情報は動的データ。背景画像の学校イラスト（左〜約36%）・番号・右の波線に重ねない
                よう右寄せ。番号（01/02/03）は画像側が持つ。 */}
            <div className="absolute inset-0">
              <div className="absolute left-[38%] right-[6%] top-[10%] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:left-[40%] sm:right-[8%]">
                <p className="line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base">
                  {c.name}
                </p>
                {c.nameJa && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/85">{c.nameJa}</p>
                )}
                {meta.length > 0 && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/85">{meta.join(" ・ ")}</p>
                )}
                {memo && (
                  <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-white/80">{memo}</p>
                )}
              </div>
              <span className="absolute bottom-[12%] left-[20%] inline-flex items-center gap-1 text-sm font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                比較する
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
