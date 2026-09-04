import Image from "next/image";
import type { BlueprintSchool, BlueprintSchoolStatus } from "@/lib/planBlueprint";

/**
 * My Plan「School & English」の保存済み学校メインカード。
 * このプランで軸にしている 1 校を、School Comparison と同じ背景画像資産で前面表示する（表示専用）。
 * status 変更 / 外すは下の EditableSchools が担う。候補校はここには出さない（School Comparison の役割）。
 */

const CARD_IMAGE = "/school-comparison-cards/school-01-sage.webp";

const STATUS_JA: Record<BlueprintSchoolStatus, string> = {
  considering: "検討中",
  preferred: "第一候補",
  selected: "決定",
};
const SOURCE_JA: Record<BlueprintSchool["source"], string> = {
  school_comparison: "School Comparison から",
  proposal: "AIの提案から",
};

export default function SavedSchoolMainCard({
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
        src={CARD_IMAGE}
        alt=""
        fill
        sizes="(min-width: 640px) 60vw, 92vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0">
        <div className="absolute left-[38%] right-[6%] top-[10%] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:left-[40%] sm:right-[8%]">
          <span className="inline-flex rounded-full bg-white/30 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
            {STATUS_JA[school.status]}
          </span>
          <p className="mt-1 line-clamp-2 text-base font-semibold leading-snug sm:text-[17px]">
            {school.name}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 line-clamp-1 text-[13px] text-white/90">{meta.join(" ・ ")}</p>
          )}
          <p className="mt-0.5 line-clamp-1 text-[11px] text-white/80">{SOURCE_JA[school.source]}</p>
          {englishNote && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-white/85">{englishNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}
